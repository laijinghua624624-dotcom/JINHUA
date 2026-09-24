/* Fast, interruption-free case capture and account import helpers. */
(function(root){
  'use strict';
  const PUBLIC_WORKBENCH='https://lance-content-studio.onrender.com/';
  const CATEGORY_RULES=[
    ['音效配乐',/音乐|配乐|声音|音效|sound|music|audio|bgm/i],
    ['服装造型',/服装|造型|穿搭|时装|fashion|costume|wardrobe/i],
    ['舞台声光电',/舞台|演唱会|灯光秀|大屏|声光电|concert|stage|live show/i],
    ['灯光设计',/灯光|光影|布光|逆光|lighting|light/i],
    ['运镜参考',/运镜|推进|横移|跟拍|环绕|camera move|tracking|dolly|pan|tilt/i],
    ['分镜参考',/分镜|镜头|剪辑|转场|storyboard|shot|edit|transition/i],
    ['美术参考',/置景|场景|空间|装置|材质|美术|production design|set design/i],
    ['封面参考',/封面|首帧|标题|字体|海报|thumbnail|poster|title/i],
    ['AI参考',/\bai\b|aigc|生成式|midjourney|runway|seedance|seedream/i],
    ['广告TVC',/广告|品牌|商业片|campaign|commercial|tvc/i],
    ['电影参考',/电影|短片|纪录片|film|cinema|documentary/i]
  ];
  let recognition=null;
  let activePrefill={};
  function heuristic(text,url=''){
    const source=`${text||''} ${url||''}`;
    const category=(CATEGORY_RULES.find(([,pattern])=>pattern.test(source))||['摄影参考'])[0];
    const tags=[];
    for(const [label,pattern] of CATEGORY_RULES)if(pattern.test(source)&&label!==category)tags.push(label);
    if(/pinterest/i.test(url))tags.push('Pinterest');
    if(/shotdeck/i.test(url))tags.push('ShotDeck');
    return {category,tags:[...new Set(tags)].slice(0,5)};
  }
  function mediaAdvice(kind,hasPreview){
    if(kind==='video')return '链接和预览已保存。需要做视频反推、关键帧或AI模仿时，请从原网站下载原视频后上传；受保护网站不能由系统代替你下载。';
    if(kind==='audio')return '链接已保存。需要转写、节奏分析或配乐参考时，请从原网站下载音频后上传。';
    if(kind==='image'||hasPreview)return '预览图可帮助你回看。需要AI识图或保持具体风格时，请打开预览图保存原图，再上传到这张参考卡。';
    return '当前先保存链接和你的判断；只有之后要让AI读取具体画面或声音时，才需要补原文件。';
  }
  function quickDialog(prefill={}){
    activePrefill={...prefill};
    const url=prefill.url||'',note=prefill.note||'',preview=prefill.preview||'',recognizedTitle=String(prefill.title||'').trim();
    const visual=preview?`<figure class="capture-preview"><img src="${esc(preview)}" alt="即将保存的视频封面" referrerpolicy="no-referrer" onerror="this.closest('figure').remove()"><figcaption>已从当前页面带回封面</figcaption></figure>`:`<div class="capture-preview-pending"><span>▣</span><div><strong>保存后自动抓封面</strong><small>优先视频原封面，其次页面主视觉；不要求你自己截图。</small></div></div>`;
    const titleRow=recognizedTitle?`<div class="capture-recognized-title"><small>识别到的正式片名</small><strong>${esc(recognizedTitle)}</strong></div>`:'';
    dialog('快速收藏案例',`<div class="quick-capture">${visual}${titleRow}<div class="quick-capture-step"><b>1</b><label>粘贴来源链接<textarea id="capture-link" class="short" required placeholder="Pinterest、新片场、ShotDeck 或任意公开网页链接">${esc(url)}</textarea></label>${btn('从剪贴板粘贴','radar-capture-paste')}</div><div class="quick-capture-step"><b>2</b><label>说／写下你喜欢什么<textarea id="capture-note" placeholder="例如：喜欢这个光线、人物被空间包围的感觉，以及开场推进镜头。">${esc(note)}</textarea></label>${btn('开始说','radar-capture-voice','aria-pressed="false"')}</div><div class="quick-capture-promise"><strong>其他不用填</strong><span>封面、标题、分类和标签由系统补齐；先保存再整理，抓取失败也不会丢记录。</span></div></div>`,btn('保存到参考库','radar-capture-save','',true));
    setTimeout(()=>$('#capture-link')?.focus(),0);
  }
  async function paste(){
    if(!navigator.clipboard?.readText)throw Error('当前浏览器不能直接读剪贴板，请长按输入框粘贴');
    const text=await navigator.clipboard.readText();if(!text)throw Error('剪贴板里没有内容');$('#capture-link').value=text;
  }
  function voice(button){
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition)throw Error('当前浏览器不支持网页语音识别，请使用键盘上的麦克风听写，文字同样会自动保存和分类。');
    if(recognition){recognition.stop();recognition=null;button.textContent='开始说';button.setAttribute('aria-pressed','false');return;}
    const field=$('#capture-note'),original=field.value.trim();recognition=new SpeechRecognition();recognition.lang='zh-CN';recognition.continuous=true;recognition.interimResults=true;
    recognition.onresult=event=>{let final='',interim='';for(let i=event.resultIndex;i<event.results.length;i++){const text=event.results[i][0].transcript;if(event.results[i].isFinal)final+=text;else interim+=text;}const prefix=[original,field.dataset.voiceFinal].filter(Boolean).join(' ');field.value=[prefix,final||interim].filter(Boolean).join(' ').trim();if(final)field.dataset.voiceFinal=[field.dataset.voiceFinal,final].filter(Boolean).join(' ');};
    recognition.onerror=()=>{notify('语音识别没有成功，可直接使用系统键盘麦克风或文字输入。','error');};
    recognition.onend=()=>{recognition=null;button.textContent='开始说';button.setAttribute('aria-pressed','false');};
    recognition.start();button.textContent='停止并保留文字';button.setAttribute('aria-pressed','true');
  }
  function cleanAI(value,fallback){return typeof value==='string'&&value.trim()?value.trim():fallback;}
  async function enrich(id){
    const first=globalAssets().find(item=>item.id===id);if(!first)return;
    let info=null,error='';
    try{info=await api('link/import',{url:first.link,metadataOnly:true},{timeout:65000});}catch(reason){error=reason.message||String(reason);}
    let classification=heuristic(`${first.notes} ${info?.title||''} ${info?.description||''}`,first.link);
    if(info){
      try{
        const result=await chat(`你是内容总监的参考库整理助手。根据来源网页的公开标题、简介和创作者刚说的直觉，只做归档，不扩写成完整策划。分类必须从以下列表选一个：${StudioAesthetic.CATEGORIES.join('、')}。标签最多5个，短且具体。summary用一句中文说明这条参考值得回看的核心。mediaType只能是image、video、audio、webpage之一。只返回JSON：{"title":"简洁中文标题","category":"分类","tags":["标签"],"summary":"一句整理","mediaType":"image|video|audio|webpage"}\n资料：${JSON.stringify({url:first.link,title:info.title,description:info.description,userNote:first.captureUserNote})}`,[],'refine');
        const allowed=new Set(StudioAesthetic.CATEGORIES);classification={category:allowed.has(result.category)?result.category:classification.category,tags:StudioAesthetic.tags(result.tags).slice(0,5),title:cleanAI(result.title,info.title),summary:cleanAI(result.summary,''),mediaType:['image','video','audio','webpage'].includes(result.mediaType)?result.mediaType:info.mediaKind};
      }catch{/* The record is already safe; deterministic classification remains. */}
    }
    const all=globalAssets(),record=all.find(item=>item.id===id);if(!record)return;
    const sourceTitle=classification.title||info?.title;
    if(sourceTitle&&(!record.name||record.name===new URL(record.link).hostname))record.name=sourceTitle;
    record.category=classification.category||record.category;record.tags=[...new Set([...(record.tags||[]),...(classification.tags||[]),'快速收藏'])].slice(0,8);
    record.sourceSite=info?.siteName||record.sourceSite;record.externalPreview=record.externalPreview||info?.previewImage||'';record.previewDirect=Boolean(record.externalPreview);record.mediaKind=record.mediaKind&&record.mediaKind!=='webpage'?record.mediaKind:classification.mediaType||info?.mediaKind||'webpage';
    record.sourceInfo=info?{...info,asset:undefined,parsedAt:new Date().toISOString()}:record.sourceInfo;
    const lines=[record.captureUserNote?`【我喜欢】${record.captureUserNote}`:'',classification.summary?`【自动整理】${classification.summary}`:'',info?.description?`【来源简介】${info.description}`:''].filter(Boolean);record.notes=lines.join('\n');record.requirements=record.notes;record.downloadAdvice=mediaAdvice(record.mediaKind,Boolean(record.externalPreview));record.captureStatus=info?'已读取并分类':`已保存；网页暂时无法读取：${error.slice(0,120)}`;record.updatedAt=new Date().toISOString();saveAesthetic(all);
    notify(info?'案例已自动补好标题和分类。':'案例已保存；网页暂时读不到也不会丢失。');
  }
  function save(){
    const link=StudioAesthetic.link($('#capture-link').value),note=$('#capture-note').value.trim(),all=globalAssets(),existing=all.find(item=>StudioRadar.normalizedURL(item.link)===StudioRadar.normalizedURL(link));
    const preview=String(activePrefill.preview||'').trim(),sourceTitle=String(activePrefill.title||'').trim(),sourceMedia=String(activePrefill.mediaKind||'').trim();
    if(existing){let changed=false;if(note&&!String(existing.notes||'').includes(note)){existing.captureUserNote=[existing.captureUserNote,note].filter(Boolean).join('\n');existing.notes=[existing.notes,`【再次记录】${note}`].filter(Boolean).join('\n');changed=true;}if(preview&&!existing.externalPreview){existing.externalPreview=preview;existing.previewDirect=true;existing.captureStatus='已从原页面补全封面';changed=true;}if(sourceTitle&&(!existing.name||existing.name===new URL(link).hostname)){existing.name=sourceTitle;changed=true;}if(sourceMedia&&!existing.mediaKind){existing.mediaKind=sourceMedia;changed=true;}if(changed){existing.updatedAt=new Date().toISOString();saveAesthetic(all);}close();route={view:'aesthetic'};render();aestheticDialog(existing);notify(preview?'这条已收藏；已为它补上封面。':'这个链接已经收藏；你的新想法已追加。');return existing;}
    const record=StudioAesthetic.entry(sourceTitle||new URL(link).hostname),rule=heuristic(note,link);record.link=link;record.category=rule.category;record.tags=[...rule.tags,'快速收藏'];record.notes=note?`【我喜欢】${note}`:'尚未写喜欢什么，可稍后补充';record.requirements=record.notes;record.captureUserNote=note;record.captureStatus=preview?'已保存封面，正在自动整理':'已保存，正在自动抓取封面';record.sourceSite=new URL(link).hostname;record.sourceUsage='link-only';record.favorite=true;record.folderIds=[];record.externalPreview=preview;record.previewDirect=Boolean(preview);record.mediaKind=sourceMedia||'webpage';all.push(record);saveAesthetic(all);close();route={view:'aesthetic'};render();notify(preview?'已连封面一起保存；你可以继续看片。':'已先保存。系统会在后台自动抓封面和分类。');void enrich(record.id);return record;
  }
  function assetTools(record){
    if(!record?.captureStatus&&!record?.downloadAdvice)return '';
    const preview=record.externalPreview?`<a class="button" href="${esc(serviceBase()+'/api/reference-download?url='+encodeURIComponent(record.externalPreview))}" target="_blank" rel="noopener noreferrer">一键下载预览图 ↓</a>`:'';
    return `<section class="capture-result"><strong>${esc(record.captureStatus||'已收藏')}</strong><p>${esc(record.downloadAdvice||mediaAdvice(record.mediaKind,Boolean(record.externalPreview)))}</p><div class="actions">${preview}${record.link?`<a class="button" href="${esc(record.link)}" target="_blank" rel="noopener noreferrer">打开原网站 ↗</a>`:''}</div></section>`;
  }
  function bookmarklet(){
    const target=PUBLIC_WORKBENCH,code=`javascript:(()=>{const q=s=>document.querySelector(s),m=s=>q(s)?.content?.trim()||'',v=q('video[poster]'),imgs=[...document.images].filter(i=>i.currentSrc&&i.naturalWidth>=320&&i.naturalHeight>=180).sort((a,b)=>b.naturalWidth*b.naturalHeight-a.naturalWidth*a.naturalHeight),t=m('meta[property="og:title"]')||m('meta[name="twitter:title"]')||q('h1')?.textContent?.trim()||document.title,p=m('meta[property="og:image:secure_url"]')||m('meta[property="og:image"]')||m('meta[name="twitter:image"]')||v?.poster||imgs[0]?.currentSrc||'',k=(v||m('meta[property="og:video"]')||/video/i.test(m('meta[property="og:type"]')))?'video':p?'image':'webpage',n=window.getSelection?String(window.getSelection()):'';window.open('${target}?capture='+encodeURIComponent(location.href)+'&captureTitle='+encodeURIComponent(t)+'&capturePreview='+encodeURIComponent(p)+'&captureMedia='+encodeURIComponent(k)+'&captureNote='+encodeURIComponent(n),'_blank')})()`;
    return code;
  }
  function helperDialog(){
    const code=bookmarklet();dialog('一键收藏助手',`<div class="capture-helper"><section><h3>Mac／电脑浏览器</h3><p>把下面这个按钮拖到浏览器书签栏。以后在单条作品页点一下，会自动带回链接、标题、<strong>视频封面</strong>和你选中的文字。新片场等已登录网站也适用。</p><a class="button primary" href="${esc(code)}">收藏到 JINHUA</a>${btn('复制收藏按钮代码','radar-capture-copy')}</section><section><h3>iPhone／iPad</h3><p>在原网站点“分享→复制链接”，再打开 JINHUA 的“快速收藏”。公开页面会自动抓封面；受登录保护的页面建议在 Mac 上用上面的收藏按钮。</p></section></div>`);
  }
  async function copyBookmarklet(){await navigator.clipboard.writeText(bookmarklet());notify('收藏按钮代码已复制，可新建书签后粘贴到网址栏。');}
  async function pinterestDialog(){
    dialog('Pinterest 收藏同步','<div class="capture-helper"><p>正在检查官方连接状态……</p></div>');
    let status;try{status=await api('pinterest/status');}catch(error){showError(error);return;}
    const actions=status.connected?btn('导入最近收藏','radar-pinterest-sync','',true):status.oauthConfigured?`<a class="button primary" href="${esc(serviceBase()+'/api/pinterest/connect')}">连接 Pinterest 官方账号</a>`:'';
    dialog('Pinterest 收藏同步',`<div class="capture-helper"><section><strong>${esc(status.message)}</strong><p>只通过 Pinterest 官方授权读取你的收藏，不填写、不保存 Pinterest 密码。导入时只建立来源卡和预览，原图／视频仍按需要再下载。</p>${!status.available?'<div class="callout">还差一次性的 Pinterest 开发者应用配置（App ID、Secret、回调地址）。配置完成后这里会直接出现“连接账号”。在此之前，一键收藏助手已经可以使用。</div>':''}</section></div>`,actions);
  }
  async function pinterestSync(){
    close();notify('正在读取 Pinterest 收藏；你可以继续使用其他功能。');const result=await api('pinterest/sync?limit=100',undefined,{timeout:120000}),all=globalAssets();let added=0;
    for(const pin of result.items||[]){if(all.some(item=>StudioRadar.normalizedURL(item.link)===StudioRadar.normalizedURL(pin.link)))continue;const rule=heuristic(`${pin.title} ${pin.description}`,pin.link),record=StudioAesthetic.entry(pin.title||'Pinterest 收藏');record.link=pin.link;record.sourceSite='Pinterest';record.category=rule.category;record.tags=[...rule.tags,'Pinterest','账号同步'];record.notes=pin.description||'来自 Pinterest 收藏';record.requirements=record.notes;record.externalPreview=pin.previewImage||'';record.previewDirect=true;record.mediaKind=pin.mediaKind?.includes('video')?'video':'image';record.downloadAdvice=mediaAdvice(record.mediaKind,Boolean(record.externalPreview));record.captureStatus='已从 Pinterest 同步';record.sourceUsage='link-only';record.favorite=true;all.push(record);added++;}
    saveAesthetic(all);route={view:'aesthetic'};render();notify(added?`已导入 ${added} 条 Pinterest 收藏；重复链接没有再建卡。`:'没有发现新的 Pinterest 收藏。');
  }
  function handleIncoming(){
    const params=new URLSearchParams(location.search),url=params.get('capture'),prefill={url,title:params.get('captureTitle')||'',preview:params.get('capturePreview')||'',mediaKind:params.get('captureMedia')||'',note:params.get('captureNote')||''};
    if(params.get('pinterest')==='connected')setTimeout(()=>pinterestDialog(),250);
    if(url)setTimeout(()=>quickDialog(prefill),250);
    if(url||params.has('pinterest')){for(const key of ['capture','captureTitle','capturePreview','captureMedia','captureNote','pinterest'])params.delete(key);history.replaceState(null,'',location.pathname+(params.toString()?'?'+params:'')+location.hash);}
  }
  root.StudioCapture={heuristic,quickDialog,paste,voice,save,enrich,assetTools,helperDialog,copyBookmarklet,pinterestDialog,pinterestSync,handleIncoming,bookmarklet,mediaAdvice};
  if(typeof module==='object')module.exports=root.StudioCapture;
})(globalThis);
