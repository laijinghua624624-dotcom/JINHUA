#!/usr/bin/env python3
"""Local content studio: Ark adapter, durable media, frame extraction, film assembly.
No credentials or uploaded files are served by the static-file handler.
"""
import base64
from collections import defaultdict, deque
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
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from socketserver import ThreadingMixIn, UnixStreamServer

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('LANCE_DATA_DIR', ROOT / '.lance-data'))
MEDIA = DATA / 'media'
ARK = 'https://ark.cn-beijing.volces.com/api/v3'
MAX_UPLOAD = 250 * 1024 * 1024
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=2)
JOBS = {}
LOCK = threading.Lock()
RATE_LOCK = threading.Lock()
RATE_HITS = defaultdict(deque)
PAID_PATHS = {'/api/chat','/api/image','/api/video','/api/transcribe','/api/reference/search'}
RADAR_PREVIEW_HOSTS = {
    'file.digitaling.com','images.ctfassets.net','img.redbull.com','www.tomorrowland.com',
    'aiff.runwayml.com','directorslibrary.com','www.directorslibrary.com','framerusercontent.com',
    'cdn.shopify.com','images.squarespace-cdn.com'
}

def paid_request_allowed(handler):
    """Keep an accidentally shared public URL from creating an unlimited bill."""
    if not os.environ.get('LANCE_PUBLIC_ORIGIN'):
        return True
    try:
        limit=max(1,min(int(os.environ.get('LANCE_PAID_REQUESTS_PER_HOUR','60')),500))
    except ValueError:
        limit=60
    forwarded=handler.headers.get('X-Forwarded-For','').split(',',1)[0].strip()
    try:
        client=str(ipaddress.ip_address(forwarded))
    except ValueError:
        client='unknown'
    now=time.time()
    with RATE_LOCK:
        hits=RATE_HITS[client]
        while hits and hits[0] <= now-3600:
            hits.popleft()
        if len(hits)>=limit:
            return False
        hits.append(now)
        return True

def model_routes():
    routes={role:{'model':os.environ.get(env,'').strip()} for role,env in {
        'director':'ARK_DIRECTOR_MODEL','refine':'ARK_REFINE_MODEL','image':'ARK_IMAGE_MODEL',
        'video':'ARK_VIDEO_MODEL','embedding':'ARK_EMBEDDING_MODEL'}.items()}
    routes['speech']={'model':os.environ.get('SPEECH_MODEL_VERSION','').strip() or os.environ.get('SPEECH_RESOURCE_ID','volc.seedasr.auc').strip()}
    return routes

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
    origin=(os.environ.get('LANCE_PUBLIC_ORIGIN') or os.environ.get('RENDER_EXTERNAL_URL','')).rstrip('/')
    parsed=urllib.parse.urlparse(origin)
    if origin and (parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment):
        raise ValueError('LANCE_PUBLIC_ORIGIN 必须为不含路径的 HTTPS 来源地址')
    if host not in {'127.0.0.1','localhost','::1'} and (not origin or os.environ.get('LANCE_TRUSTED_PROXY')!='1'):
        raise ValueError('非本机监听必须配置 HTTPS 来源及带认证的反向代理；不可直接开放端口')
    # Keep the desktop workbench away from the user's other local project on
    # 8000 and from the legacy Jimeng proxy on 8765.
    return host,int(os.environ.get('LANCE_PORT') or os.environ.get('PORT') or 8787)

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

def document_binary(name):
    found=shutil.which(name)
    if found:return found
    # Codex desktop bundles Poppler behind small wrapper scripts. Use the
    # companion executable when the current runtime exposes it.
    if name=='pdftotext':
        anchor=shutil.which('pdftoppm') or shutil.which('pdfinfo')
        if anchor:
            for relative in ('../../native/poppler/bin','../../native/poppler/poppler/bin'):
                candidate=(Path(anchor).parent/relative/name).resolve()
                if candidate.is_file() and os.access(candidate,os.X_OK):return str(candidate)
    return None

def pdf_ocr(path):
    renderer=document_binary('pdftoppm');ocr=document_binary('tesseract')
    if not renderer or not ocr:raise ValueError('PDF没有可提取文字，且本机OCR组件未齐备')
    with tempfile.TemporaryDirectory(prefix='lance-pdf-ocr-') as folder:
        prefix=Path(folder)/'page'
        rendered=subprocess.run([renderer,'-f','1','-l','30','-r','160','-png',str(path),str(prefix)],capture_output=True,timeout=180)
        if rendered.returncode:raise ValueError('PDF无法渲染，可能已加密或损坏')
        def page_number(item):
            match=re.search(r'-(\d+)\.png$',item.name);return int(match.group(1)) if match else 0
        pages=sorted(Path(folder).glob('page-*.png'),key=page_number)
        if not pages:raise ValueError('PDF未渲染出可识别页面')
        texts=[]
        for image in pages:
            command=[ocr,str(image),'stdout','-l','chi_sim+eng','--psm','6']
            result=subprocess.run(command,capture_output=True,timeout=120)
            if result.returncode:
                result=subprocess.run([ocr,str(image),'stdout','-l','eng','--psm','6'],capture_output=True,timeout=120)
            if not result.returncode:texts.append(result.stdout.decode('utf-8','replace'))
        text='\n'.join(texts).strip()
        if not text:raise ValueError('OCR未识别到文字；原PDF已保留，可上传清晰截图或手动填写')
        return text,len(pages)

def document_text(name):
    path=media_path(name);ext=path.suffix.lower()
    notice=''
    if ext in {'.txt','.md'}:text=path.read_text(encoding='utf-8-sig')
    elif ext=='.docx':
        with zipfile.ZipFile(path) as archive:
            info=archive.getinfo('word/document.xml')
            if info.file_size>10*1024*1024:raise ValueError('DOCX正文超过10MB，请拆分资料')
            root=ET.fromstring(archive.read(info))
        ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
        text='\n'.join(''.join(p.itertext()) for p in root.iter(ns+'p'))
    elif ext=='.pdf':
        extractor=document_binary('pdftotext');text=''
        if extractor:
            result=subprocess.run([extractor,'-f','1','-l','100','-layout',str(path),'-'],capture_output=True,timeout=90)
            if not result.returncode:text=result.stdout.decode('utf-8','replace')
        if not text.strip():
            text,pages=pdf_ocr(path);notice=f'文本层不可用，已OCR前{pages}页；可能有识别误差，必须人工核对'
        else:notice='最多提取前100页/60000字，请核对是否完整'
    else:raise ValueError('此文件只归档；支持TXT、Markdown、DOCX和文本PDF提取')
    if not text.strip():raise ValueError('未提取到文字；扫描件需要另行OCR或手动填写')
    if len(text)>60000:notice=(notice+'；' if notice else '')+'只保留前60000字'
    return {'text':text.strip()[:60000],'notice':notice}

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
    if not shutil.which('curl'):
        raise ValueError('系统缺少 curl，无法安全连接模型服务')
    payload=json.dumps(body,ensure_ascii=False).encode() if body is not None else None
    payload_file=None
    try:
        command=['curl','-sS','--max-time','240','--write-out','\n%{http_code}','-X',method,'-H','@-']
        if payload is not None:
            payload_file=tempfile.NamedTemporaryFile(prefix='lance-ark-',suffix='.json',delete=False)
            payload_file.write(payload);payload_file.close()
            os.chmod(payload_file.name,0o600)
            command+=['--data-binary','@'+payload_file.name]
        command.append(ARK+path)
        # Pass credentials through stdin so they never appear in argv, logs, or process listings.
        headers=('Authorization: Bearer '+token+'\nContent-Type: application/json\n').encode()
        result=subprocess.run(command,input=headers,capture_output=True,timeout=250)
        raw=result.stdout.decode('utf-8','replace')
        response_text,separator,status_text=raw.rpartition('\n')
        status=int(status_text) if separator and status_text.isdigit() else 0
        if result.returncode or status<200 or status>=300:
            try:
                detail=json.loads(response_text).get('error',{})
                message=detail.get('message','模型调用失败') if isinstance(detail,dict) else str(detail)
            except Exception:
                message=result.stderr.decode('utf-8','replace') or '模型调用失败'
            label=status or result.returncode
            raise ValueError(f'模型接口 {label}：{safe_error(message)}')
        return json.loads(response_text)
    finally:
        if payload_file:
            Path(payload_file.name).unlink(missing_ok=True)

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

def radar_preview(url):
    """Fetch only curated radar thumbnails; never expose a general-purpose proxy."""
    url=public_url(str(url or '').strip())
    host=(urllib.parse.urlparse(url).hostname or '').lower()
    if host not in RADAR_PREVIEW_HOSTS:raise ValueError('预览图片来源不在案例雷达允许列表')
    data,content_type,final,_=read_public(url,8*1024*1024)
    final_host=(urllib.parse.urlparse(final).hostname or '').lower()
    if final_host not in RADAR_PREVIEW_HOSTS:raise ValueError('预览图片跳转到了未允许来源')
    if content_type not in {'image/jpeg','image/png','image/webp','image/avif'}:raise ValueError('案例预览不是可显示的图片')
    return data,content_type

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

def speech_headers(request_id=None):
    headers={'Content-Type':'application/json','X-Api-Resource-Id':os.environ.get('SPEECH_RESOURCE_ID','volc.seedasr.auc'),
             'X-Api-Request-Id':request_id or str(uuid.uuid4()),'X-Api-Sequence':'-1'}
    if headers['X-Api-Resource-Id'] not in {'volc.seedasr.auc','volc.bigasr.auc_turbo'}:
        raise ValueError('仅支持豆包录音文件识别 2.0 或兼容的旧极速资源')
    if os.environ.get('SPEECH_API_KEY'):
        headers['X-Api-Key']=os.environ['SPEECH_API_KEY']
    elif os.environ.get('SPEECH_APP_ID') and os.environ.get('SPEECH_ACCESS_TOKEN'):
        headers.update({'X-Api-App-Key':os.environ['SPEECH_APP_ID'],'X-Api-Access-Key':os.environ['SPEECH_ACCESS_TOKEN']})
    else:raise ValueError('请在服务端配置豆包语音凭据；它与 Ark API Key 不通用')
    return headers

def speech_request(url, payload, headers, timeout=240):
    if not shutil.which('curl'):
        raise ValueError('系统缺少 curl，无法安全连接语音服务')
    with tempfile.TemporaryDirectory(prefix='lance-speech-request-') as folder:
        folder=Path(folder);payload_path=folder/'payload.json';header_path=folder/'headers.txt';body_path=folder/'body.json'
        payload_path.write_text(json.dumps(payload,ensure_ascii=False));os.chmod(payload_path,0o600)
        command=['curl','-sS','--max-time',str(timeout),'-X','POST','-H','@-','--data-binary','@'+str(payload_path),
                 '--dump-header',str(header_path),'--output',str(body_path),'--write-out','%{http_code}',url]
        header_input=''.join(f'{key}: {value}\n' for key,value in headers.items()).encode()
        result=subprocess.run(command,input=header_input,capture_output=True,timeout=timeout+10)
        http_status=int(result.stdout.decode('ascii','ignore') or 0)
        response_headers={}
        for line in header_path.read_text(errors='replace').splitlines():
            if ':' in line:
                key,value=line.split(':',1);response_headers[key.strip().lower()]=value.strip()
        if result.returncode or not 200<=http_status<300:
            message=response_headers.get('x-api-message') or response_headers.get('x-api-status-message') or ''
            try:
                detail=json.loads(body_path.read_text() or '{}')
                if isinstance(detail,dict):message=message or detail.get('message') or detail.get('error','')
            except json.JSONDecodeError:pass
            message=safe_error(message or '请核对服务权限和资源配置')
            raise ValueError(f'语音接口 {http_status or result.returncode}：{message}')
        try: body=json.loads(body_path.read_text() or '{}')
        except json.JSONDecodeError:raise ValueError('语音服务返回了无效结果') from None
        return response_headers,body

def transcribe_audio(name):
    request_id=str(uuid.uuid4());headers=speech_headers(request_id);source=media_path(name);meta=describe(source)
    resource=headers['X-Api-Resource-Id'];max_duration=18000 if resource=='volc.seedasr.auc' else 7200
    if meta['kind'] not in {'audio','video'} or meta['kind']=='video' and not meta.get('hasAudio') or not 0<meta['duration']<=max_duration or source.stat().st_size>250*1024*1024:
        raise ValueError('转写只接收服务允许时长内、带有效音轨的音频或视频；原文件未修改')
    # Browser WebM/M4A recordings are normalized privately; originals remain intact.
    with tempfile.TemporaryDirectory(prefix='lance-asr-') as folder:
        target=Path(folder)/'speech.mp3'
        subprocess.run(['ffmpeg','-v','error','-i',str(source),'-vn','-ac','1','-ar','16000','-b:a','32k','-y',str(target)],check=True,capture_output=True,timeout=180)
        if target.stat().st_size>20*1024*1024:raise ValueError('转换后的录音超过20MB，请分段转写')
        options={'model_name':'bigmodel','enable_itn':True,'enable_punc':True,'show_utterances':True}
        if os.environ.get('SPEECH_MODEL_VERSION'):options['model_version']=os.environ['SPEECH_MODEL_VERSION']
        payload={'user':{'uid':'lance-local-studio'},'audio':{'data':base64.b64encode(target.read_bytes()).decode(),'format':'mp3'},'request':options}
        if resource=='volc.bigasr.auc_turbo':
            response_headers,raw=speech_request('https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash',payload,headers)
            code=response_headers.get('x-api-status-code','')
            if code!='20000000':raise ValueError('语音识别未成功，状态码：'+code)
        else:
            response_headers,_=speech_request('https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit',payload,headers)
            code=response_headers.get('x-api-status-code','')
            if code!='20000000':raise ValueError('语音任务提交失败，状态码：'+code)
            deadline=time.monotonic()+600;raw={}
            while time.monotonic()<deadline:
                time.sleep(2)
                response_headers,raw=speech_request('https://openspeech.bytedance.com/api/v3/auc/bigmodel/query',{},headers,60)
                code=response_headers.get('x-api-status-code','')
                if code=='20000000':break
                if code not in {'20000001','20000002'}:raise ValueError('语音转写失败，状态码：'+code)
            else:raise ValueError('语音转写超过10分钟未完成，原录音已保留，可重试')
    result=raw.get('result',{});text=result.get('text','')
    if not isinstance(text,str) or not text.strip():raise ValueError('未返回有效文字，原录音已保留')
    return {'text':text,'utterances':result.get('utterances',[]),'source':'doubao-asr','modelVersion':os.environ.get('SPEECH_MODEL_VERSION') or resource,'localId':name}

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
        port=getattr(self.server,'server_port',None)
        if port:
            allowed_hosts={f'127.0.0.1:{port}',f'localhost:{port}'}
            permitted={f'http://127.0.0.1:{port}',f'http://localhost:{port}'}
        else:
            allowed_hosts={'127.0.0.1','localhost'}
            permitted={'http://127.0.0.1','http://localhost'}
        allowed_hosts.add('lance-content-studio.onrender.com')
        permitted.update(filter(None,os.environ.get('LANCE_ALLOWED_ORIGINS','').split(',')))
        permitted.add('https://laijinghua624624-dotcom.github.io')
        public_origin=os.environ.get('LANCE_PUBLIC_ORIGIN','').rstrip('/')
        if public_origin:
            # Public deployment is same-origin behind Render's proxy; the
            # owner's GitHub Pages may also call this API for full features.
            permitted.add(public_origin)
            allowed_hosts.add(urllib.parse.urlparse(public_origin).netloc)
        return host in allowed_hosts and (not origin or origin in permitted)

    def send_json(self,value,status=200):
        if isinstance(value,dict) and value.get('error'):value={**value,'error':safe_error(value['error'])}
        data=json.dumps(value,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store')
        origin=self.headers.get('Origin')
        if origin and self.allowed(): self.send_header('Access-Control-Allow-Origin',origin)
        self.end_headers();self.wfile.write(data)

    def send_binary(self,data,content_type,filename):
        safe_name=re.sub(r'[^\w\-\u4e00-\u9fff.]+','_',filename).strip('_.') or 'Lance_report.pdf'
        quoted=urllib.parse.quote(safe_name)
        self.send_response(200);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Disposition',f"attachment; filename*=UTF-8''{quoted}")
        origin=self.headers.get('Origin')
        if origin and self.allowed():self.send_header('Access-Control-Allow-Origin',origin)
        self.end_headers();self.wfile.write(data)

    def send_preview(self,data,content_type):
        self.send_response(200);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','public, max-age=21600');self.send_header('X-Content-Type-Options','nosniff')
        origin=self.headers.get('Origin')
        if origin and self.allowed():self.send_header('Access-Control-Allow-Origin',origin)
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
                return self.send_json({'ok':True,'keyConfigured':bool(os.environ.get('ARK_API_KEY')),'routes':routes,'models':{'text':routes['director']['model'],'image':routes['image']['model'],'video':routes['video']['model']},'speechConfigured':bool(os.environ.get('SPEECH_API_KEY') or os.environ.get('SPEECH_APP_ID') and os.environ.get('SPEECH_ACCESS_TOKEN')),'ffmpeg':bool(shutil.which('ffmpeg') and shutil.which('ffprobe')),'pdfText':bool(document_binary('pdftotext')),'ocr':bool(document_binary('pdftoppm') and document_binary('tesseract'))})
            if path=='/api/radar-preview':
                url=urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('url',[''])[0]
                data,content_type=radar_preview(url);return self.send_preview(data,content_type)
            if path=='/api/profile-seed':
                seed=DATA/'profile-seed.json'
                selected_scope=urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('scope',[''])[0]
                return self.send_json({'fields':json.loads(seed.read_text()).get(selected_scope,{}) if seed.is_file() and selected_scope in ('personal','xinxuan') else {}})
            if path.startswith('/api/jobs/'):
                return self.send_json(JOBS.get(path.split('/')[-1],{'status':'failed','error':'任务不存在或服务已重启，请重试'}))
            if path.startswith('/media/'): target=media_path(path[7:])
            else:
                name='index.html' if path=='/' else path.lstrip('/')
                if name not in {'index.html','studio.js','studio-security.js','studio.css','studio-core.js','studio-reverse.js','studio-aesthetic.js','studio-aesthetic-ui.js','studio-folders.js','studio-folders-ui.js','studio-aesthetic.css','studio-radar.js','studio-radar-ui.js','studio-radar.css','studio-profile.js','studio-inspiration.js','studio-fragments.js','studio-fragments-ui.js','studio-ppt.js','studio-cloud.js','studio-workspace-cloud.js','studio-mobile-inbox.js','mobile.html','mobile.css','mobile.js','mobile-config.js','mobile.webmanifest','mobile-sw.js','mobile-icon.svg','vendor/presentation.js','lance_qrcode_public.png','lance_qrcode.png','lance_intro.mp4','api-guide.html','tutorial.html','deliverables/Lance专场整体汇报模板_v1.pptx','deliverables/Lance单条剧本汇报模板_v1.pptx'}:
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
            if self.path in PAID_PATHS and not paid_request_allowed(self):
                return self.send_json({'error':'本小时生成请求较多，已暂停新的付费任务；稍后再试。'},429)
            if self.path=='/api/transcribe':
                speech_headers()
                return self.send_json(run_job(transcribe_audio,body.get('localId')))
            if self.path=='/api/reference/search':
                route_model('embedding')
                return self.send_json(run_job(semantic_search,body))
            if self.path=='/api/document/text':return self.send_json(document_text(body.get('localId')))
            if self.path=='/api/link/import':return self.send_json(parse_public_link(body.get('url')))
            if self.path=='/api/project/pdf':
                from studio_pdf import project_overview_pdf
                data=project_overview_pdf(body)
                return self.send_binary(data,'application/pdf',str(body.get('title') or '专场')+'_整体方向_不含脚本.pdf')
            if self.path=='/api/reverse/pdf':
                from studio_pdf import reverse_story_pdf
                def reverse_frame(local_id):
                    path=media_path(local_id)
                    if describe(path).get('kind')!='image':raise ValueError('反推PDF只能引用原视频提取的图片帧')
                    return path
                data=reverse_story_pdf(body,reverse_frame)
                return self.send_binary(data,'application/pdf',str(body.get('title') or '视频')+'_反推故事脚本.pdf')
            token=os.environ.get('ARK_API_KEY','')
            if self.path=='/api/chat':
                purpose=body.get('purpose','director')
                if purpose not in ('director','refine'):raise ValueError('未知文本模型分工')
                model=route_model(purpose)
                content=[{'type':'text','text':str(body.get('prompt',''))}]
                for name in body.get('references',[])[:12]:content.append({'type':'image_url','image_url':{'url':data_url(name)}})
                # Seed 2.1 Pro enables deep thinking by default. For this workbench the
                # model must return bounded structured JSON; leaving thinking enabled can
                # spend the whole HTTP timeout before producing a single response byte.
                result=ark_request('/chat/completions',{'model':model,'messages':[{'role':'system','content':'你是Lance的内容总监助理。只输出完整JSON，严格遵守用户结构。区分已知事实与待确认事项，不编造场地尺寸、服装品牌、预算报价或产品性能。'}, {'role':'user','content':content}],'thinking':{'type':'disabled'},'max_tokens':10000 if purpose=='director' else 4000,'temperature':0.65},token)
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

class ThreadingUnixHTTPServer(ThreadingMixIn,UnixStreamServer):
    daemon_threads=True
    allow_reuse_address=True

if __name__=='__main__':
    load_env();MEDIA.mkdir(parents=True,exist_ok=True)
    socket_path=os.environ.get('LANCE_UNIX_SOCKET','').strip()
    if socket_path:
        socket_file=Path(socket_path)
        socket_file.parent.mkdir(parents=True,exist_ok=True)
        socket_file.unlink(missing_ok=True)
        server=ThreadingUnixHTTPServer(socket_path,Handler)
        print(f'Lance内容工作台：unix://{socket_path}')
    else:
        host,port=server_binding()
        server=ThreadingHTTPServer((host,port),Handler)
        print(f'Lance内容工作台：http://127.0.0.1:{port}')
    print('文本、图片和视频模型未配置时仍可编辑和保存，生成会明确报错。')
    try:server.serve_forever()
    finally:
        server.server_close()
        if socket_path:Path(socket_path).unlink(missing_ok=True)
