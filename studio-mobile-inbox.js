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
  const safeLink=mobileSafeLink(item.source_url),primary=item.kind==='link'?btn(current?'整理进审美库':'切换空间并整理','mobile-link-organize',`data-id="${esc(item.id)}"`,true):btn(current?'确认进入正式资料':'切换空间并导入','mobile-import',`data-id="${esc(item.id)}"`,true);return `<article class="card mobile-inbox-card ${item.status!=='inbox'?'mobile-inbox-done':''}"><div class="shot-title"><div><span class="badge">${esc(mobileWorkspaceLabel(item.workspace))} · ${esc(mobileKindLabel(item.kind))} · ${status}</span><h3>${esc(item.title||mobileKindLabel(item.kind))}</h3></div><small>${esc(new Date(item.created_at).toLocaleString('zh-CN'))}</small></div><p class="preview-copy">${esc(item.body||item.source_url||item.file_name||'无补充说明')}</p>${safeLink?`<p><a href="${esc(safeLink)}" target="_blank" rel="noopener noreferrer">打开来源链接 ↗</a></p>`:''}${item.file_name?`<p class="muted">附件：${esc(item.file_name)}</p>`:''}${item.status==='inbox'?`<div class="actions">${primary}${btn('归档','mobile-archive',`data-id="${esc(item.id)}"`)}</div>`:''}</article>`;
}

function mobileLinkDialog(item){
  const url=mobileSafeLink(item.source_url),host=url?new URL(url).hostname.replace(/^www\./,''):'',shotdeck=/(^|\.)shotdeck\.com$/i.test(host),categories=[...new Set([...A.CATEGORIES,...globalAssets().map(a=>a.category)])];
  dialog('整理网页收藏',`<div class="callout"><strong>${shotdeck?'ShotDeck 内部参考模式':'先确认，再进入正式审美库'}</strong><br>${shotdeck?'只保存原始链接、你的说明及主动上传的截图／PDF；不会自动抓取网站内容。':'系统不会因为一条链接自动判断你的审美，先补充“为什么喜欢”再归档。'}</div><div class="formgrid"><label>标题<input id="mobile-link-title" value="${esc(item.title||host||'网页参考')}"></label><label>分类<input id="mobile-link-category" list="mobile-link-categories" value="摄影参考"><datalist id="mobile-link-categories">${categories.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label><label class="wide">标签（逗号分隔）<input id="mobile-link-tags" value="${esc(shotdeck?'ShotDeck，待整理':'网页收藏，待整理')}"></label><label>使用范围标记<select id="mobile-link-usage"><option value="internal-reference" selected>仅内部视觉参考</option><option value="link-only">只保存链接</option><option value="owned">本人／团队原创素材</option><option value="licensed">已确认授权素材</option></select></label><label>来源网站<input id="mobile-link-site" value="${esc(host)}"></label><label class="wide">为什么喜欢／准备借鉴什么<textarea id="mobile-link-notes">${esc(item.body||'')}</textarea></label></div>${folderMembership({folderIds:[]})}${item.file_name?`<p class="muted">将同时导入附件：${esc(item.file_name)}</p>`:''}`,
    btn('确认进入审美库','mobile-link-import',`data-id="${esc(item.id)}"`,true)+btn('改存为灵感文字','mobile-link-fragment',`data-id="${esc(item.id)}"`));
}

async function refreshMobileInbox(){
  if(!StudioCloud.configured()||MobileInbox.loading)return;
  MobileInbox.loading=true;MobileInbox.error='';if(route.view==='inbox')render();
  try{MobileInbox.session=await StudioCloud.session();MobileInbox.items=MobileInbox.session?await StudioCloud.listInbox():[];MobileInbox.loaded=true;}
  catch(error){MobileInbox.error=error.message;MobileInbox.session=null;}
  finally{MobileInbox.loading=false;if(route.view==='inbox')render();}
}

async function importMobileItem(item,options={}){
  if(item.workspace!==scope){scope=item.workspace;localStorage.setItem('lance_studio_scope',scope);db=read(scope);}
  const now=new Date().toISOString();
  if(item.kind==='link'&&options.destination!=='fragment'){
    const asset=A.entry(options.title||item.title||'网页参考');asset.category=options.category||'摄影参考';asset.tags=A.tags(options.tags||'网页收藏，待整理');asset.notes=options.notes||item.body||'';asset.requirements=asset.notes;asset.link=mobileSafeLink(item.source_url);asset.sourceSite=options.sourceSite||(asset.link?new URL(asset.link).hostname:'');asset.sourceUsage=options.sourceUsage||'internal-reference';asset.folderIds=options.folderIds||[];asset.mobileSource={id:item.id,capturedAt:item.created_at};
    if(item.file_path){const blob=await StudioCloud.downloadFile(item.file_path),file=new File([blob],item.file_name||'网页参考附件',{type:item.mime_type||blob.type||'application/octet-stream'}),uploaded=await api('upload',file);uploaded.name=file.name;asset.files=[uploaded];}
    asset.updatedAt=now;const all=globalAssets();all.push(asset);saveAesthetic(all);
  }else if(['text','link','voice'].includes(item.kind)){
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
  if(action==='mobile-link-organize'){if(item.workspace!==scope){scope=item.workspace;localStorage.setItem('lance_studio_scope',scope);db=read(scope);save();}mobileLinkDialog(item);return;}
  if(action==='mobile-link-import'){await importMobileItem(item,{title:$('#mobile-link-title').value.trim(),category:$('#mobile-link-category').value.trim()||'摄影参考',tags:$('#mobile-link-tags').value,notes:$('#mobile-link-notes').value.trim(),sourceSite:$('#mobile-link-site').value.trim(),sourceUsage:$('#mobile-link-usage').value,folderIds:selectedFolders('material-folder')});close();route={view:'aesthetic'};render();notify('网页收藏已进入审美库');return;}
  if(action==='mobile-link-fragment'){await importMobileItem(item,{destination:'fragment'});close();route={view:'fragments'};render();notify('网页收藏已改存为灵感文字');return;}
  if(action==='mobile-import'){await importMobileItem(item);route={view:'inbox'};render();notify(`已进入 ${mobileWorkspaceLabel(scope)} 的${['text','link','voice'].includes(item.kind)?'灵感库':'审美参考库'}`);return;}
}
