/* Uses the current workspace library and backend; never automatically crawls saved links. */
const A=StudioAesthetic;
let aestheticQuery={category:'全部',tag:'全部',search:'',favorite:false,page:1};
const aestheticStoreKey=(space=scope)=>'lance_studio_aesthetic_'+space;
const folderStoreKey=(space=scope)=>'lance_studio_folders_'+space;
function rawWorkspaceData(space){try{return JSON.parse(localStorage.getItem('lance_studio_v2_'+space)||'{}');}catch{return {};}}
function ensureScopedLibraries(){
  const complete=['xinxuan','personal'].every(space=>localStorage.getItem(aestheticStoreKey(space))!==null&&localStorage.getItem(folderStoreKey(space))!==null);
  if(localStorage.getItem('lance_studio_scope_split_v1')&&complete)return;
  let legacyItems,legacyFolders;try{legacyItems=JSON.parse(localStorage.getItem('lance_studio_aesthetic')||'[]');legacyFolders=JSON.parse(localStorage.getItem('lance_studio_folders')||'[]');}catch{throw Error('旧审美资料无法读取，原数据未覆盖');}
  if(!Array.isArray(legacyItems)||!Array.isArray(legacyFolders))throw Error('旧审美资料格式异常，原数据未覆盖');
  const split=A.splitLegacy(legacyItems,legacyFolders,{xinxuan:rawWorkspaceData('xinxuan'),personal:rawWorkspaceData('personal')});
  for(const space of ['xinxuan','personal']){if(localStorage.getItem(aestheticStoreKey(space))===null)localStorage.setItem(aestheticStoreKey(space),JSON.stringify(split[space].items));if(localStorage.getItem(folderStoreKey(space))===null)localStorage.setItem(folderStoreKey(space),JSON.stringify(split[space].folders));}
  localStorage.setItem('lance_studio_scope_split_v1',new Date().toISOString());
}
function aestheticCover(a){
  const files=Array.isArray(a?.files)?a.files:[],preferred=files.find(f=>f.localId===a.coverId&&f.kind==='image'),image=preferred||files.find(f=>f.kind==='image'),video=files.find(f=>f.kind==='video');
  if(image)return `<img src="${mediaURL(image)}" alt="${esc(a.name||'审美参考')}" loading="lazy">`;
  if(a?.legacyImage)return `<img src="${esc(a.legacyImage)}" alt="${esc(a.name||'旧版审美参考')}" loading="lazy">`;
  if(video)return `<video src="${mediaURL(video)}" muted playsinline preload="metadata"></video>`;
  return `<span class="aesthetic-placeholder"><span aria-hidden="true">${a?.isProjectAsset?(a.kind==='scene'?'◫':'◇'):(a?.link?'↗':'▣')}</span><small>${esc(a?.category||'待添加封面')}</small></span>`;
}
function loadAesthetic(){
  ensureScopedLibraries();const store=aestheticStoreKey(),raw=localStorage.getItem(store)||'[]';
  const old=scope==='personal'?localStorage.getItem('xuan_ti_ku_visual')||'[]':'[]';
  let items;try{items=A.migrate(JSON.parse(raw),JSON.parse(old));}catch{throw Error('审美库数据无法读取，未覆盖原数据。请保留旧版备份。');}
  const next=JSON.stringify(items);if(raw!==next){localStorage.setItem(store+'_previous',raw);localStorage.setItem(store,next);}return items;
}
function saveAesthetic(items,space=scope){ensureScopedLibraries();const store=aestheticStoreKey(space),prior=localStorage.getItem(store);try{if(prior)localStorage.setItem(store+'_previous',prior);localStorage.setItem(store,JSON.stringify(items));}catch{throw Error('审美库本机存储不足，原记录已保留，请先导出备份');}}
function renderAesthetic(){
  const all=folderLibraryEntries(globalAssets()),q=aestheticQuery,items=A.filter(all,q),categories=[...new Set([...A.CATEGORIES,...all.map(a=>a.category)])],tags=[...new Set(all.flatMap(a=>a.tags))].sort();
  const pages=Math.max(1,Math.ceil(items.length/24));q.page=Math.max(1,Math.min(q.page,pages));
  return hero('AESTHETIC LIBRARY','审美参考库','这里是当前空间的审美资料。My·工作与 My·个人默认隔离，需要时可手动复制单条参考。',btn('添加参考／链接','aesthetic-new','',true)+btn('批量上传','aesthetic-batch')+btn('AI语义检索','aesthetic-semantic'))+folderToolbar()+
    `<div class="aesthetic-toolbar"><label>搜索标题、标签、备注或来源<input data-aesthetic-search value="${esc(q.search)}" placeholder="例如：低饱和、追光、长镜头"></label><label>标签<select data-aesthetic-filter="tag"><option>全部</option>${tags.map(t=>`<option ${q.tag===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>${btn(q.favorite?'★ 只看收藏':'☆ 只看收藏','aesthetic-favorite-filter')}</div>
    <div class="aesthetic-filters">${['全部',...categories].map(c=>btn(`${esc(c)} <small>${c==='全部'?all.length:all.filter(a=>a.category===c).length}</small>`,'aesthetic-category',`data-category="${esc(c)}" class="${q.category===c?'active':''}"`)).join('')}</div>
    <p class="muted">上传图片、视频、音频或PDF；也可直接收藏网页／视频分享链接。链接不会自动下载或绕过登录，可补传封面。直接上传需连接本机服务。</p>
    <div class="aesthetic-grid">${items.slice((q.page-1)*24,q.page*24).map(a=>`<article class="aesthetic-card"><button class="aesthetic-cover" data-action="aesthetic-open" data-id="${esc(a.id)}">${aestheticCover(a)}<span class="aesthetic-category">${esc(a.category)}</span></button><div class="aesthetic-info"><div class="aesthetic-title"><h3>${esc(a.name)}</h3>${btn(a.favorite?'★':'☆','aesthetic-star',`data-id="${esc(a.id)}" aria-label="${a.favorite?'取消收藏':'收藏'} ${esc(a.name)}"`)}</div><div class="aesthetic-tags">${a.tags.slice(0,5).map(t=>`<span>${esc(t)}</span>`).join('')}</div><p>${esc(a.notes||'记录喜欢的光线、构图、材质或节奏')}</p><div class="actions"><small>${a.files.length} 个附件${a.link?' · 有来源链接':''}</small>${btn('查看／编辑','aesthetic-open',`data-id="${esc(a.id)}"`)}</div></div></article>`).join('')||empty('还没有匹配的参考','添加素材，或调整分类和搜索条件。')}</div>
    <div class="actions" style="margin-top:20px">${btn('上一页','aesthetic-page',`data-page="${q.page-1}" ${q.page===1?'disabled':''}`)}<span>${items.length} 条 · ${q.page}/${pages} 页</span>${btn('下一页','aesthetic-page',`data-page="${q.page+1}" ${q.page===pages?'disabled':''}`)}</div>`;
}
function aestheticDialog(a){
  const categories=[...new Set([...A.CATEGORIES,...globalAssets().map(a=>a.category)])];
  dialog(a?'参考详情与编辑':'添加审美参考',`<div class="formgrid"><label>标题<input id="aes-name" value="${esc(a?.name||'')}"></label><label>分类（可直接输入新分类）<input id="aes-category" list="aes-categories" value="${esc(a?.category||'摄影参考')}"><datalist id="aes-categories">${categories.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label><label class="wide">标签（逗号分隔）<input id="aes-tags" value="${esc((a?.tags||[]).join('，'))}" placeholder="逆光、雾气、冷暖对比"></label><label class="wide">来源链接或分享文字<textarea id="aes-link" class="short" placeholder="支持http/https网页、视频链接及含链接的分享文字">${esc(a?.link||'')}</textarea></label><label class="wide">喜欢什么／参考重点／来源说明<textarea id="aes-notes">${esc(a?.notes||'')}</textarea></label></div>
    ${folderMembership(a)}${a?.link?`<p><a href="${esc(A.link(a.link))}" target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a></p>`:''}
    ${a?`<h3>附件与封面</h3><div class="grid">${a.files.map(f=>`<div class="card">${f.kind==='audio'?`<audio controls src="${mediaURL(f)}"></audio>`:mediaMarkup(f)}<p>${esc(f.name||f.kind)}</p></div>`).join('')}${a.legacyImage?`<img class="media" src="${esc(a.legacyImage)}" alt="旧版参考图">`:''}</div><label>卡片封面<select id="aes-cover"><option value="">自动选择</option>${a.files.filter(f=>f.kind==='image').map(f=>`<option value="${esc(f.localId)}" ${a.coverId===f.localId?'selected':''}>${esc(f.name||'参考图')}</option>`).join('')}</select></label><p class="muted">可一次选择多个附件。追加时会一并保存当前文字修改。</p>${upload('追加图片／视频／音频／PDF','aesthetic-files',`data-id="${esc(a.id)}" multiple`,'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/mp4,application/pdf')}`:'<p class="muted">先建立参考卡，再追加附件；批量上传会按每个文件建立一张参考卡。</p>'}`,
    btn('保存参考','aesthetic-save',a?`data-id="${esc(a.id)}"`:'',true)+(a?btn(`复制到 ${scope==='personal'?'My·工作':'My·个人'}`,'aesthetic-copy',`data-id="${esc(a.id)}"`):''));
}
async function aestheticAction(action,e){
  if(e.dataset.id?.startsWith('asset:')){const item=db.assets.find(a=>a.id===e.dataset.id.slice(6));if(!item)throw Error('资料不存在');if(action==='aesthetic-open'){route={view:'asset',id:item.id};render();return;}if(action==='aesthetic-star'){item.favorite=!item.favorite;save();render();return;}}
  const all=globalAssets(),a=all.find(x=>x.id===e.dataset.id);
  if(action==='aesthetic-semantic'){const items=A.filter(folderLibraryEntries(all),{...aestheticQuery,search:''});if(!items.length)throw Error('当前文件夹或筛选下没有参考');if(items.length>100)throw Error('请先选择项目文件夹或分类，将范围缩小到100条以内');dialog('AI审美语义检索',`<p>范围：当前空间、文件夹与分类下的 ${items.length} 条参考。按视觉含义和文字描述寻找相近参考，不是自动训练个人模型。</p><label>想找什么？<textarea id="semantic-query" placeholder="例如：冷色长廊尽头的一束暖光，有孤独但坚定的感觉"></textarea></label><p class="muted">首次会将这些参考的描述及封面图发送给方舟向量模型，产生按量费用。相同素材和模型复用本机缓存；链接不自动抓取，视频需先有关键帧。</p>`,btn('确认范围并检索','aesthetic-semantic-run','',true));return;}
  if(action==='aesthetic-semantic-run'){const query=$('#semantic-query').value.trim();if(!query)throw Error('请填写要找的审美方向');const items=A.filter(folderLibraryEntries(all),{...aestheticQuery,search:''});const requestScope=scope;close();let result;await withJob('审美语义检索',1,async()=>{const task=await api('reference/search',{scope:requestScope,query,items:items.map(a=>({id:a.id,text:[a.name,a.category,(a.tags||[]).join(' '),a.notes,a.requirements].filter(Boolean).join('\n').slice(0,6000),imageId:(a.files.find(f=>f.localId===a.coverId&&f.kind==='image')||a.files.find(f=>f.kind==='image'))?.localId}))});result=await pollJob(task.jobId);progress('相关参考已排序');});if(result&&result.scope===scope)dialog('语义检索结果',`<p class="muted">${esc(query)} · ${esc(result.model)}。相似度只用于排序，不代表质量判断。</p><div class="grid">${result.matches.map(match=>{const a=items.find(a=>a.id===match.id);return a?`<div class="card">${aestheticCover(a)}<h3>${esc(a.name)}</h3><p>${esc(a.notes||'')}</p>${btn('打开参考','aesthetic-open',`data-id="${esc(a.id)}"`)}</div>`:'';}).join('')}</div>`);return;}
  if(action==='aesthetic-new'){aestheticDialog(null);return;}
  if(action==='aesthetic-copy'){if(!a)throw Error('参考不存在');const target=scope==='personal'?'xinxuan':'personal',existing=JSON.parse(localStorage.getItem(aestheticStoreKey(target))||'[]');if(existing.some(x=>x.copiedFrom?.scope===scope&&x.copiedFrom?.id===a.id))throw Error('目标空间已有这份参考的副本');const copy=C.clone(a);copy.id=C.uid();copy.name=a.name+'（来自'+(scope==='personal'?'My·个人':'My·工作')+'）';copy.folderIds=[];copy.usedIn=[];copy.copiedFrom={scope,id:a.id};copy.createdAt=copy.updatedAt=new Date().toISOString();existing.push(copy);saveAesthetic(existing,target);close();notify('已复制到'+(target==='personal'?'My·个人':'My·工作')+'；两个副本之后互不影响。');return;}
  if(action==='aesthetic-open'){if(!a)throw Error('参考不存在');aestheticDialog(a);return;}
  if(action==='aesthetic-category'){aestheticQuery.category=e.dataset.category;aestheticQuery.page=1;render();return;}
  if(action==='aesthetic-favorite-filter'){aestheticQuery.favorite=!aestheticQuery.favorite;aestheticQuery.page=1;render();return;}
  if(action==='aesthetic-page'){aestheticQuery.page=Number(e.dataset.page);render();return;}
  if(action==='aesthetic-star'){if(!a)throw Error('参考不存在');a.favorite=!a.favorite;saveAesthetic(all);render();return;}
  if(action==='aesthetic-batch'){dialog('批量上传审美参考',`<label>本批分类（可自定义）<input id="aes-batch-category" value="摄影参考"></label><label>本批标签（逗号分隔）<input id="aes-batch-tags"></label><p class="muted">每个文件建立一张卡片，单文件最多250MB。失败会逐项提示，已成功的不会丢失。支持图片、视频、音频与PDF。</p>`,upload('选择多个文件','aesthetic-batch','multiple','image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/mp4,application/pdf'));return;}
  if(action==='aesthetic-save'){
    const link=A.link($('#aes-link').value),name=$('#aes-name').value.trim();if(!name&&!link)throw Error('请填写标题或来源链接');
    const record=a||A.entry(name||new URL(link).hostname);record.name=name||new URL(link).hostname;record.category=$('#aes-category').value.trim()||'其他';record.tags=A.tags($('#aes-tags').value);record.notes=$('#aes-notes').value.trim();record.requirements=record.notes;record.link=link;record.coverId=$('#aes-cover')?.value||null;record.updatedAt=new Date().toISOString();
    record.folderIds=selectedFolders('material-folder');if(!a)all.push(record);saveAesthetic(all);close();render();notify('参考已保存，可继续追加附件');if(!a)aestheticDialog(record);return;
  }
}
async function aestheticFiles(e){
  if(job)throw Error('请等待当前任务完成');const files=[...e.files];if(!files.length)return;
  const batch=e.dataset.upload==='aesthetic-batch',id=e.dataset.id,category=$('#aes-batch-category')?.value.trim()||'摄影参考',tags=A.tags($('#aes-batch-tags')?.value||'');
  if(!batch){const all=globalAssets(),a=all.find(a=>a.id===id);if(!a)throw Error('参考不存在');const link=A.link($('#aes-link').value);a.name=$('#aes-name').value.trim()||a.name;a.category=$('#aes-category').value.trim()||'其他';a.tags=A.tags($('#aes-tags').value);a.notes=$('#aes-notes').value.trim();a.requirements=a.notes;a.folderIds=selectedFolders('material-folder');a.link=link;a.coverId=$('#aes-cover')?.value||null;saveAesthetic(all);}
  const errors=[];await withJob('保存审美参考附件',files.length,async()=>{await ensureService();for(const file of files){if(stop)break;try{const media=await api('upload',file);media.name=file.name;const all=globalAssets();const a=batch?A.entry(file.name.replace(/\.[^.]+$/,'')):all.find(a=>a.id===id);if(!a)throw Error('参考不存在');if(batch){a.category=category;a.tags=tags;a.folderIds=referenceFolders().some(f=>f.id===referenceFolder)?[referenceFolder]:[];all.push(a);}a.files.push(media);a.updatedAt=new Date().toISOString();saveAesthetic(all);}catch(error){errors.push(file.name+'：'+error.message);}progress(file.name);}if(errors.length)throw Error('部分失败：'+errors.join('；'));});
  close();if(!batch){const a=globalAssets().find(a=>a.id===id);if(a)aestheticDialog(a);}render();if(errors.length)notify('部分失败，已成功的素材已保存：'+errors.join('；'));
}
document.addEventListener('input',event=>{if(!event.target.hasAttribute('data-aesthetic-search'))return;aestheticQuery.search=event.target.value;aestheticQuery.page=1;const pos=event.target.selectionStart;render();$('[data-aesthetic-search]').focus();$('[data-aesthetic-search]').setSelectionRange(pos,pos);});
document.addEventListener('change',event=>{if(!event.target.dataset.aestheticFilter)return;aestheticQuery[event.target.dataset.aestheticFilter]=event.target.value;aestheticQuery.page=1;render();});
