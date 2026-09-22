/* JINHUA mobile companion: capture first, sync securely, finish on Mac. */
'use strict';
const Cloud=StudioCloud;
const Radar=StudioRadar;
const app=document.querySelector('#mobile-app'),syncState=document.querySelector('#sync-state');
const state={tab:location.hash==='#capture'?'capture':'radar',kind:'text',session:null,items:[],projects:[],localItems:[],pending:0,message:'',recording:null,recordedFile:null,shared:{title:'',body:'',url:''},radarOffset:0,radarWorkspace:localStorage.getItem('jinhua_radar_workspace')||'xinxuan',reminderTime:localStorage.getItem('jinhua_radar_reminder_time')||'09:30'};
const labels={text:'文字灵感',voice:'语音灵感',image:'图片参考',video:'视频参考',document:'文档资料',link:'链接收藏'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function publicLink(value){if(!value)return '';const match=String(value).match(/https?:\/\/[^\s<>"'，。；、【】「」]+/i);if(!match)throw Error('链接格式不正确');let url;try{url=new URL(match[0].replace(/[)\]）!！?？,;]+$/,''));}catch{throw Error('链接格式不正确');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('只支持公开的 http 或 https 链接');return url.href;}
function readShareIntent(){const params=new URLSearchParams(location.search),text=params.get('text')||'',url=params.get('url')||'';if(!params.get('title')&&!text&&!url)return;let sharedUrl='';try{sharedUrl=publicLink(url||text);}catch{}state.tab='capture';state.kind=sharedUrl?'link':'text';state.shared={title:(params.get('title')||'').slice(0,100),body:text.replace(/https?:\/\/\S+/g,'').trim(),url:sharedUrl};history.replaceState(null,'',location.pathname+'#capture');}
function captureHome(){return new URL('./mobile.html',location.href).href.split(/[?#]/)[0];}
function bookmarklet(){const target=JSON.stringify(captureHome());return `javascript:(()=>{const s=window.getSelection?String(window.getSelection()):'';location.href=${target}+'?kind=link&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&text='+encodeURIComponent(s)})()`;}
function show(message){state.message=message;render();setTimeout(()=>{if(state.message===message){state.message='';render();}},5000);}
function openQueue(){return new Promise((resolve,reject)=>{const req=indexedDB.open('jinhua_mobile_queue',1);req.onupgradeneeded=()=>req.result.createObjectStore('items',{keyPath:'localId'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function queueStore(mode,value){const db=await openQueue();return new Promise((resolve,reject)=>{const tx=db.transaction('items',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('items');let req;if(mode==='put')req=store.put(value);else if(mode==='delete')req=store.delete(value);else req=store.getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});}
const queueAll=()=>queueStore('read');
const queuePut=value=>queueStore('put',value);
const queueDelete=id=>queueStore('delete',id);
async function updatePending(){state.localItems=await queueAll();state.pending=state.localItems.length;syncState.textContent=state.session?(state.pending?`${state.pending}条待同步`:'云端已连接'):(state.pending?`${state.pending}条本机草稿`:'本机草稿');syncState.classList.toggle('offline',!state.session||state.pending>0);}
function header(kicker,title,copy){return `<section class="mobile-hero"><div class="mobile-kicker">${kicker}</div><h1>${title}</h1><p>${copy}</p></section>${state.message?`<div class="notice">${esc(state.message)}</div>`:''}`;}
function radarSaved(){try{return JSON.parse(localStorage.getItem('jinhua_mobile_radar_saved')||'[]');}catch{return [];}}
function setRadarSaved(values){localStorage.setItem('jinhua_mobile_radar_saved',JSON.stringify([...new Set(values)]));}
function radarPicks(){const date=new Date();date.setUTCDate(date.getUTCDate()+state.radarOffset);return Radar.daily(Radar.CASES,date,3);}
function radarBody(item){return [`【选题雷达】${item.category} · ${item.type}`,`目标：${item.goal}`,`创意机制：${item.mechanism}`,`开场8秒：${item.hook}`,`情绪／故事弧：${item.arc}`,`摄影／美术／舞台：${item.craft}`,`封面方向：${item.cover}`,`我可以迁移：${item.transfer}`,`不能照搬：${item.avoid}`,`AI参与：${item.ai}`,`落地风险：${item.risk}`].join('\n');}
function radarCard(item){const saved=radarSaved().includes(item.id);return `<article class="radar-mobile-card"><div class="radar-mobile-top"><span class="pill">${esc(item.category)}</span><small>${esc(item.type)}</small></div><h2>${esc(item.title)}</h2><p class="radar-mobile-mechanism">${esc(item.mechanism)}</p><dl><div><dt>开场8秒</dt><dd>${esc(item.hook)}</dd></div><div><dt>可转成你的内容</dt><dd>${esc(item.transfer)}</dd></div></dl><div class="button-row"><a class="secondary mobile-link-button" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">看原案例 ↗</a><button class="primary" data-action="radar-save" data-id="${esc(item.id)}" ${saved?'disabled':''}>${saved?'已收进灵感':'收下这个选题'}</button></div></article>`;}
function radarView(){
  const picks=radarPicks(),today=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());localStorage.setItem('jinhua_mobile_radar_last_viewed',new Date().toISOString().slice(0,10));
  return header('DAILY RADAR','今天先看 3 个。','不是热点搬运，而是与你的直播预热、活动、舞台和 AI 影像工作相关的创意方法。')+`<section class="radar-mobile-toolbar"><div><span class="radar-date">${esc(today)}</span><strong>每日只推 3 条</strong></div><label>保存到<select id="radar-workspace"><option value="xinxuan" ${state.radarWorkspace==='xinxuan'?'selected':''}>My·工作</option><option value="personal" ${state.radarWorkspace==='personal'?'selected':''}>My·个人</option></select></label></section><section class="mobile-list radar-mobile-list">${picks.map(radarCard).join('')}</section><div class="button-row radar-more"><button class="secondary" data-action="radar-refresh">换一组</button><button class="secondary" data-tab="capture">记录我自己的想法</button></div><section class="mobile-card reminder-card"><div><span class="mobile-kicker">DAILY REMINDER</span><h2>让手机每天提醒你来看</h2><p>添加系统日历提醒后，即使网页没有打开，iPhone／iPad 也会按时提醒；点提醒中的链接直接回到今日雷达。</p></div><label>提醒时间<input id="radar-reminder-time" type="time" value="${esc(state.reminderTime)}"></label><button class="primary" data-action="radar-reminder">添加每日提醒到日历</button><p class="file-note">首次点击会下载日历文件，请在手机上选择“添加全部”。如已添加过，不要重复添加。</p></section>`;
}
async function saveRadar(item){
  const workspace=document.querySelector('#radar-workspace')?.value||state.radarWorkspace;state.radarWorkspace=workspace;localStorage.setItem('jinhua_radar_workspace',workspace);
  const record={localId:crypto.randomUUID(),workspace,kind:'link',title:`选题雷达｜${item.title}`,body:radarBody(item),source_url:item.url,file_name:null,mime_type:null,created_at:new Date().toISOString(),metadata:{captured_from:'mobile-radar',radar_source_id:item.id,category:item.category}};
  try{if(Cloud.configured()&&state.session&&navigator.onLine){await Cloud.createInbox({...record,localId:undefined});show('已进入云端收件箱，回到 Mac 可转为灵感或审美参考');}else{await queuePut(record);show('已保存在手机，登录联网后会同步到收件箱');}}catch(error){await queuePut(record);show('云端暂时不可用，已先保存在手机：'+error.message);}
  setRadarSaved([...radarSaved(),item.id]);await updatePending();render();
}
function calendarStamp(date){const two=value=>String(value).padStart(2,'0');return `${date.getFullYear()}${two(date.getMonth()+1)}${two(date.getDate())}T${two(date.getHours())}${two(date.getMinutes())}00`;}
function downloadRadarReminder(){
  const input=document.querySelector('#radar-reminder-time'),value=input?.value||'09:30',[hour,minute]=value.split(':').map(Number),start=new Date();start.setHours(hour,minute,0,0);if(start<=new Date())start.setDate(start.getDate()+1);state.reminderTime=value;localStorage.setItem('jinhua_radar_reminder_time',value);
  const url=new URL('./mobile.html#radar',location.href).href,created=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Lance Content Studio//Daily Radar//ZH-CN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:jinhua-daily-radar@${location.hostname||'local'}`,`DTSTAMP:${created}`,`DTSTART;TZID=Asia/Shanghai:${calendarStamp(start)}`,'RRULE:FREQ=DAILY','SUMMARY:Lance 选题雷达｜今天先看 3 个',`DESCRIPTION:打开 Lance 随身版查看今天的 3 条创意方法。\\n${url}`,`URL:${url}`,'BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY','DESCRIPTION:今天的 3 条选题雷达已经准备好','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const blobUrl=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'})),link=document.createElement('a');link.href=blobUrl;link.download='Lance选题雷达-每日提醒.ics';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(blobUrl),1000);show('日历提醒已生成，请在系统日历中确认“添加全部”');
}
function loginCard(){return `<section class="mobile-card login-box"><h2>登录随身同步</h2><p>同一个账号用于 iPhone、iPad 和 Mac。第一次使用可注册；如果开启邮件确认，请先到邮箱完成确认。</p><label>邮箱<input id="cloud-email" type="email" autocomplete="email" placeholder="你的邮箱"></label><label>密码<input id="cloud-password" type="password" autocomplete="current-password" minlength="8" placeholder="至少8位"></label><div class="button-row"><button class="primary" data-action="sign-in">登录</button><button class="secondary" data-action="sign-up">注册</button></div></section>`;}
function captureView(){
  if(!Cloud.configured())return header('MOBILE COMPANION','随手记下，回到 Mac 再完成。','当前页面可保存本机草稿；配置安全云同步后，所有设备会进入同一个收件箱。')+`<div class="notice">云同步尚未配置。请在 Mac 完成 Supabase 数据表、登录和 publishable key 配置；不要填写 secret 或 service_role。</div>`+captureForm();
  if(!state.session)return header('MOBILE COMPANION','随手记下，回到 Mac 再完成。','先登录你的私人同步空间。')+loginCard();
  return header('QUICK CAPTURE','想到什么，先留住。','不用在手机上整理成完整脚本；文字、声音和参考都会进入 Mac 收件箱。')+captureForm();
}
function captureForm(){
  const fileKinds=['voice','image','video','document','link'],accept={voice:'audio/*',image:'image/*',video:'video/*',document:'.pdf,.txt,.md,.docx',link:'image/png,image/jpeg,image/webp,application/pdf'};
  return `<section class="mobile-card"><h2>这次要记录什么</h2><div class="capture-types">${[['text','文字','一句想法'],['voice','语音','直接说下来'],['image','图片','现场与参考'],['video','视频','片段与现场'],['document','文档','需求与资料'],['link','链接','网页与网站参考']].map(([key,name,sub])=>`<button data-kind="${key}" class="${state.kind===key?'active':''}"><strong>${name}</strong><small>${sub}</small></button>`).join('')}</div><label>归入空间<select id="capture-workspace"><option value="xinxuan">My·工作</option><option value="personal">My·个人</option></select></label><label>标题<input id="capture-title" maxlength="100" value="${esc(state.kind==='link'?state.shared.title:'')}" placeholder="可以先写一个临时名字"></label><label>${state.kind==='link'?'为什么收藏／想借鉴什么':'想法／补充说明'}<textarea id="capture-body" placeholder="被什么打动、想解决什么、回到电脑后希望继续做什么……">${esc(state.kind==='link'?state.shared.body:'')}</textarea></label>${state.kind==='link'?`<label>公开链接<input id="capture-url" type="url" inputmode="url" value="${esc(state.shared.url)}" placeholder="https://"></label><div class="button-row"><button class="secondary" data-action="paste-link">从剪贴板粘贴链接</button></div><p class="file-note">ShotDeck 等登录网站只保存链接和你主动上传的截图／导出文件，不自动爬取。</p>`:''}${fileKinds.includes(state.kind)?`<label>${state.kind==='link'?'可选：上传截图或导出的PDF':`选择${labels[state.kind]}文件`}<input id="capture-file" type="file" accept="${accept[state.kind]}"></label><p class="file-note">${state.recordedFile?`已录制：${esc(state.recordedFile.name)}`:'文件会进入私人云存储；离线时先保存在此设备。'}</p>`:''}${state.kind==='voice'?`<button class="secondary voice-button ${state.recording?'recording':''}" data-action="voice"><span class="record-dot"></span>${state.recording?'停止并保存录音':'开始录音'}</button>`:''}<div class="button-row" style="margin-top:18px"><button class="primary" data-action="capture-save">保存到随身收件箱</button></div></section>`;
}
function localDrafts(){return `<section class="mobile-list">${state.localItems.map(item=>`<article class="mobile-item"><div class="item-head"><div><span class="pill">本机草稿 · ${esc(labels[item.kind]||'记录')}</span><h3>${esc(item.title||labels[item.kind]||'未命名')}</h3></div><span class="item-meta">${esc(new Date(item.created_at).toLocaleDateString('zh-CN'))}</span></div><p>${esc((item.body||item.source_url||item.file_name||'').slice(0,280))}</p><button class="danger-button" data-action="local-delete" data-id="${esc(item.localId)}">删除这条本机草稿</button></article>`).join('')||'<div class="empty">当前设备没有待同步草稿。</div>'}</section>`;}
function inboxView(){
  if(!Cloud.configured())return header('INBOX','随身收件箱','配置云同步后，手机记录会集中出现在这里。')+`<div class="notice">尚未配置云同步；本机有 ${state.pending} 条待同步草稿。你可以先查看或删除，启用云同步后再上传。</div>`+localDrafts();
  if(!state.session)return header('INBOX','随身收件箱','登录后查看所有设备记录。')+loginCard();
  return header('INBOX','随身收件箱',`${state.items.filter(x=>x.status==='inbox').length} 条等待回到 Mac 处理。`)+`<div class="button-row"><button class="secondary" data-action="sync">同步本机草稿</button><button class="secondary" data-action="refresh">刷新</button></div>${state.pending?`<h2 style="margin-top:22px">本机待同步</h2>${localDrafts()}`:''}<h2 style="margin-top:22px">云端收件箱</h2><section class="mobile-list">${state.items.map(item=>`<article class="mobile-item"><div class="item-head"><div><span class="pill ${item.status!=='inbox'?'done':''}">${item.status==='inbox'?'待处理':item.status==='imported'?'已进入Mac':'已归档'}</span><h3>${esc(item.title||labels[item.kind]||'未命名记录')}</h3></div><span class="item-meta">${esc(new Date(item.created_at).toLocaleDateString('zh-CN'))}</span></div><p>${esc((item.body||item.source_url||item.file_name||'').slice(0,280))}</p>${item.status==='inbox'?`<button class="secondary" data-action="archive" data-id="${esc(item.id)}">手机端归档</button>`:''}</article>`).join('')||'<div class="empty">收件箱还是空的。先记录一个想法。</div>'}</section>`;
}
function projectsView(){
  if(!Cloud.configured())return header('PROJECTS','项目概览','Mac 发布项目概览后，可以在手机和平板查看。')+`<div class="notice">云同步尚未配置。</div>`;
  if(!state.session)return header('PROJECTS','项目概览','登录后查看 Mac 发布的项目状态。')+loginCard();
  return header('PROJECTS','项目概览','这里只查看状态与方向，不在手机上做重型生成。')+`<div class="button-row"><button class="secondary" data-action="refresh">刷新</button></div><section class="mobile-list">${state.projects.map(item=>`<article class="mobile-item"><div class="item-head"><div><span class="pill">${item.workspace==='xinxuan'?'My·工作':'My·个人'} · ${item.kind==='project'?'项目':'脚本'}</span><h3>${esc(item.title)}</h3></div><span class="item-meta">${esc(item.status||'')}</span></div><p>${esc(item.summary||'')}</p>${item.target_date?`<div class="item-meta">目标日期：${esc(item.target_date)}</div>`:''}</article>`).join('')||'<div class="empty">Mac 还没有发布项目概览。</div>'}</section>`;
}
function accountView(){
  if(!Cloud.configured())return header('ACCOUNT','随身版设置','当前为本机草稿模式。')+`<section class="mobile-card"><h2>还差一步云配置</h2><p>在 Supabase 执行随身版权限脚本，并填写新 publishable key 后即可跨设备同步。</p><p class="account-line">绝不在网页中使用 secret 或 service_role。</p></section>`;
  if(!state.session)return header('ACCOUNT','我的同步账号','登录后管理同步状态。')+loginCard();
  return header('ACCOUNT','我的同步账号','轻量采集，不调用付费AI。')+`<section class="mobile-card"><h2>${esc(state.session.user?.email||'已登录')}</h2><p>${state.pending?`还有 ${state.pending} 条本机草稿等待同步。`:'所有本机草稿均已同步。'}</p><div class="button-row"><button class="secondary" data-action="sync">立即同步</button><button class="danger-button" data-action="sign-out">退出登录</button></div></section><section class="mobile-card"><h2>网页一键收藏</h2><p>电脑浏览器把下面按钮拖到书签栏；浏览网页时点一次，就会带着页面标题、链接和选中的文字打开 JINHUA。</p><div class="button-row"><a class="primary bookmarklet" href="${esc(bookmarklet())}">收藏到 JINHUA</a><button class="secondary" data-action="copy-bookmarklet">复制收藏按钮代码</button></div><p class="file-note">手机可使用系统分享菜单（支持网页分享目标的浏览器），或复制链接后点“从剪贴板粘贴链接”。</p></section><div class="notice">把此页面添加到主屏幕后，可像应用一样打开。数据仍以云端账号为准。</div>`;
}
function render(){
  document.querySelectorAll('.mobile-nav button').forEach(button=>button.classList.toggle('active',button.dataset.tab===state.tab));
  app.innerHTML=state.tab==='radar'?radarView():state.tab==='capture'?captureView():state.tab==='inbox'?inboxView():state.tab==='projects'?projectsView():accountView();
}
async function loadCloud(){
  state.session=await Cloud.session();await updatePending();if(!state.session){render();return;}
  try{[state.items,state.projects]=await Promise.all([Cloud.listInbox(),Cloud.listProjects()]);}catch(error){show(error.message);return;}render();
}
async function syncPending(){
  if(!state.session)throw Error('请先登录');const pending=await queueAll();
  for(const item of pending){let filePath=item.file_path||null;if(item.file){filePath=await Cloud.uploadFile(new File([item.file],item.file_name,{type:item.mime_type}));}await Cloud.createInbox({...item,file:undefined,localId:undefined,file_path:filePath});await queueDelete(item.localId);}
  await loadCloud();show(pending.length?`已同步 ${pending.length} 条本机草稿`:'没有待同步草稿');
}
async function saveCapture(){
  const fileInput=document.querySelector('#capture-file'),file=state.recordedFile||fileInput?.files?.[0]||null,workspace=document.querySelector('#capture-workspace')?.value||'xinxuan',title=document.querySelector('#capture-title')?.value.trim()||labels[state.kind],body=document.querySelector('#capture-body')?.value.trim()||'',sourceUrl=publicLink(document.querySelector('#capture-url')?.value.trim()||'');
  if(!body&&!sourceUrl&&!file)throw Error('请至少写一句话、填写链接或选择文件');
  if(file?.size>50*1024*1024)throw Error('单个附件最多50MB；较大视频请先压缩，或记录公开链接后回到Mac导入');
  const item={localId:crypto.randomUUID(),workspace,kind:state.kind,title,body,source_url:sourceUrl||null,file_name:file?.name||null,mime_type:file?.type||null,created_at:new Date().toISOString(),metadata:{captured_from:'mobile'}};
  try{
    if(Cloud.configured()&&state.session&&navigator.onLine){let filePath=null;if(file)filePath=await Cloud.uploadFile(file);await Cloud.createInbox({...item,localId:undefined,file_path:filePath});show('已进入云端收件箱');}
    else{await queuePut({...item,file});show('已保存在此设备，登录联网后会同步');}
  }catch(error){await queuePut({...item,file});show('云端暂时不可用，已保存在此设备：'+error.message);}
  state.recordedFile=null;state.shared={title:'',body:'',url:''};await updatePending();if(state.session)await loadCloud();else render();
}
async function toggleVoice(){
  if(state.recording){state.recording.recorder.stop();return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('当前浏览器不支持网页录音，可改为选择系统录音文件');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true}),chunks=[],mime=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type)),recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);state.recording={recorder,stream};recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());const type=recorder.mimeType||'audio/webm',ext=type.includes('mp4')?'m4a':'webm';state.recordedFile=new File(chunks,`语音灵感-${Date.now()}.${ext}`,{type});state.recording=null;show('录音已保存，点击下方按钮进入收件箱');};recorder.start(700);render();
}
document.addEventListener('click',async event=>{
  const tab=event.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;history.replaceState(null,'',location.pathname+location.search+'#'+state.tab);render();if(state.session&&['inbox','projects'].includes(state.tab))await loadCloud();return;}
  const kind=event.target.closest('[data-kind]');if(kind){state.kind=kind.dataset.kind;state.recordedFile=null;render();return;}
  const button=event.target.closest('[data-action]');if(!button)return;
  try{
    if(button.dataset.action==='radar-refresh'){state.radarOffset=(state.radarOffset+1)%Math.max(1,Radar.CASES.length);render();return;}
    if(button.dataset.action==='radar-save'){const item=Radar.CASES.find(value=>value.id===button.dataset.id);if(!item)throw Error('选题不存在');await saveRadar(item);return;}
    if(button.dataset.action==='radar-reminder'){downloadRadarReminder();return;}
    if(button.dataset.action==='sign-in'||button.dataset.action==='sign-up'){const email=document.querySelector('#cloud-email').value.trim(),password=document.querySelector('#cloud-password').value;if(!email||password.length<8)throw Error('请输入邮箱和至少8位密码');state.session=await (button.dataset.action==='sign-in'?Cloud.signIn(email,password):Cloud.signUp(email,password));if(!state.session?.access_token){StudioCloud.signOut();state.session=null;throw Error('注册已提交，请先到邮箱确认，再返回登录');}await syncPending();return;}
    if(button.dataset.action==='sign-out'){Cloud.signOut();state.session=null;state.items=[];state.projects=[];await updatePending();render();return;}
    if(button.dataset.action==='capture-save'){await saveCapture();return;}
    if(button.dataset.action==='paste-link'){const text=await navigator.clipboard.readText(),url=publicLink(text);state.shared={title:document.querySelector('#capture-title')?.value||'',body:document.querySelector('#capture-body')?.value||'',url};show('链接已粘贴，可补充截图和收藏原因');return;}
    if(button.dataset.action==='copy-bookmarklet'){await navigator.clipboard.writeText(bookmarklet());show('收藏按钮代码已复制');return;}
    if(button.dataset.action==='voice'){await toggleVoice();return;}
    if(button.dataset.action==='sync'){await syncPending();return;}
    if(button.dataset.action==='refresh'){await loadCloud();return;}
    if(button.dataset.action==='local-delete'){if(!confirm('只删除当前设备上的这条未同步草稿，确定继续？'))return;await queueDelete(button.dataset.id);await updatePending();render();show('本机草稿已删除');return;}
    if(button.dataset.action==='archive'){await Cloud.patchInbox(button.dataset.id,{status:'archived',updated_at:new Date().toISOString()});await loadCloud();return;}
  }catch(error){show(error.message);}
});
addEventListener('online',()=>{if(state.session)syncPending().catch(error=>show(error.message));});
addEventListener('hashchange',()=>{const tab=location.hash.slice(1);if(['radar','capture','inbox','projects','account'].includes(tab)){state.tab=tab;render();}});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./mobile-sw.js').catch(()=>{});
(async()=>{readShareIntent();await updatePending();render();if(Cloud.configured())await loadCloud();})();
