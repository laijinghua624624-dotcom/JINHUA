/* JINHUA mobile companion: capture first, sync securely, finish on Mac. */
'use strict';

const Cloud=StudioCloud;
const Radar=StudioRadar;
const app=document.querySelector('#mobile-app');
const syncState=document.querySelector('#sync-state');
const toast=document.querySelector('#mobile-toast');
const TABS=['radar','capture','inbox','projects','account'];
const DRAFT_KEY='jinhua_mobile_capture_draft_v2';
const DAILY_KEY='jinhua_mobile_radar_daily_v2';
const PREFER_KEY='jinhua_mobile_radar_preferred';
const MUTED_KEY='jinhua_mobile_radar_muted';
const labels={text:'文字灵感',voice:'语音灵感',image:'图片参考',video:'视频参考',document:'文档资料',link:'链接收藏'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const readJSON=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
const initialTab=TABS.includes(location.hash.slice(1))?location.hash.slice(1):'radar';
const initialDraft={workspace:'xinxuan',title:'',body:'',url:'',kind:'text',...readJSON(DRAFT_KEY,{})};
const state={
  tab:initialTab,kind:labels[initialDraft.kind]?initialDraft.kind:'text',session:null,
  items:[],projects:[],localItems:[],pending:0,message:null,recording:null,
  recordedFile:null,selectedFile:null,captureDraft:initialDraft,
  radarOffset:0,radarCurrent:[],radarSeen:[],radarRemaining:0,radarReset:false,radarDate:'',
  radarWorkspace:localStorage.getItem('jinhua_radar_workspace')||'xinxuan',
  radarPreferred:readJSON(PREFER_KEY,[]),radarMuted:readJSON(MUTED_KEY,[]),
  reminderTime:localStorage.getItem('jinhua_radar_reminder_time')||'09:30'
};
let toastTimer=null;

function purgeLegacyReverseJSON(){
  for(const scope of ['xinxuan','personal']){
    localStorage.removeItem('xuan_ti_ku_reverse_'+scope);
    const key='lance_studio_v2_'+scope,stored=localStorage.getItem(key);
    if(!stored)continue;
    try{
      const data=JSON.parse(stored);
      if(!Array.isArray(data.reverse))continue;
      data.reverse=data.reverse.filter(r=>!r?.legacyId&&!r?.legacy);
      for(const r of data.reverse){delete r.history;delete r.legacyId;delete r.legacy;if(r.analysis)delete r.analysis.legacyStoryboard;}
      delete data.reverseMigrationError;
      localStorage.setItem(key,JSON.stringify(data));
    }catch{}
  }
}
purgeLegacyReverseJSON();
if('scrollRestoration'in history)history.scrollRestoration='manual';

function publicLink(value){
  if(!value)return '';
  const match=String(value).match(/https?:\/\/[^\s<>"'，。；、【】「」]+/i);
  if(!match)throw Error('链接格式不正确');
  let url;
  try{url=new URL(match[0].replace(/[)\]）!！?？,;]+$/,''));}catch{throw Error('链接格式不正确');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('只支持公开的 http 或 https 链接');
  url.hash='';
  for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);
  return url.href;
}
function sameLink(a,b){try{return publicLink(a)===publicLink(b);}catch{return false;}}
function localDayKey(date=new Date()){
  return Radar.dayKey?Radar.dayKey(date,'Asia/Shanghai'):new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

function persistCaptureDraft(){state.captureDraft.kind=state.kind;localStorage.setItem(DRAFT_KEY,JSON.stringify(state.captureDraft));}
function clearCaptureDraft(){
  state.captureDraft={workspace:state.captureDraft.workspace||'xinxuan',title:'',body:'',url:'',kind:state.kind};
  state.recordedFile=null;state.selectedFile=null;persistCaptureDraft();
}
function syncCaptureForm(){
  const fields={workspace:document.querySelector('#capture-workspace'),title:document.querySelector('#capture-title'),body:document.querySelector('#capture-body'),url:document.querySelector('#capture-url')};
  for(const [key,field] of Object.entries(fields))if(field)state.captureDraft[key]=field.value;
  persistCaptureDraft();
}
function readShareIntent(){
  const params=new URLSearchParams(location.search),text=params.get('text')||'',url=params.get('url')||'';
  if(!params.get('title')&&!text&&!url)return;
  let sharedUrl='';try{sharedUrl=publicLink(url||text);}catch{}
  state.tab='capture';state.kind=sharedUrl?'link':'text';
  state.captureDraft={workspace:state.captureDraft.workspace||'xinxuan',title:(params.get('title')||'').slice(0,100),body:text.replace(/https?:\/\/\S+/g,'').trim(),url:sharedUrl,kind:state.kind};
  persistCaptureDraft();history.replaceState(null,'',location.pathname+'#capture');
}
function captureHome(){return new URL('./mobile.html',location.href).href.split(/[?#]/)[0];}
function bookmarklet(){
  const target=JSON.stringify(captureHome());
  return `javascript:(()=>{const s=window.getSelection?String(window.getSelection()):'',u=${target}+'?kind=link&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&text='+encodeURIComponent(s);window.open(u,'_blank','noopener')||location.assign(u)})()`;
}

function renderToast(){
  if(!toast)return;
  if(!state.message){toast.hidden=true;toast.innerHTML='';return;}
  const action=state.message.action;
  toast.dataset.tone=state.message.tone||'info';
  toast.setAttribute('role',state.message.tone==='error'?'alert':'status');
  toast.innerHTML=`<span>${esc(state.message.text)}</span>${action?`<button data-action="${esc(action.name)}" ${action.id?`data-id="${esc(action.id)}"`:''}>${esc(action.label)}</button>`:''}`;
  toast.hidden=false;
}
function show(text,tone='info',action=null,duration=5000){
  state.message={text,tone,action};renderToast();clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{if(state.message?.text===text){state.message=null;renderToast();}},duration);
}
async function withBusy(button,label,task){
  const old=button?.textContent;
  if(button){button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=label;}
  try{return await task();}finally{if(button?.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.textContent=old;}}
}
function scrollTopNow(){requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));}

function openQueue(){return new Promise((resolve,reject)=>{const req=indexedDB.open('jinhua_mobile_queue',1);req.onupgradeneeded=()=>req.result.createObjectStore('items',{keyPath:'localId'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function queueStore(mode,value){
  const db=await openQueue();
  return new Promise((resolve,reject)=>{const tx=db.transaction('items',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('items');let req;if(mode==='put')req=store.put(value);else if(mode==='delete')req=store.delete(value);else req=store.getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();});
}
const queueAll=()=>queueStore('read');
const queuePut=value=>queueStore('put',value);
const queueDelete=id=>queueStore('delete',id);
async function updatePending(){
  state.localItems=await queueAll();state.pending=state.localItems.length;
  syncState.textContent=state.session?(state.pending?`${state.pending}条待同步`:'云端已连接'):(state.pending?`${state.pending}条本机草稿`:'本机草稿');
  syncState.classList.toggle('offline',!state.session||state.pending>0);
}
function header(kicker,title,copy){return `<section class="mobile-hero"><div class="mobile-kicker">${kicker}</div><h1>${title}</h1><p>${copy}</p></section>`;}

function radarSaved(){const value=readJSON('jinhua_mobile_radar_saved',[]);return Array.isArray(value)?value:[];}
function setRadarSaved(values){localStorage.setItem('jinhua_mobile_radar_saved',JSON.stringify([...new Set(values)]));}
function radarHistory(){const value=readJSON('jinhua_mobile_radar_seen',[]);return Array.isArray(value)?value:[];}
state.radarSeen=radarHistory();
function radarPool(){const muted=new Set(state.radarMuted),filtered=Radar.CASES.filter(item=>!muted.has(item.category));return filtered.length>=3?filtered:Radar.CASES;}
function radarSeed(key){return Number(key.replace(/\D/g,''))||Math.floor(Date.now()/86400000);}
function radarPicks(force=false){
  const date=localDayKey(),pool=radarPool(),cached=readJSON(DAILY_KEY,null);
  if(!force&&state.radarCurrent.length&&state.radarDate===date)return state.radarCurrent;
  if(!force&&state.radarOffset===0&&cached?.date===date&&Array.isArray(cached.ids)){
    const restored=cached.ids.map(id=>pool.find(item=>item.id===id)).filter(Boolean);
    if(restored.length===Math.min(3,pool.length)){
      state.radarCurrent=restored;state.radarDate=date;
      state.radarRemaining=Math.max(0,pool.length-state.radarSeen.filter(id=>pool.some(item=>item.id===id)).length);
      return restored;
    }
  }
  const batch=Radar.mobileBatch(pool,state.radarSeen,radarSeed(date)+state.radarOffset*97,3,state.radarPreferred);
  state.radarCurrent=batch.items;state.radarSeen=batch.seen;state.radarRemaining=batch.remaining;state.radarReset=batch.reset;state.radarDate=date;
  localStorage.setItem('jinhua_mobile_radar_seen',JSON.stringify(batch.seen));
  localStorage.setItem(DAILY_KEY,JSON.stringify({date,ids:batch.items.map(item=>item.id)}));
  return state.radarCurrent;
}
function ensureDailyRadar(notify=false){
  const date=localDayKey();if(state.radarDate&&state.radarDate===date)return false;
  const previous=state.radarDate;state.radarDate=date;state.radarOffset=0;state.radarCurrent=[];radarPicks();
  if(previous&&notify)show('已换上今天的 3 个视觉方向','success');
  if(previous&&state.tab==='radar'){render();scrollTopNow();}
  return Boolean(previous);
}
function radarBody(item){return [`【选题雷达】${item.category} · ${item.type}`,item.visualFocus?`视觉重点：${item.visualFocus}`:'',`目标：${item.goal}`,`创意机制：${item.mechanism}`,`开场8秒：${item.hook}`,`情绪／故事弧：${item.arc}`,`摄影／美术／舞台：${item.craft}`,`封面方向：${item.cover}`,`我可以迁移：${item.transfer}`,`不能照搬：${item.avoid}`,`AI参与：${item.ai}`,`落地风险：${item.risk}`].filter(Boolean).join('\n');}
function radarCard(item){
  const saved=radarSaved().includes(item.id),base=location.hostname.endsWith('github.io')?'https://lance-content-studio.onrender.com':'',preview=item.poster?`${base}/api/radar-preview?url=${encodeURIComponent(item.poster)}`:'';
  const visual=preview?`<img src="${esc(preview)}" alt="${esc(item.title)}案例预览" loading="lazy" onload="const b=this.closest('.radar-mobile-visual');if(this.naturalWidth<120||this.naturalHeight<80){b.classList.add('image-failed');this.remove()}else b.classList.add('image-loaded')" onerror="this.closest('.radar-mobile-visual').classList.add('image-failed');this.remove()">`:`<div class="radar-mobile-placeholder"><span>${esc(item.visualFocus||item.category)}</span></div>`;
  return `<article class="radar-mobile-card ${item.visualFocus?'visual-first':''}"><a class="radar-mobile-visual" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${visual}<span class="radar-visual-source">${esc(item.site||'案例来源')} · 只看原片 ↗</span></a><div class="radar-mobile-content"><div class="radar-mobile-top"><span class="pill">${esc(item.visualFocus||item.category)}</span><small>${esc(item.category)} · ${esc(item.type)}</small></div><h2>${esc(item.title)}</h2><p class="radar-mobile-mechanism">${esc(item.mechanism)}</p><dl><div><dt>${item.visualFocus?'画面为什么值得看':'创意为什么成立'}</dt><dd>${esc(item.craft)}</dd></div><div><dt>我可以怎么拍</dt><dd>${esc(item.transfer)}</dd></div></dl><details class="radar-mobile-details radar-mobile-cn"><summary>中文看片卡 · 英文不用硬读</summary><div><b>这是什么</b><p>${esc(item.goal)}</p><b>故事怎么走</b><p>${esc(item.arc)}</p><b>开场8秒</b><p>${esc(item.hook)}</p><b>封面怎么判断</b><p>${esc(item.cover)}</p><b>注意别照搬</b><p>${esc([item.avoid,item.risk].filter(Boolean).join('；'))}</p></div></details><div class="button-row"><a class="secondary mobile-link-button" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">值得看，再开原片 ↗</a><button class="primary" data-action="radar-save" data-id="${esc(item.id)}" ${saved?'disabled':''}>${saved?'已进收件箱':'收下这个选题'}</button></div><div class="radar-feedback"><button data-action="radar-more-like" data-category="${esc(item.category)}">多看此类</button><button data-action="radar-less" data-category="${esc(item.category)}">少看此类</button></div></div></article>`;
}
function radarView(){
  const picks=radarPicks(),today=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date()),visualCount=picks.filter(item=>item.visualFocus).length;
  localStorage.setItem('jinhua_mobile_radar_last_viewed',localDayKey());
  return header('VISUAL RADAR','今天先看 3 个视觉方向。','每天自动换新；先看图片和中文看片卡，有价值再进入原站。')+
    `<section class="radar-mobile-toolbar"><div><span class="radar-date">${esc(today)} · 案例池还有 ${state.radarRemaining} 条待轮换</span><strong>${visualCount}条视觉 + ${picks.length-visualCount}条创意</strong></div><label>保存到<select id="radar-workspace"><option value="xinxuan" ${state.radarWorkspace==='xinxuan'?'selected':''}>My·工作</option><option value="personal" ${state.radarWorkspace==='personal'?'selected':''}>My·个人</option></select></label><button class="secondary radar-refresh-top" data-action="radar-refresh">换一组</button></section>`+
    `<section class="mobile-list radar-mobile-list">${picks.map(radarCard).join('')}</section><div class="button-row radar-more"><button class="secondary" data-action="radar-refresh">换一组 · 本轮不重复</button><button class="secondary" data-tab="capture">记录我自己的想法</button></div>`+
    `<section class="mobile-card reminder-card"><div><span class="mobile-kicker">CALENDAR REMINDER</span><h2>每天定时提醒我来看</h2><p>这是固定文案的系统日历提醒，不是动态推送；打开后会自动显示当天新内容。</p></div><label>提醒时间<input id="radar-reminder-time" type="time" value="${esc(state.reminderTime)}"></label><button class="primary" data-action="radar-reminder">添加每日日历提醒</button><p class="file-note">首次点击会下载日历文件，请在系统日历中确认“添加全部”；不要重复添加。</p></section>`;
}

async function saveRadar(item){
  const workspace=document.querySelector('#radar-workspace')?.value||state.radarWorkspace;
  state.radarWorkspace=workspace;localStorage.setItem('jinhua_radar_workspace',workspace);
  const duplicate=state.items.find(value=>value.status==='inbox'&&sameLink(value.source_url,item.url));
  if(duplicate){setRadarSaved([...radarSaved(),item.id]);render();show('这个链接已在待处理收件箱中','info',{name:'toast-inbox',label:'查看'});return;}
  const record={localId:crypto.randomUUID(),workspace,kind:'link',title:`选题雷达｜${item.title}`,body:radarBody(item),source_url:item.url,file_name:null,mime_type:null,created_at:new Date().toISOString(),metadata:{captured_from:'mobile-radar',radar_source_id:item.id,category:item.category,visual_focus:item.visualFocus||''}};
  let message,tone='success';
  try{
    if(Cloud.configured()&&state.session&&navigator.onLine){await Cloud.createInbox({...record,localId:undefined});message='已进入云端收件箱';}
    else{await queuePut(record);message='已保存在手机，联网后会同步';}
  }catch(error){await queuePut(record);message='云端暂时不可用，已先保存在手机：'+error.message;tone='warning';}
  setRadarSaved([...radarSaved(),item.id]);await updatePending();if(state.session)await loadCloud(false);render();show(message,tone,{name:'toast-inbox',label:'查看收件箱'});
}
function calendarStamp(date){const two=value=>String(value).padStart(2,'0');return `${date.getFullYear()}${two(date.getMonth()+1)}${two(date.getDate())}T${two(date.getHours())}${two(date.getMinutes())}00`;}
function downloadRadarReminder(){
  const input=document.querySelector('#radar-reminder-time'),value=input?.value||'09:30',[hour,minute]=value.split(':').map(Number),start=new Date();
  start.setHours(hour,minute,0,0);if(start<=new Date())start.setDate(start.getDate()+1);
  state.reminderTime=value;localStorage.setItem('jinhua_radar_reminder_time',value);
  const url=new URL('./mobile.html#radar',location.href).href,created=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Lance Content Studio//Daily Radar//ZH-CN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:jinhua-daily-radar@${location.hostname||'local'}`,`DTSTAMP:${created}`,`DTSTART;TZID=Asia/Shanghai:${calendarStamp(start)}`,'RRULE:FREQ=DAILY','SUMMARY:Lance 视觉雷达｜来看今天的 3 个方向',`DESCRIPTION:提醒文案固定，打开后内容每天更新。\\n${url}`,`URL:${url}`,'BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY','DESCRIPTION:打开 Lance 查看今日更新的视觉雷达','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const blobUrl=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'})),link=document.createElement('a');
  link.href=blobUrl;link.download='Lance视觉雷达-每日提醒.ics';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(blobUrl),1000);
  show('日历提醒已生成，请在系统日历中确认添加','success');
}

function loginCard(){
  return `<section class="mobile-card login-box"><h2>登录随身同步</h2><p>同一个账号用于 iPhone、iPad 和 Mac。第一次使用可注册；如果开启邮件确认，请先到邮箱完成确认。</p><label>邮箱<input id="cloud-email" type="email" autocomplete="email" placeholder="你的邮箱"></label><label>密码<input id="cloud-password" type="password" autocomplete="current-password" minlength="8" placeholder="至少8位"></label><div class="button-row"><button class="primary" data-action="sign-in">登录</button><button class="secondary" data-action="sign-up">注册</button></div></section>`;
}
function captureView(){
  if(!Cloud.configured())return header('MOBILE COMPANION','随手记下，回到 Mac 再完成。','当前页面可保存本机草稿；配置安全云同步后，所有设备会进入同一个收件箱。')+`<div class="notice">尚未配置云同步。你可以先记录，系统会保存本机草稿。</div>`+captureForm();
  if(!state.session)return header('MOBILE COMPANION','随手记下，回到 Mac 再完成。','先登录你的私人同步空间。')+loginCard();
  return header('QUICK CAPTURE','想到什么，先留住。','草稿会自动保留；切换类型、页面或锁屏都不会丢失。')+captureForm();
}
function captureForm(){
  const fileKinds=['voice','image','video','document','link'],accept={voice:'audio/*',image:'image/*',video:'video/*',document:'.pdf,.txt,.md,.docx',link:'image/png,image/jpeg,image/webp,application/pdf'},draft=state.captureDraft,chosen=state.recordedFile||state.selectedFile;
  return `<section class="mobile-card"><h2>这次要记录什么</h2><div class="capture-types">${[['text','文字','一句想法'],['voice','语音','直接说下来'],['image','图片','现场与参考'],['video','视频','片段与现场'],['document','文档','需求与资料'],['link','链接','网页与网站参考']].map(([key,name,sub])=>`<button data-kind="${key}" class="${state.kind===key?'active':''}"><strong>${name}</strong><small>${sub}</small></button>`).join('')}</div>`+
    `<label>归入空间<select id="capture-workspace"><option value="xinxuan" ${draft.workspace==='xinxuan'?'selected':''}>My·工作</option><option value="personal" ${draft.workspace==='personal'?'selected':''}>My·个人</option></select></label><label>标题<input id="capture-title" maxlength="100" value="${esc(draft.title)}" placeholder="可以先写一个临时名字"></label><label>${state.kind==='link'?'为什么收藏／想借鉴什么':'想法／补充说明'}<textarea id="capture-body" placeholder="被什么打动、想解决什么、回到电脑后希望继续做什么……">${esc(draft.body)}</textarea></label>`+
    `${state.kind==='link'?`<label>公开链接<input id="capture-url" type="url" inputmode="url" value="${esc(draft.url)}" placeholder="https://"></label><div class="button-row"><button class="secondary" data-action="paste-link">从剪贴板粘贴链接</button></div><p class="file-note">ShotDeck 等登录网站只保存链接和你主动上传的截图／导出文件，不自动读取账号内容。</p>`:''}`+
    `${fileKinds.includes(state.kind)?`<label>${state.kind==='link'?'可选：上传截图或导出的PDF':`选择${labels[state.kind]}文件`}<input id="capture-file" type="file" accept="${accept[state.kind]}"></label><p class="file-note">${chosen?`已选择：${esc(chosen.name)}`:'文件会进入私人云存储；离线时先保存在此设备。'}</p>`:''}`+
    `${state.kind==='voice'?`<button class="secondary voice-button ${state.recording?'recording':''}" data-action="voice"><span class="record-dot"></span>${state.recording?'停止并保存录音':'开始录音'}</button>`:''}<div class="button-row capture-submit"><button class="primary" data-action="capture-save">保存到随身收件箱</button><small>已开启本机草稿自动保存</small></div></section>`;
}
function localDrafts(){
  return `<section class="mobile-list">${state.localItems.map(item=>`<article class="mobile-item"><div class="item-head"><div><span class="pill">本机草稿 · ${esc(labels[item.kind]||'记录')}</span><h3>${esc(item.title||labels[item.kind]||'未命名')}</h3></div><span class="item-meta">${esc(new Date(item.created_at).toLocaleDateString('zh-CN'))}</span></div><p>${esc((item.body||item.source_url||item.file_name||'').slice(0,280))}</p><button class="danger-button" data-action="local-delete" data-id="${esc(item.localId)}">删除这条本机草稿</button></article>`).join('')||'<div class="empty">当前设备没有待同步草稿。</div>'}</section>`;
}
function inboxView(){
  if(!Cloud.configured())return header('INBOX','随身收件箱','配置云同步后，手机记录会集中出现在这里。')+`<div class="notice">尚未配置云同步；本机有 ${state.pending} 条待同步草稿。</div>`+localDrafts();
  if(!state.session)return header('INBOX','随身收件箱','登录后查看所有设备记录。')+loginCard();
  return header('INBOX','随身收件箱',`${state.items.filter(x=>x.status==='inbox').length} 条等待回到 Mac 处理。`)+`<div class="button-row"><button class="secondary" data-action="sync">同步本机草稿</button><button class="secondary" data-action="refresh">刷新</button></div>${state.pending?`<h2 class="section-title">本机待同步</h2>${localDrafts()}`:''}<h2 class="section-title">云端收件箱</h2><section class="mobile-list">${state.items.map(item=>`<article class="mobile-item"><div class="item-head"><div><span class="pill ${item.status!=='inbox'?'done':''}">${item.status==='inbox'?'待处理':item.status==='imported'?'已进入Mac':'已归档'}</span><h3>${esc(item.title||labels[item.kind]||'未命名记录')}</h3></div><span class="item-meta">${esc(new Date(item.created_at).toLocaleDateString('zh-CN'))}</span></div><p>${esc((item.body||item.source_url||item.file_name||'').slice(0,280))}</p>${item.status==='inbox'?`<button class="secondary" data-action="archive" data-id="${esc(item.id)}">手机端归档</button>`:''}</article>`).join('')||'<div class="empty">收件箱还是空的。先记录一个想法。</div>'}</section>`;
}
function projectsView(){
  if(!Cloud.configured())return header('PROJECTS','项目概览','Mac 发布项目概览后，可以在手机和平板查看。')+`<div class="notice">云同步尚未配置。</div>`;
  if(!state.session)return header('PROJECTS','项目概览','登录后查看 Mac 发布的项目状态。')+loginCard();
  return header('PROJECTS','项目概览','这里只查看状态与方向，不在手机上做重型生成。')+`<div class="button-row"><button class="secondary" data-action="refresh">刷新</button></div><section class="mobile-list">${state.projects.map(item=>`<article class="mobile-item"><div class="item-head"><div><span class="pill">${item.workspace==='xinxuan'?'My·工作':'My·个人'} · ${item.kind==='project'?'项目':'脚本'}</span><h3>${esc(item.title)}</h3></div><span class="item-meta">${esc(item.status||'')}</span></div><p>${esc(item.summary||'')}</p>${item.target_date?`<div class="item-meta">目标日期：${esc(item.target_date)}</div>`:''}</article>`).join('')||'<div class="empty"><strong>Mac 还没有发布项目概览</strong><p>回到 Mac 工作台选择项目并发布，然后回此页点“刷新”。</p></div>'}</section>`;
}
function accountView(){
  if(!Cloud.configured())return header('ACCOUNT','随身版设置','当前为本机草稿模式。')+`<section class="mobile-card"><h2>还差一步云配置</h2><p>在 Supabase 执行随身版权限脚本，并填写新 publishable key 后即可跨设备同步。</p></section>`;
  if(!state.session)return header('ACCOUNT','我的同步账号','登录后管理同步状态。')+loginCard();
  return header('ACCOUNT','我的同步账号','轻量采集，不调用付费AI。')+`<section class="mobile-card"><h2>${esc(state.session.user?.email||'已登录')}</h2><p>${state.pending?`还有 ${state.pending} 条本机草稿等待同步。`:'所有本机草稿均已同步。'}</p><div class="button-row"><button class="secondary" data-action="sync">立即同步</button><button class="danger-button" data-action="sign-out">退出登录</button></div></section>`+
    `<section class="mobile-card"><h2>从其他网页一键收藏</h2><div class="mobile-share-guide"><strong>iPhone／iPad</strong><p>在喜欢的网页点系统“分享”，选择 Lance 随身；标题、链接和选中文字会自动带入。若分享菜单没有出现，先复制链接，再到“记录 → 链接”粘贴。</p><button class="primary" data-tab="capture" data-kind-open="link">打开链接收藏</button></div><div class="desktop-bookmarklet"><strong>Mac／电脑浏览器</strong><p>把下面按钮拖到书签栏。以后浏览任何网页时点一次，会在新页签打开 JINHUA 并带入页面信息。</p><div class="button-row"><a class="primary bookmarklet" href="${esc(bookmarklet())}">收藏到 JINHUA</a><button class="secondary" data-action="copy-bookmarklet">复制收藏按钮代码</button></div></div></section><div class="notice">把此页面添加到主屏幕后，可像应用一样打开。数据仍以云端账号为准。</div>`;
}

function render(){
  document.querySelectorAll('.mobile-nav button').forEach(button=>button.classList.toggle('active',button.dataset.tab===state.tab));
  app.innerHTML=state.tab==='radar'?radarView():state.tab==='capture'?captureView():state.tab==='inbox'?inboxView():state.tab==='projects'?projectsView():accountView();
  renderToast();
}
async function loadCloud(shouldRender=true){
  state.session=await Cloud.session();await updatePending();if(!state.session){if(shouldRender)render();return;}
  try{[state.items,state.projects]=await Promise.all([Cloud.listInbox(),Cloud.listProjects()]);}catch(error){show(error.message,'error');return;}
  if(shouldRender)render();
}

async function syncPending(){
  if(!state.session)throw Error('请先登录');
  const pending=await queueAll();
  for(const item of pending){
    let filePath=item.file_path||null;
    if(item.file)filePath=await Cloud.uploadFile(new File([item.file],item.file_name,{type:item.mime_type}));
    await Cloud.createInbox({...item,file:undefined,localId:undefined,file_path:filePath});
    await queueDelete(item.localId);
  }
  await loadCloud();show(pending.length?`已同步 ${pending.length} 条本机草稿`:'没有待同步草稿','success');
}
async function saveCapture(){
  syncCaptureForm();
  const file=state.recordedFile||state.selectedFile||document.querySelector('#capture-file')?.files?.[0]||null;
  const workspace=state.captureDraft.workspace||'xinxuan',title=state.captureDraft.title.trim()||labels[state.kind],body=state.captureDraft.body.trim()||'',sourceUrl=publicLink(state.captureDraft.url.trim()||'');
  if(!body&&!sourceUrl&&!file){document.querySelector(state.kind==='link'?'#capture-url':'#capture-body')?.focus({preventScroll:true});throw Error('请至少写一句话、填写链接或选择文件');}
  if(file?.size>50*1024*1024)throw Error('单个附件最多50MB；较大视频请先压缩，或记录公开链接后回到Mac导入');
  if(sourceUrl&&state.items.some(item=>item.status==='inbox'&&sameLink(item.source_url,sourceUrl))){show('这个链接已在待处理收件箱中，未重复保存','info',{name:'toast-inbox',label:'查看'});return;}
  const item={localId:crypto.randomUUID(),workspace,kind:state.kind,title,body,source_url:sourceUrl||null,file_name:file?.name||null,mime_type:file?.type||null,created_at:new Date().toISOString(),metadata:{captured_from:'mobile'}};
  let message,tone='success';
  try{
    if(Cloud.configured()&&state.session&&navigator.onLine){let filePath=null;if(file)filePath=await Cloud.uploadFile(file);await Cloud.createInbox({...item,localId:undefined,file_path:filePath});message='已进入云端收件箱';}
    else{await queuePut({...item,file});message='已保存在此设备，登录联网后会同步';}
  }catch(error){await queuePut({...item,file});message='云端暂时不可用，已保存在此设备：'+error.message;tone='warning';}
  clearCaptureDraft();await updatePending();if(state.session)await loadCloud(false);render();show(message,tone,{name:'toast-inbox',label:'查看收件箱'});
}
async function toggleVoice(){
  if(state.recording){state.recording.recorder.stop();return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('当前浏览器不支持网页录音，可改为选择系统录音文件');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true}),chunks=[],mime=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type)),recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
  state.recording={recorder,stream};
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  recorder.onstop=()=>{stream.getTracks().forEach(track=>track.stop());const type=recorder.mimeType||'audio/webm',ext=type.includes('mp4')?'m4a':'webm';state.recordedFile=new File(chunks,`语音灵感-${Date.now()}.${ext}`,{type});state.recording=null;render();show('录音已留在草稿中，点下方按钮即可进入收件箱','success');};
  recorder.start(700);render();
}
async function navigate(tab,kind=null){
  if(state.tab==='capture')syncCaptureForm();state.tab=tab;
  if(kind&&labels[kind]){state.kind=kind;state.captureDraft.kind=kind;persistCaptureDraft();}
  history.replaceState(null,'',location.pathname+location.search+'#'+state.tab);render();scrollTopNow();
  if(state.session&&['inbox','projects'].includes(state.tab))await loadCloud();
}
async function archiveItem(id){
  const item=state.items.find(value=>value.id===id);if(!item)return;
  await Cloud.patchInbox(id,{status:'archived',updated_at:new Date().toISOString()});await loadCloud();
  show('已归档，可在 8 秒内撤销','success',{name:'undo-archive',label:'撤销',id},8000);
}
async function undoArchive(id){await Cloud.patchInbox(id,{status:'inbox',updated_at:new Date().toISOString()});await loadCloud();show('已恢复到待处理收件箱','success');}

document.addEventListener('input',event=>{
  if(!['capture-title','capture-body','capture-url'].includes(event.target.id))return;
  const key={'capture-title':'title','capture-body':'body','capture-url':'url'}[event.target.id];state.captureDraft[key]=event.target.value;persistCaptureDraft();
});
document.addEventListener('change',event=>{
  if(event.target.id==='capture-workspace'){state.captureDraft.workspace=event.target.value;persistCaptureDraft();}
  if(event.target.id==='capture-file')state.selectedFile=event.target.files?.[0]||null;
  if(event.target.id==='radar-workspace'){state.radarWorkspace=event.target.value;localStorage.setItem('jinhua_radar_workspace',state.radarWorkspace);}
  if(event.target.id==='radar-reminder-time'){state.reminderTime=event.target.value;localStorage.setItem('jinhua_radar_reminder_time',state.reminderTime);}
});
document.addEventListener('click',async event=>{
  const tab=event.target.closest('[data-tab]');if(tab){await navigate(tab.dataset.tab,tab.dataset.kindOpen||null);return;}
  const kind=event.target.closest('[data-kind]');
  if(kind){syncCaptureForm();state.kind=kind.dataset.kind;state.captureDraft.kind=state.kind;state.recordedFile=null;state.selectedFile=null;persistCaptureDraft();render();return;}
  const button=event.target.closest('[data-action]');if(!button)return;
  try{
    if(button.dataset.action==='radar-refresh'){
      await withBusy(button,'换新中…',async()=>{state.radarOffset+=1;state.radarCurrent=[];radarPicks(true);render();scrollTopNow();show(state.radarReset?`上一轮 ${radarPool().length} 条已轮换完，现在开始新一轮`:'已换一组，本轮不重复','success');});return;
    }
    if(button.dataset.action==='radar-save'){const item=Radar.CASES.find(value=>value.id===button.dataset.id);if(!item)throw Error('选题不存在');await withBusy(button,'保存中…',()=>saveRadar(item));return;}
    if(button.dataset.action==='radar-more-like'||button.dataset.action==='radar-less'){
      const category=button.dataset.category;
      if(button.dataset.action==='radar-more-like'){state.radarPreferred=[category,...state.radarPreferred.filter(value=>value!==category)].slice(0,4);state.radarMuted=state.radarMuted.filter(value=>value!==category);show(`以后优先给你更多“${category}”`,'success');}
      else{state.radarMuted=[...new Set([...state.radarMuted,category])];state.radarPreferred=state.radarPreferred.filter(value=>value!==category);show(`本轮将减少“${category}”`,'success');}
      localStorage.setItem(PREFER_KEY,JSON.stringify(state.radarPreferred));localStorage.setItem(MUTED_KEY,JSON.stringify(state.radarMuted));state.radarOffset+=1;state.radarCurrent=[];radarPicks(true);render();scrollTopNow();return;
    }
    if(button.dataset.action==='radar-reminder'){downloadRadarReminder();return;}
    if(button.dataset.action==='sign-in'||button.dataset.action==='sign-up'){
      const email=document.querySelector('#cloud-email').value.trim(),password=document.querySelector('#cloud-password').value;
      if(!email||password.length<8)throw Error('请输入邮箱和至少8位密码');
      await withBusy(button,'处理中…',async()=>{state.session=await (button.dataset.action==='sign-in'?Cloud.signIn(email,password):Cloud.signUp(email,password));if(!state.session?.access_token){StudioCloud.signOut();state.session=null;throw Error('注册已提交，请先到邮箱确认，再返回登录');}await syncPending();});return;
    }
    if(button.dataset.action==='sign-out'){Cloud.signOut();state.session=null;state.items=[];state.projects=[];await updatePending();render();show('已退出登录','success');return;}
    if(button.dataset.action==='capture-save'){await withBusy(button,'保存中…',saveCapture);return;}
    if(button.dataset.action==='paste-link'){syncCaptureForm();const text=await navigator.clipboard.readText(),url=publicLink(text);state.captureDraft.url=url;persistCaptureDraft();render();show('链接已粘贴，可补充收藏原因','success');return;}
    if(button.dataset.action==='copy-bookmarklet'){await navigator.clipboard.writeText(bookmarklet());show('收藏按钮代码已复制，可在电脑浏览器新建书签后粘贴到网址栏','success');return;}
    if(button.dataset.action==='voice'){await toggleVoice();return;}
    if(button.dataset.action==='sync'){await withBusy(button,'同步中…',syncPending);return;}
    if(button.dataset.action==='refresh'){await withBusy(button,'刷新中…',async()=>{await loadCloud();show('已刷新云端状态','success');});return;}
    if(button.dataset.action==='local-delete'){if(!confirm('只删除当前设备上的这条未同步草稿，确定继续？'))return;await queueDelete(button.dataset.id);await updatePending();render();show('本机草稿已删除','success');return;}
    if(button.dataset.action==='archive'){await withBusy(button,'归档中…',()=>archiveItem(button.dataset.id));return;}
    if(button.dataset.action==='undo-archive'){await withBusy(button,'恢复中…',()=>undoArchive(button.dataset.id));return;}
    if(button.dataset.action==='toast-inbox'){state.message=null;await navigate('inbox');return;}
  }catch(error){show(error.message,'error');}
});

addEventListener('online',()=>{if(state.session)syncPending().catch(error=>show(error.message,'error'));});
addEventListener('hashchange',()=>{const tab=location.hash.slice(1);if(TABS.includes(tab)){if(state.tab==='capture')syncCaptureForm();state.tab=tab;render();scrollTopNow();}});
addEventListener('pageshow',()=>ensureDailyRadar(true));
addEventListener('focus',()=>ensureDailyRadar(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)ensureDailyRadar(true);});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./mobile-sw.js').catch(()=>{});

(async()=>{readShareIntent();ensureDailyRadar();await updatePending();render();if(Cloud.configured())await loadCloud();})();
