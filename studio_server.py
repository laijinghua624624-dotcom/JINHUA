#!/usr/bin/env python3
"""Local content studio: Ark adapter, durable media, frame extraction, film assembly.
No credentials or uploaded files are served by the static-file handler.
"""
import base64
import concurrent.futures
import hashlib
import html
from html.parser import HTMLParser
import ipaddress
import json
import math
import mimetypes
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('LANCE_DATA_DIR', ROOT / '.lance-data'))
MEDIA = DATA / 'media'
ARK = 'https://ark.cn-beijing.volces.com/api/v3'
MAX_UPLOAD = 250 * 1024 * 1024
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2)
JOBS = {}
LOCK = threading.Lock()

def model_routes():
    return {role:{'model':os.environ.get(env,'').strip()} for role,env in {
        'director':'ARK_DIRECTOR_MODEL','refine':'ARK_REFINE_MODEL','image':'ARK_IMAGE_MODEL',
        'video':'ARK_VIDEO_MODEL','embedding':'ARK_EMBEDDING_MODEL','speech':'SPEECH_MODEL_VERSION'}.items()}

def route_model(role):
    routes=model_routes()
    if role not in routes:raise ValueError('未知模型分工')
    model=routes[role]['model']
    if role=='director' and not model:model=os.environ.get('ARK_TEXT_MODEL','').strip()
    if not model:raise ValueError(f'服务端未配置 {role} 模型ID；请在本机 .env 设置，不在前端填写密钥')
    if not re.fullmatch(r'[a-zA-Z0-9_.:-]{1,160}',model):raise ValueError('服务端模型ID格式无效')
    return model

def safe_error(error):
    message=str(error)
    for key in ('ARK_API_KEY','VOLC_ACCESS_KEY_ID','VOLC_SECRET_ACCESS_KEY','SPEECH_API_KEY','SPEECH_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY'):
        secret=os.environ.get(key,'')
        if secret:message=message.replace(secret,'[已隐藏]')
    message=re.sub(r'https?://\S+','[上游地址已隐藏]',message)
    return message[:500]

def load_env():
    path = ROOT / '.env'
    if path.exists():
        for line in path.read_text().splitlines():
            match = re.match(r'^([A-Z][A-Z0-9_]*)=(.*)$', line.strip())
            if match:
                os.environ.setdefault(match[1], match[2].strip().strip('\"\''))

def server_binding():
    host=os.environ.get('LANCE_BIND_HOST','127.0.0.1')
    origin=os.environ.get('LANCE_PUBLIC_ORIGIN','').rstrip('/')
    parsed=urllib.parse.urlparse(origin)
    if origin and (parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment):
        raise ValueError('LANCE_PUBLIC_ORIGIN 必须为不含路径的 HTTPS 来源地址')
    if host not in {'127.0.0.1','localhost','::1'} and (not origin or os.environ.get('LANCE_BEHIND_AUTH_PROXY')!='1'):
        raise ValueError('非本机监听必须配置 HTTPS 来源及带认证的反向代理；不可直接开放端口')
    return host,int(os.environ.get('LANCE_PORT',8000))

def media_path(name):
    if not re.fullmatch(r'[a-f0-9]{32}\.(?:mp4|mov|webm|jpg|jpeg|png|webp|pdf|mp3|wav|m4a|ogg|docx|txt|md)', name or ''):
        raise ValueError('媒体标识无效')
    path = MEDIA / name
    if not path.is_file():
        raise ValueError('本地素材不存在，请重新上传或恢复备份')
    return path

def ffprobe(path):
    if not shutil.which('ffprobe'):
        raise ValueError('需要 FFmpeg/ffprobe 才能核验图片、视频和音频')
    result = subprocess.run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)], capture_output=True, timeout=40)
    if result.returncode:
        raise ValueError('素材无法解码，请使用有效的图片或MP4视频')
    return json.loads(result.stdout)

def describe(path, source='upload'):
    ext = path.suffix.lower()
    if ext in {'.txt','.md'}:
        if path.stat().st_size>1024*1024:raise ValueError('文字资料最多1MB')
        path.read_text(encoding='utf-8-sig')
        return dict(localId=path.name,kind='text',verified=True,source=source)
    if ext=='.docx':
        with zipfile.ZipFile(path) as archive:
            if 'word/document.xml' not in archive.namelist():raise ValueError('无效DOCX文档')
        return dict(localId=path.name,kind='document',verified=True,source=source)
    if ext == '.pdf':
        if not path.read_bytes().startswith(b'%PDF-'):
            raise ValueError('无效的PDF文件')
        return dict(localId=path.name,kind='document',verified=True,source=source)
    probe = ffprobe(path)
    video = next((s for s in probe.get('streams',[]) if s.get('codec_type')=='video'),None)
    kind = 'image' if ext in {'.jpg','.jpeg','.png','.webp'} else ('video' if video else 'audio')
    if kind in ('image','video') and (not video or not video.get('width') or not video.get('height')):
        raise ValueError('未检测到有效画面')
    if kind=='image':
        decoded=subprocess.run(['ffmpeg','-v','error','-i',str(path),'-frames:v','1','-f','null','-'],capture_output=True,timeout=40)
        if decoded.returncode or decoded.stderr:raise ValueError('图片数据损坏，不能作为有效参考')
    duration = float(probe.get('format',{}).get('duration',0))
    if kind != 'image' and duration <= 0:
        raise ValueError('无法读取素材时长')
    return dict(localId=path.name,kind=kind,verified=True,source=source,duration=duration,width=(video or {}).get('width',0),height=(video or {}).get('height',0),hasAudio=any(s.get('codec_type')=='audio' for s in probe.get('streams',[])))

def document_text(name):
    path=media_path(name);ext=path.suffix.lower()
    if ext in {'.txt','.md'}:text=path.read_text(encoding='utf-8-sig')
    elif ext=='.docx':
        with zipfile.ZipFile(path) as archive:
            info=archive.getinfo('word/document.xml')
            if info.file_size>10*1024*1024:raise ValueError('DOCX正文超过10MB，请拆分资料')
            root=ET.fromstring(archive.read(info))
        ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
        text='\n'.join(''.join(p.itertext()) for p in root.iter(ns+'p'))
    elif ext=='.pdf':
        if not shutil.which('pdftotext'):raise ValueError('本机缺少pdftotext，原文件已归档；请安装后重试或上传TXT/DOCX')
        result=subprocess.run(['pdftotext','-f','1','-l','100','-layout',str(path),'-'],capture_output=True,timeout=60)
        if result.returncode:raise ValueError('PDF无法提取文字，可能加密或损坏，请上传可读文件')
        text=result.stdout.decode('utf-8','replace')
    else:raise ValueError('此文件只归档；支持TXT、Markdown、DOCX和文本PDF提取')
    if not text.strip():raise ValueError('未提取到文字；扫描件需要另行OCR或手动填写')
    return {'text':text.strip()[:60000],'notice':'最多前100页/60000字，请核对是否完整' if ext=='.pdf' or len(text)>60000 else ''}

def data_url(name):
    path=media_path(name)
    if path.stat().st_size>12*1024*1024:
        raise ValueError('单张参考图超过12MB，请压缩后上传')
    if describe(path)['kind']!='image':
        raise ValueError('模型参考必须使用图片，请先提取视频关键帧或上传尺寸图截图')
    return 'data:'+mimetypes.guess_type(path)[0]+';base64,'+base64.b64encode(path.read_bytes()).decode()

def ark_request(path, body, token, method='POST'):
    if not token:
        raise ValueError('服务端未配置 Ark API Key，请仅在本机 .env 设置 ARK_API_KEY')
    payload=json.dumps(body,ensure_ascii=False).encode() if body is not None else None
    request=urllib.request.Request(ARK+path,data=payload,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=240) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        # Do not echo credentials, full requests, or signed URLs.
        try:
            detail=json.loads(error.read()).get('error',{})
            message=detail.get('message','模型调用失败') if isinstance(detail,dict) else str(detail)
        except Exception:
            message='模型调用失败'
        raise ValueError(f'模型接口 {error.code}：{safe_error(message)}') from None

def public_url(url):
    parsed=urllib.parse.urlparse(url)
    if parsed.scheme!='https' or parsed.username or parsed.password:
        raise ValueError('上游媒体地址必须是公开HTTPS地址')
    for result in socket.getaddrinfo(parsed.hostname,parsed.port or 443):
        if not ipaddress.ip_address(result[4][0]).is_global:
            raise ValueError('上游返回了不可访问的媒体地址')
    return url

class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        public_url(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)

class LinkMetadataParser(HTMLParser):
    def __init__(self):
        super().__init__();self.title=[];self.in_title=False;self.meta={}
    def handle_starttag(self,tag,attrs):
        attrs={str(k).lower():v for k,v in attrs if v is not None}
        if tag.lower()=='meta':
            key=(attrs.get('property') or attrs.get('name') or '').lower()
            if key and key not in self.meta:self.meta[key]=attrs.get('content','').strip()
        if tag.lower()=='title':self.in_title=True
    def handle_endtag(self,tag):
        if tag.lower()=='title':self.in_title=False
    def handle_data(self,data):
        if self.in_title:self.title.append(data)

def normalize_video(path,source='upload'):
    meta=describe(path,source)
    if meta['kind']!='video':raise ValueError('链接未返回可解码的视频')
    normalized=MEDIA/(uuid.uuid4().hex+'.mp4')
    subprocess.run(['ffmpeg','-v','error','-i',str(path),'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-y',str(normalized)],check=True,capture_output=True,timeout=240)
    result=describe(normalized,source);result['originalLocalId']=path.name
    return result

def read_public(url,limit):
    request=urllib.request.Request(public_url(url),headers={'User-Agent':'Mozilla/5.0 LanceContentStudio/2.0','Accept':'text/html,video/*;q=0.9,*/*;q=0.5'})
    opener=urllib.request.build_opener(PublicRedirect())
    with opener.open(request,timeout=45) as response:
        final=public_url(response.geturl());content_type=response.headers.get_content_type().lower();suffix=Path(urllib.parse.urlparse(final).path).suffix.lower()
        effective=MAX_UPLOAD if content_type.startswith('video/') or (content_type=='application/octet-stream' and suffix in {'.mp4','.mov','.webm'}) else limit
        size=int(response.headers.get('Content-Length') or 0)
        if size>effective:raise ValueError('链接内容超过可解析大小')
        data=response.read(effective+1)
        if len(data)>effective:raise ValueError('链接内容超过可解析大小')
        return data,content_type,final,response.headers.get_content_charset() or 'utf-8'

def save_public_video(data,content_type,final):
    suffix=Path(urllib.parse.urlparse(final).path).suffix.lower()
    if content_type.startswith('video/'):
        ext={'video/mp4':'.mp4','video/quicktime':'.mov','video/webm':'.webm'}.get(content_type,suffix if suffix in {'.mp4','.mov','.webm'} else '.mp4')
    elif content_type=='application/octet-stream' and suffix in {'.mp4','.mov','.webm'}:ext=suffix
    else:raise ValueError('候选地址不是可直接下载的公开视频')
    MEDIA.mkdir(parents=True,exist_ok=True);target=MEDIA/(uuid.uuid4().hex+ext);target.write_bytes(data)
    try:return normalize_video(target,'link')
    except Exception:
        target.unlink(missing_ok=True);raise

def download_public_video(url):
    data,content_type,final,_=read_public(url,MAX_UPLOAD)
    return save_public_video(data,content_type,final)

def parse_public_link(url):
    url=public_url(str(url or '').strip())
    data,content_type,final,charset=read_public(url,2*1024*1024)
    if content_type.startswith('video/') or (content_type=='application/octet-stream' and Path(urllib.parse.urlparse(final).path).suffix.lower() in {'.mp4','.mov','.webm'}):
        asset=save_public_video(data,content_type,final)
        return {'url':url,'finalUrl':final,'title':Path(urllib.parse.urlparse(final).path).name or '链接视频','description':'','siteName':urllib.parse.urlparse(final).hostname,'asset':asset,'notice':'已解析并保存公开视频。'}
    if content_type not in {'text/html','application/xhtml+xml'}:raise ValueError('链接不是网页或可支持的视频直链')
    parser=LinkMetadataParser();parser.feed(data.decode(charset,'replace'))
    meta=parser.meta;title=meta.get('og:title') or meta.get('twitter:title') or ''.join(parser.title).strip()
    description=meta.get('og:description') or meta.get('twitter:description') or meta.get('description') or ''
    site=meta.get('og:site_name') or urllib.parse.urlparse(final).hostname
    asset=None;reason=''
    candidates=[]
    for key in ('og:video:secure_url','og:video:url','og:video','twitter:player:stream'):
        if meta.get(key):candidates.append(urllib.parse.urljoin(final,html.unescape(meta[key])))
    for candidate in dict.fromkeys(candidates):
        try:asset=download_public_video(candidate);break
        except Exception as error:reason=str(error)
    notice='已解析页面信息'
    if asset:notice+='，并保存页面公开视频。'
    else:notice+='；未取得可直接下载的公开视频，请手动上传原片。'
    return {'url':url,'finalUrl':final,'title':html.unescape(title)[:500],'description':html.unescape(description)[:4000],'siteName':html.unescape(site or '')[:200],'asset':asset,'notice':notice,'mediaNotice':reason[:300]}

def download_generated(url,ext):
    MEDIA.mkdir(parents=True,exist_ok=True)
    path=MEDIA/(uuid.uuid4().hex+ext)
    opener=urllib.request.build_opener(PublicRedirect())
    with opener.open(public_url(url),timeout=180) as response, path.open('wb') as out:
        total=0
        while True:
            chunk=response.read(1024*1024)
            if not chunk: break
            total+=len(chunk)
            if total>MAX_UPLOAD: raise ValueError('生成素材超过250MB上限')
            out.write(chunk)
    return describe(path,'ai')

def build_video_body(body,model):
    duration=int(body.get('duration',8))
    if duration<2 or duration>12: raise ValueError('视频时长必须为2–12秒')
    ratio=body.get('ratio','4:3')
    if ratio not in ('4:3','9:16','16:9'): raise ValueError('不支持的画幅')
    content=[{'type':'text','text':body['prompt']}]
    if body.get('reference'):
        content.append({'type':'image_url','image_url':{'url':data_url(body['reference'])},'role':'first_frame'})
    return {'model':model,'content':content,'duration':duration,'ratio':ratio,'watermark':False}

def image_size(body):
    size=body.get('size') or '2304x1728'
    if size not in {'2304x1728','1728x2304','1440x2560'}:
        raise ValueError('图片尺寸不支持')
    return size

def extract_frames(name):
    path=media_path(name)
    meta=describe(path)
    if meta['kind']!='video': raise ValueError('请上传视频后提取造型')
    result=[]
    for index in range(12):
        timestamp=meta['duration']*(index+0.5)/12
        target=MEDIA/(uuid.uuid4().hex+'.jpg')
        subprocess.run(['ffmpeg','-v','error','-ss',str(timestamp),'-i',str(path),'-frames:v','1','-vf','scale=960:-2','-y',str(target)],check=True,capture_output=True,timeout=45)
        item=describe(target,'video-frame');item['timestamp']=round(timestamp,2);item['sourceVideo']=name
        result.append(item)
    return result

def assemble(clips,bgm=None):
    if len(clips)!=25: raise ValueError('完整成片必须由25个分镜视频组成')
    dimensions={'4:3':(960,720),'9:16':(720,1280),'16:9':(1280,720)}
    with tempfile.TemporaryDirectory(prefix='lance-film-') as tmp:
        folder=Path(tmp);total=0
        for index,clip in enumerate(clips):
            source=media_path(clip['localId']);meta=describe(source)
            duration=float(clip['duration'])
            if not 2<=duration<=12 or meta['kind']!='video' or meta['duration']<duration-0.15:
                raise ValueError(f'第{index+1}镜视频不足脚本时长，不能拼接空白充数')
            total+=duration
            width,height=dimensions.get(clip.get('ratio','4:3'),(960,720))
            # Normalize each shot. Preserve audio when present, use silence only for silent inputs.
            command=['ffmpeg','-v','error','-i',str(source)]
            if not meta['hasAudio']: command+=['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']
            command+=['-map','0:v:0','-map','0:a:0' if meta['hasAudio'] else '1:a:0','-t',str(duration),'-vf',f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-y',str(folder/f'{index:02}.mp4')]
            subprocess.run(command,check=True,capture_output=True,timeout=180)
        manifest=folder/'concat.txt'
        manifest.write_text('\n'.join(f"file '{index:02}.mp4'" for index in range(25)))
        target=MEDIA/(uuid.uuid4().hex+'.mp4')
        command=['ffmpeg','-v','error','-f','concat','-safe','1','-i',str(manifest)]
        if bgm:
            sound=media_path(bgm)
            if describe(sound)['kind'] not in ('audio','video'): raise ValueError('配乐文件无效')
            command+=['-stream_loop','-1','-i',str(sound),'-filter_complex','[1:a]volume=0.20[b];[0:a][b]amix=inputs=2:duration=first[a]','-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-t',str(total)]
        else: command+=['-c','copy']
        command+=['-movflags','+faststart','-y',str(target)]
        subprocess.run(command,check=True,capture_output=True,timeout=180)
    return describe(target,'ai-assembly')

def run_job(fn,*args):
    jid=uuid.uuid4().hex
    JOBS[jid]={'status':'running'}
    def work():
        try: JOBS[jid]={'status':'succeeded','result':fn(*args)}
        except Exception as error: JOBS[jid]={'status':'failed','error':safe_error(error)}
    POOL.submit(work)
    return {'jobId':jid}

def speech_headers():
    headers={'Content-Type':'application/json','X-Api-Resource-Id':os.environ.get('SPEECH_RESOURCE_ID','volc.bigasr.auc_turbo'),
             'X-Api-Request-Id':str(uuid.uuid4()),'X-Api-Sequence':'-1'}
    if headers['X-Api-Resource-Id']!='volc.bigasr.auc_turbo':raise ValueError('当前适配器仅支持录音文件极速识别资源；标准版需单独适配')
    if os.environ.get('SPEECH_API_KEY'):
        headers['X-Api-Key']=os.environ['SPEECH_API_KEY']
    elif os.environ.get('SPEECH_APP_ID') and os.environ.get('SPEECH_ACCESS_TOKEN'):
        headers.update({'X-Api-App-Key':os.environ['SPEECH_APP_ID'],'X-Api-Access-Key':os.environ['SPEECH_ACCESS_TOKEN']})
    else:raise ValueError('请在服务端配置豆包语音凭据；它与 Ark API Key 不通用')
    return headers

def transcribe_audio(name):
    headers=speech_headers();source=media_path(name);meta=describe(source)
    if meta['kind']!='audio' or not 0<meta['duration']<=7200 or source.stat().st_size>100*1024*1024:
        raise ValueError('转写只接收不超过2小时、100MB的音频；原录音未修改')
    # Browser WebM/M4A recordings are normalized privately; originals remain intact.
    with tempfile.TemporaryDirectory(prefix='lance-asr-') as folder:
        target=Path(folder)/'speech.mp3'
        subprocess.run(['ffmpeg','-v','error','-i',str(source),'-vn','-ac','1','-ar','16000','-b:a','32k','-y',str(target)],check=True,capture_output=True,timeout=180)
        if target.stat().st_size>20*1024*1024:raise ValueError('转换后的录音超过20MB，请分段转写')
        options={'model_name':'bigmodel'}
        if os.environ.get('SPEECH_MODEL_VERSION'):options['model_version']=os.environ['SPEECH_MODEL_VERSION']
        payload={'user':{'uid':'lance-local-studio'},'audio':{'data':base64.b64encode(target.read_bytes()).decode()},'request':options}
        request=urllib.request.Request('https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash',data=json.dumps(payload).encode(),headers=headers,method='POST')
        try:
            with urllib.request.urlopen(request,timeout=240) as response:
                code=response.headers.get('X-Api-Status-Code','')
                if code!='20000000':raise ValueError('语音识别未成功，状态码：'+code)
                raw=json.loads(response.read())
        except urllib.error.HTTPError as error:raise ValueError(f'语音接口HTTP {error.code}，请核对服务端权限和资源配置') from None
    result=raw.get('result',{});text=result.get('text','')
    if not isinstance(text,str) or not text.strip():raise ValueError('未返回有效文字，原录音已保留')
    return {'text':text,'utterances':result.get('utterances',[]),'source':'doubao-asr','modelVersion':os.environ.get('SPEECH_MODEL_VERSION','未指定，按账户默认版本'),'localId':name}

EMBED_LOCK=threading.Lock()

def cached_embedding(space,text,image_id=None):
    if space not in ('personal','xinxuan'):raise ValueError('检索空间无效')
    if not isinstance(text,str) or len(text)>6000:raise ValueError('每条检索描述最多6000字')
    model=route_model('embedding');content=[]
    if text.strip():content.append({'type':'text','text':text})
    image_hash=''
    if image_id:
        path=media_path(image_id);image_hash=hashlib.sha256(path.read_bytes()).hexdigest()
        content.append({'type':'image_url','image_url':{'url':data_url(image_id)}})
    if not content:raise ValueError('没有可索引的文字或图片')
    fingerprint=hashlib.sha256(json.dumps([model,text,image_hash],ensure_ascii=False).encode()).hexdigest()
    folder=DATA/'embeddings'/space;folder.mkdir(parents=True,exist_ok=True)
    cache=folder/(fingerprint+'.json')
    with EMBED_LOCK:
        if cache.is_file():return json.loads(cache.read_text())
        raw=ark_request('/embeddings/multimodal',{'model':model,'input':content,'encoding_format':'float'},os.environ.get('ARK_API_KEY',''))
        vector=raw.get('data',{}).get('embedding')
        if not isinstance(vector,list) or not vector or any(not isinstance(x,(int,float)) or not math.isfinite(x) for x in vector):
            raise ValueError('检索模型没有返回有效向量')
        norm=math.sqrt(sum(x*x for x in vector))
        if not norm:raise ValueError('检索向量为空')
        vector=[x/norm for x in vector]
        cache.write_text(json.dumps(vector));cache.chmod(0o600)
        return vector

def semantic_search(body):
    space=body.get('scope');items=body.get('items');query=body.get('query','')
    if space not in ('personal','xinxuan'):raise ValueError('检索空间无效')
    if not isinstance(query,str) or not query.strip() or len(query)>1000:raise ValueError('请输入1–1000字的审美描述')
    if not isinstance(items,list) or not 1<=len(items)<=100:raise ValueError('一次检索限定1–100条参考，请先选择项目文件夹缩小范围')
    if any(not isinstance(i,dict) or not isinstance(i.get('id'),str) or not i['id'] for i in items):raise ValueError('参考条目无效')
    if len({i['id'] for i in items})!=len(items):raise ValueError('参考条目重复')
    query_vector=cached_embedding(space,query);matches=[]
    for item in items:
        vector=cached_embedding(space,item.get('text',''),item.get('imageId'))
        if len(query_vector)!=len(vector):raise ValueError('检索向量维度不一致，请检查模型配置')
        matches.append({'id':item['id'],'score':sum(a*b for a,b in zip(query_vector,vector))})
    return {'scope':space,'matches':sorted(matches,key=lambda x:x['score'],reverse=True)[:24],'model':route_model('embedding'),'indexed':len(items)}

class Handler(BaseHTTPRequestHandler):
    def allowed(self):
        host=self.headers.get('Host','')
        origin=self.headers.get('Origin')
        permitted={f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}
        permitted.update(filter(None,os.environ.get('LANCE_ALLOWED_ORIGINS','').split(',')))
        public_origin=os.environ.get('LANCE_PUBLIC_ORIGIN','').rstrip('/')
        if public_origin:
            # Public deployment is same-origin behind an authenticated proxy.
            permitted={public_origin}
        return host in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'} and (not origin or origin in permitted)

    def send_json(self,value,status=200):
        if isinstance(value,dict) and value.get('error'):value={**value,'error':safe_error(value['error'])}
        data=json.dumps(value,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store')
        origin=self.headers.get('Origin')
        if origin and self.allowed(): self.send_header('Access-Control-Allow-Origin',origin)
        self.end_headers();self.wfile.write(data)

    def do_OPTIONS(self):
        if not self.allowed(): return self.send_json({'error':'来源不被允许'},403)
        self.send_response(204);self.send_header('Access-Control-Allow-Origin',self.headers.get('Origin',''));self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS');self.send_header('Access-Control-Allow-Headers','Content-Type,Authorization,X-File-Name');self.end_headers()

    def do_GET(self):
        if not self.allowed(): return self.send_json({'error':'来源不被允许'},403)
        path=urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        try:
            if path=='/api/health':
                routes=model_routes();routes['director']['model']=routes['director']['model'] or os.environ.get('ARK_TEXT_MODEL','')
                return self.send_json({'ok':True,'keyConfigured':bool(os.environ.get('ARK_API_KEY')),'routes':routes,'models':{'text':routes['director']['model'],'image':routes['image']['model'],'video':routes['video']['model']},'speechConfigured':bool(os.environ.get('SPEECH_API_KEY') or os.environ.get('SPEECH_APP_ID') and os.environ.get('SPEECH_ACCESS_TOKEN')),'ffmpeg':bool(shutil.which('ffmpeg') and shutil.which('ffprobe'))})
            if path=='/api/profile-seed':
                seed=DATA/'profile-seed.json'
                selected_scope=urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('scope',[''])[0]
                return self.send_json({'fields':json.loads(seed.read_text()).get(selected_scope,{}) if seed.is_file() and selected_scope in ('personal','xinxuan') else {}})
            if path.startswith('/api/jobs/'):
                return self.send_json(JOBS.get(path.split('/')[-1],{'status':'failed','error':'任务不存在或服务已重启，请重试'}))
            if path.startswith('/media/'): target=media_path(path[7:])
            else:
                name='index.html' if path=='/' else path.lstrip('/')
                if name not in {'index.html','legacy.html','studio.js','studio-security.js','studio.css','studio-core.js','studio-reverse.js','studio-aesthetic.js','studio-aesthetic-ui.js','studio-folders.js','studio-folders-ui.js','studio-aesthetic.css','studio-profile.js','studio-inspiration.js','studio-fragments.js','studio-fragments-ui.js','studio-ppt.js','vendor/presentation.js','lance_qrcode_public.png','lance_qrcode.png','lance_intro.mp4','api-guide.html','tutorial.html','deliverables/Lance专场整体汇报模板_v1.pptx','deliverables/Lance单条剧本汇报模板_v1.pptx'}:
                    return self.send_json({'error':'文件不存在'},404)
                target=ROOT/name
            if not target.is_file(): return self.send_json({'error':'文件不存在'},404)
            size=target.stat().st_size;start=0;end=size-1;partial=False
            range_header=self.headers.get('Range','')
            if range_header:
                match=re.fullmatch(r'bytes=(\d+)-(\d*)',range_header)
                if not match: return self.send_json({'error':'无效范围'},416)
                start=int(match[1]);end=min(int(match[2]) if match[2] else end,end);partial=True
                if start>end:return self.send_json({'error':'范围超出文件'},416)
            self.send_response(206 if partial else 200)
            self.send_header('Content-Type',mimetypes.guess_type(target)[0] or 'application/octet-stream');self.send_header('Content-Length',str(end-start+1));self.send_header('Accept-Ranges','bytes');self.send_header('X-Content-Type-Options','nosniff')
            if partial:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            if self.headers.get('Origin'):self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
            self.end_headers()
            with target.open('rb') as stream:
                stream.seek(start);remaining=end-start+1
                while remaining:
                    data=stream.read(min(remaining,1024*1024))
                    if not data:break
                    self.wfile.write(data);remaining-=len(data)
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception as error:self.send_json({'error':str(error)},400)

    def do_POST(self):
        if not self.allowed():return self.send_json({'error':'来源不被允许'},403)
        try:
            length=int(self.headers.get('Content-Length',0))
            if not 0<length<=MAX_UPLOAD:return self.send_json({'error':'上传为空或超过250MB'},413)
            MEDIA.mkdir(parents=True,exist_ok=True)
            if self.path=='/api/upload':
                name=urllib.parse.unquote(self.headers.get('X-File-Name',''))
                ext=Path(name).suffix.lower()
                if ext not in {'.mp4','.mov','.webm','.jpg','.jpeg','.png','.webp','.pdf','.mp3','.wav','.m4a','.ogg','.docx','.txt','.md'}:raise ValueError('支持图片、PDF/DOCX/TXT/MD、MP4/MOV/WebM视频和音频')
                target=MEDIA/(uuid.uuid4().hex+ext)
                target.write_bytes(self.rfile.read(length))
                # MediaRecorder's streaming WebM often has no duration header.
                # Normalize only an audio container with missing duration; retain its original.
                if ext in {'.webm','.ogg','.m4a','.wav','.mp3'}:
                    probe=ffprobe(target)
                    if not any(s.get('codec_type')=='video' for s in probe.get('streams',[])) and not float(probe.get('format',{}).get('duration') or 0):
                        normalized=MEDIA/(uuid.uuid4().hex+'.mp3')
                        subprocess.run(['ffmpeg','-v','error','-i',str(target),'-vn','-c:a','libmp3lame','-b:a','128k','-y',str(normalized)],check=True,capture_output=True,timeout=180)
                        target=normalized
                meta=describe(target)
                if meta['kind']=='video':meta=normalize_video(target)
                return self.send_json(meta)
            if length>20*1024*1024:raise ValueError('生成请求超过20MB')
            body=json.loads(self.rfile.read(length))
            if not isinstance(body,dict):raise ValueError('请求格式错误')
            if self.path=='/api/transcribe':
                speech_headers()
                return self.send_json(run_job(transcribe_audio,body.get('localId')))
            if self.path=='/api/reference/search':
                route_model('embedding')
                return self.send_json(run_job(semantic_search,body))
            if self.path=='/api/document/text':return self.send_json(document_text(body.get('localId')))
            if self.path=='/api/link/import':return self.send_json(parse_public_link(body.get('url')))
            token=os.environ.get('ARK_API_KEY','')
            if self.path=='/api/chat':
                purpose=body.get('purpose','director')
                if purpose not in ('director','refine'):raise ValueError('未知文本模型分工')
                model=route_model(purpose)
                content=[{'type':'text','text':str(body.get('prompt',''))}]
                for name in body.get('references',[])[:12]:content.append({'type':'image_url','image_url':{'url':data_url(name)}})
                result=ark_request('/chat/completions',{'model':model,'messages':[{'role':'system','content':'你是Lance的内容总监助理。只输出完整JSON，严格遵守用户结构。区分已知事实与待确认事项，不编造场地尺寸、服装品牌、预算报价或产品性能。'}, {'role':'user','content':content}],'max_tokens':12000,'temperature':0.65},token)
                return self.send_json({'text':result.get('choices',[{}])[0].get('message',{}).get('content',''),'purpose':purpose,'model':model,'usage':result.get('usage',{})})
            if self.path=='/api/image':
                model=route_model('image')
                payload={'model':model,'prompt':body['prompt'],'size':image_size(body),'response_format':'url','watermark':False}
                refs=body.get('references',[])[:4]
                if refs:payload['image']=[data_url(name) for name in refs]
                result=ark_request('/images/generations',payload,token)
                data=result.get('data',[])
                if not data or not data[0].get('url'):raise ValueError('模型未返回图片，原素材已保留')
                return self.send_json(download_generated(data[0]['url'],'.jpg'))
            if self.path=='/api/video':
                model=route_model('video')
                result=ark_request('/contents/generations/tasks',build_video_body(body,model),token)
                if not result.get('id'):raise ValueError('未返回视频任务ID')
                return self.send_json({'taskId':result['id']})
            if self.path=='/api/video/status':
                task=body['taskId']
                if not re.fullmatch(r'[a-zA-Z0-9_-]{1,150}',task):raise ValueError('任务ID无效')
                cache=DATA/('task-'+hashlib.sha256(task.encode()).hexdigest()+'.json')
                if cache.exists():return self.send_json(json.loads(cache.read_text()))
                result=ark_request('/contents/generations/tasks/'+task,None,token,'GET')
                status=result.get('status')
                if status=='succeeded':
                    video_url=result.get('content',{}).get('video_url')
                    if not video_url:raise ValueError('视频任务完成但未返回媒体地址')
                    with LOCK:
                        if cache.exists():return self.send_json(json.loads(cache.read_text()))
                        asset=download_generated(video_url,'.mp4')
                        response={'status':'succeeded','asset':asset};cache.write_text(json.dumps(response))
                    return self.send_json(response)
                return self.send_json({'status':status,'error':result.get('error',{}).get('message','') if result.get('error') else ''})
            if self.path=='/api/frames':return self.send_json(run_job(extract_frames,body['localId']))
            if self.path=='/api/assemble':return self.send_json(run_job(assemble,body['clips'],body.get('bgm')))
            if self.path=='/api/verify':
                return self.send_json(describe(media_path(body['localId']),body.get('source','upload')))
            self.send_json({'error':'未知接口'},404)
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception as error:self.send_json({'error':safe_error(error)},400)

    def log_message(self,fmt,*args):
        # Paths only, never log headers, payloads, or credentials.
        print(f'[studio] {args[0] if args else fmt}')

if __name__=='__main__':
    load_env();MEDIA.mkdir(parents=True,exist_ok=True)
    host,port=server_binding()
    print(f'Lance内容工作台：http://127.0.0.1:{port}')
    print('文本、图片和视频模型未配置时仍可编辑和保存，生成会明确报错。')
    ThreadingHTTPServer((host,port),Handler).serve_forever()
