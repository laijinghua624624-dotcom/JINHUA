/* Desktop handoff for the lightweight mobile companion. No paid AI is called here. */
'use strict';
const MobileInbox={session:StudioCloud.readSession(),items:[],loading:false,loaded:false,error:''};

function mobileWorkspaceLabel(value){return value==='personal'?'My·个人':'My·工作';}
function mobileKindLabel(value){return ({text:'文字灵感',voice:'语音灵感',image:'图片参考',video:'视频参考',document:'文档资料',link:'链接收藏'})[value]||'随身记录';}
function mobileSafeLink(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
function mobileLoginCard(){return `<div class="panel mobile-inbox-login"><h2>登录私人同步空间</h2><p class="muted">iPhone、iPad 与 Mac 使用同一个邮箱账号。公开页面只使用 publishable key；管理员密钥永远不进入浏览器。</p><div class="formgrid"><label>邮箱<input id="mobile-cloud-email" type="email" autocomplete="email"></label><label>密码<input id="mobile-cloud-password" type="password" autocomplete="current-password" minlength="8"></label></div><div class="actions">${btn('登录','mobile-sign-in','',true)}${btn('注册','mobile-sign-up')}</div></div>`;}

function renderMobileInbox(){
  if(!StudioCloud.configured())return hero('MOBILE INBOX','随身收件箱','手机和平板只负责快速记录；回到 Mac 后在这里进入正式创作流程。',`<a class="upload" href="mobile.html" target="_blank" rel="noopener">打开随身版 ↗</a>`)+`<div class="callout"><strong>代码已就绪，云同步尚未启用。</strong><br>先在目标 Supabase 项目执行 <code>supabase/mobile_companion.sql</code>，再把轮换后的 Project URL 与 publishable key 写入 <code>mobile-config.js</code>。不要使用 secret 或 service_role。</div><div class="panel"><h2>随身版的边界</h2><p>支持文字、语音、图片、视频、文档与链接；离线时先存当前设备。它不调用付费AI、不生成图片或视频，也不承担完整脚本编辑。</p></div>`;
  if(!MobileInbox.session)return hero('MOBILE INBOX','随身收件箱','登录后读取你从 iPhone 或 iPad 留下的记录。',`<a class="upload" href="mobile.html" target="_blank" rel="noopener">打开随身版 ↗</a>`)+mobileLoginCard();
  if(!MobileInbox.loaded&&!MobileInbox.loading)queueMicrotask(()=>refreshMobileInbox());
  const pending=MobileInbox.items.filter(item=>item.status==='inbox');
  return hero('MOBILE INBOX','随身收件箱',`当前空间：${mobileWorkspaceLabel(scope)}。手机内容只有在这里确认后，才会写入正式资料库。`,btn('刷新','mobile-refresh')+btn('发布项目概览到手机','mobile-publish','',true)+btn('退出同步账号','mobile-sign-out'))+
    `${MobileInbox.error?`<p class="missing">${esc(MobileInbox.error)}</p>`:''}<div class="metrics"><div class="card"><div class="metric">${pending.length}</div><small>待处理</small></div><div class="card"><div class="metric">${MobileInbox.items.filter(x=>x.status==='imported').length}</div><small>已进入 Mac</small></div><div class="card"><div class="metric">${MobileInbox.items.filter(x=>x.workspace===scope&&x.status==='inbox').length}</div><small>当前空间</small></div></div><div class="list mobile-inbox-list">${MobileInbox.loading?'<div class="empty"><h2>正在同步…</h2></div>':MobileInbox.items.map(item=>mobileInboxCard(item)).join('')||empty('收件箱是空的','在手机随身版记录文字、语音或参考资料，它们会出现在这里。')}</div>`;
}

function mobileInboxCard(item){
  const current=item.workspace===scope,status=item.status==='inbox'?'待处理':item.status==='imported'?'已进入 Mac':'已归档';
  const safeLink=mobileSafeLink(item.source_url);return `<article class="card mobile-inbox-card ${item.status!=='inbox'?'mobile-inbox-done':''}"><div class="shot-title"><div><span class="badge">${esc(mobileWorkspaceLabel(item.workspace))} · ${esc(mobileKindLabel(item.kind))} · ${status}</span><h3>${esc(item.title||mobileKindLabel(item.kind))}</h3></div><small>${esc(new Date(item.created_at).toLocaleString('zh-CN'))}</small></div><p class="preview-copy">${esc(item.body||item.source_url||item.file_name||'无补充说明')}</p>${safeLink?`<p><a href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer">打开来源链接 ↗</a></p>`:''}${item.file_name?`<p class="muted">附件：${esc(item.file_name)}</p>`:''}${item.status==='inbox'?`<div class="actions">${btn(current?'确认进入正式资料':'切换空间并导入','mobile-import',`data-id="${esc(item.id)}"`,true)}${btn('归档','mobile-archive',`data-id="${esc(item.id)}"`)}</div>`:''}</article>`;
}

async function refreshMobileInbox(){
  if(!StudioCloud.configured()||MobileInbox.loading)return;
  MobileInbox.loading=true;MobileInbox.error='';if(route.view==='inbox')render();
  try{MobileInbox.session=await StudioCloud.session();MobileInbox.items=MobileInbox.session?await StudioCloud.listInbox():[];MobileInbox.loaded=true;}
  catch(error){MobileInbox.error=error.message;MobileInbox.session=null;}
  finally{MobileInbox.loading=false;if(route.view==='inbox')render();}
}

async function importMobileItem(item){
  if(item.workspace!==scope){scope=item.workspace;localStorage.setItem('lance_studio_scope',scope);db=read(scope);}
  const now=new Date().toISOString();
  if(['text','link','voice'].includes(item.kind)){
    const fragment=StudioFragments.create(item.body||item.source_url||'',item.kind);
    fragment.title=item.title||mobileKindLabel(item.kind);fragment.sourceUrl=item.source_url||'';fragment.mobileSource={id:item.id,capturedAt:item.created_at};
    if(item.kind==='voice'&&item.file_path){const blob=await StudioCloud.downloadFile(item.file_path);fragment.audioKey='voice-'+C.uid();fragment.audioMime=item.mime_type||blob.type||'audio/webm';await StudioPpt.putExport(fragment.audioKey,blob);}
    if(!Array.isArray(db.fragments))db.fragments=[];db.fragments.push(fragment);save();
  }else{
    if(!item.file_path)throw Error('这条资料没有可下载附件');
    const blob=await StudioCloud.downloadFile(item.file_path),file=new File([blob],item.file_name||mobileKindLabel(item.kind),{type:item.mime_type||blob.type||'application/octet-stream'}),uploaded=await api('upload',file);
    uploaded.name=file.name;
    const asset=A.entry(item.title||file.name);asset.category=item.kind==='image'?'摄影参考':item.kind==='video'?'分镜参考':'其他';asset.notes=item.body||'来自随身收件箱';asset.link=item.source_url||'';asset.files=[uploaded];asset.mobileSource={id:item.id,capturedAt:item.created_at};asset.updatedAt=now;
    const all=globalAssets();all.push(asset);saveAesthetic(all);
  }
  await StudioCloud.patchInbox(item.id,{status:'imported',imported_at:now,updated_at:now});
  MobileInbox.items=await StudioCloud.listInbox();MobileInbox.loaded=true;
}

function mobileProjectRows(){
  const projectRows=db.projects.map(project=>{const personal=isPersonalProject(project),count=(project.topicIds||[]).length,target=personal?count:C.sessionTarget(project);return {workspace:scope,source_id:'project:'+project.id,kind:'project',title:project.title,summary:(project.idea||project.fields?.outline||'').slice(0,500),status:personal?`${count}条关联内容`:`${count}/${target}条脚本 · ${project.stage==='full'?'完整交付':'方向阶段'}`,target_date:project.date||'',payload:{topicCount:count,targetCount:target,stage:project.stage||'direction'}};});
  const topicRows=db.topics.map(topic=>{const personal=scope==='personal',status=personal?'个人选题':topic.quick?.stage==='full'?`完整交付 ${C.quickStatus(topic).percent}%`:'方向阶段';return {workspace:scope,source_id:'topic:'+topic.id,kind:'topic',title:topic.title,summary:(topic.idea||topic.quick?.fields?.outline||'').slice(0,500),status,target_date:'',payload:{projectId:topic.projectId||null,stage:topic.quick?.stage||'direction'}};});
  return [...projectRows,...topicRows];
}

async function mobileInboxAction(action,e){
  if(action==='mobile-sign-in'||action==='mobile-sign-up'){
    const email=$('#mobile-cloud-email')?.value.trim(),password=$('#mobile-cloud-password')?.value||'';if(!email||password.length<8)throw Error('请输入邮箱和至少8位密码');
    const result=await (action==='mobile-sign-in'?StudioCloud.signIn(email,password):StudioCloud.signUp(email,password));
    if(!result?.access_token){StudioCloud.signOut();throw Error('注册已提交，请先到邮箱确认，再返回登录');}
    MobileInbox.session=result;MobileInbox.loaded=false;await refreshMobileInbox();notify('随身同步已登录');return;
  }
  if(action==='mobile-sign-out'){StudioCloud.signOut();MobileInbox.session=null;MobileInbox.items=[];MobileInbox.loaded=false;render();return;}
  if(action==='mobile-refresh'){MobileInbox.loaded=false;await refreshMobileInbox();return;}
  if(action==='mobile-publish'){const rows=mobileProjectRows();await StudioCloud.publishProjects(rows);notify(`已把当前空间的 ${rows.length} 个项目／脚本概览发布到手机`);return;}
  const item=MobileInbox.items.find(x=>x.id===e.dataset.id);if(!item)throw Error('随身记录不存在或已被移动');
  if(action==='mobile-archive'){await StudioCloud.patchInbox(item.id,{status:'archived',updated_at:new Date().toISOString()});await refreshMobileInbox();return;}
  if(action==='mobile-import'){await importMobileItem(item);route={view:'inbox'};render();notify(`已进入 ${mobileWorkspaceLabel(scope)} 的${['text','link','voice'].includes(item.kind)?'灵感库':'审美参考库'}`);return;}
}
