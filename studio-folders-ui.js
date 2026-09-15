let referenceFolder='all';
function referenceFolders(){ensureScopedLibraries();const data=JSON.parse(localStorage.getItem(folderStoreKey())||'[]');if(!Array.isArray(data)||data.some(f=>!f||typeof f.id!=='string'||typeof f.name!=='string'))throw Error('文件夹数据异常，原数据未覆盖');return data;}
function saveReferenceFolders(items,space=scope){ensureScopedLibraries();const store=folderStoreKey(space),old=localStorage.getItem(store);if(old)localStorage.setItem(store+'_previous',old);localStorage.setItem(store,JSON.stringify(items));}
function folderChoices(selected=[],name='reference-folder'){return referenceFolders().map(f=>`<label><input type="checkbox" name="${name}" value="${esc(f.id)}" ${selected.includes(f.id)?'checked':''}> ${esc(f.name)}</label>`).join('')||'<p class="muted">先在审美参考中新建文件夹。</p>';}
function selectedFolders(name='reference-folder'){const valid=new Set(referenceFolders().map(f=>f.id));return [...document.querySelectorAll(`[name="${name}"]:checked`)].map(e=>e.value).filter(id=>valid.has(id));}
function folderMembership(a,kind){return `<div class="panel"><h3>选用于哪些项目参考文件夹</h3><p class="muted">原素材始终保留在总审美库。这里是项目引用，不是搬走素材。</p>${folderChoices(a?.folderIds|| (referenceFolder!=='all'&&referenceFolder!=='unfiled'?[referenceFolder]:[]),'material-folder')}${kind?btn('保存文件夹归属','folder-asset-save',`data-id="${esc(a.id)}"`):''}</div>`;}
function folderToolbar(){const folders=referenceFolders();if(referenceFolder!=='all'&&referenceFolder!=='unfiled'&&!folders.some(f=>f.id===referenceFolder))referenceFolder='all';return `<div class="panel"><div class="section-head"><h2>项目参考文件夹</h2>${btn('新建文件夹','folder-new','',true)}</div><div class="actions">${btn('总审美库 · 全部资料','folder-open','data-id="all"')}${btn('尚未选入项目','folder-open','data-id="unfiled"')}${folders.map(f=>btn(esc(f.name),'folder-open',`data-id="${esc(f.id)}" class="${referenceFolder===f.id?'primary':''}"`)).join('')}</div><p class="muted">这里只显示 ${scope==='personal'?'My·个人':'My·工作'} 的审美与项目参考，不会自动读取另一个空间。文件夹从当前总库挑选素材；一个素材可用于当前空间的多个项目。</p>${folders.filter(f=>f.id===referenceFolder).map(f=>`<h3>${esc(f.name)}</h3><p>${esc(f.description||'例如：双十一我冠是军。写下本项目要借鉴什么，以及哪些不要照搬。')}</p>${btn('从总审美库挑选／整理','folder-manage',`data-id="${f.id}"`)}`).join('')}<div class="actions" style="margin-top:14px">${btn('新建场景资料','new-asset','data-kind="scene"')}${btn('新建服装资料','new-asset','data-kind="wardrobe"')}</div></div>`;}
function referenceCatalog(shared=globalAssets()){const local=db.assets.filter(a=>['scene','wardrobe'].includes(a.kind)).map(a=>({...a,id:'asset:'+a.id,tags:A.tags(a.category),category:a.kind==='scene'?'场景':'服装',notes:a.requirements||a.analysis||a.dimensions||a.inventory||'',link:'',files:[...(a.files||[]),...[C.selected(a.proposal)].filter(Boolean)],usedIn:[],isProjectAsset:true}));return [...shared,...local];}
function folderLibraryEntries(shared){const all=referenceCatalog(shared);const existing=new Set(referenceFolders().map(f=>f.id));return all.filter(a=>referenceFolder==='all'||(referenceFolder==='unfiled'?!StudioFolders.ids(a.folderIds).some(id=>existing.has(id)):StudioFolders.ids(a.folderIds).includes(referenceFolder)));}
function resolvedReferences(entity,kind='topic'){const project=kind==='project'?entity:db.projects.find(p=>p.id===entity?.projectId);return StudioFolders.resolve(globalAssets(),db.assets,scope,entity,project);}
function referenceContext(entity,kind='topic'){const r=resolvedReferences(entity,kind);return {folders:referenceFolders().filter(f=>r.folderIds.includes(f.id)).map(f=>({name:f.name,description:f.description})),aesthetic:r.shared.map(a=>({name:a.name,category:a.category,tags:a.tags,notes:a.notes,sourceLink:a.link,linkNotRead:!!a.link})),assets:r.assets.map(a=>({name:a.name,kind:a.kind,dimensions:a.dimensions,dimensionsConfirmed:a.dimensionsConfirmed,requirements:a.requirements,inventory:a.inventory,analysis:a.analysis,selectedOutfits:a.outfits?.filter(o=>o.selected)}))};}
function folderImageIDs(entity,kind='topic'){const r=resolvedReferences(entity,kind);return [...new Set([...r.assets.flatMap(a=>[C.selected(a.proposal),...(a.outfits||[]).filter(o=>o.selected).map(o=>a.frames?.[o.frameIndex]),...(a.files||[])]),...r.shared.flatMap(a=>a.files||[])].filter(a=>C.assetOK(a,'image')).map(a=>a.localId))].slice(0,4);}
function folderBindings(entity,kind){if(!entity)return '';const own=StudioFolders.ids(entity.folderIds),project=kind==='topic'?db.projects.find(p=>p.id===entity.projectId):null,inherited=StudioFolders.ids(project?.folderIds).filter(id=>!own.includes(id)),folders=referenceFolders(),r=resolvedReferences(entity,kind);return `<div class="panel"><div class="section-head"><h2>本项目的针对性参考</h2><div class="actions">${btn('新建项目参考文件夹','folder-new',`data-owner-kind="${kind}" data-owner-id="${entity.id}"`,true)}${btn('选择参考文件夹','folder-bind',`data-kind="${kind}" data-id="${entity.id}"`)}</div></div><p class="muted">总库是长期审美积累，不会把全部收藏自动用在这次创作。${kind==='topic'?'本条选择的文件夹与所属专场／项目的文件夹合并使用，素材去重。':'本项目的文件夹会供整体规划和所属脚本使用。'} 会使用文字说明与最多4张有效图片；链接不代表已读取网页，视频需先提取关键帧。</p><div class="actions">${[...own,...inherited].map(id=>{const f=folders.find(f=>f.id===id);return f?`<span class="actions">${btn(esc(f.name)+(inherited.includes(id)?'（项目继承）':''),'folder-open',`data-id="${esc(id)}"`)}${btn('挑选／调整参考','folder-manage',`data-id="${esc(id)}"`)}</span>`:'<span class="missing">关联文件夹缺失，请重新选择</span>';}).join('')||'<span class="muted">尚未关联文件夹</span>'}</div><p class="muted">当前可用：${r.shared.length}项审美素材、${r.assets.length}项场景／服装资料。此前直接关联的项目资料继续有效。</p></div>`;}

function folderPickerHTML(materials,folder){
  const categories=[...new Set(materials.map(a=>a.category))].sort();
  return `<h3>从当前空间总审美库挑选参考</h3><p class="muted">取消勾选只解除本文件夹的引用，不删除原素材。筛选不会清除已勾选项。调整会影响当前空间内所有关联它的项目，不影响另一个空间。</p>
    <div class="aesthetic-toolbar"><label>搜索总库素材<input id="folder-picker-search" placeholder="标题、分类、标签、喜欢的细节"></label><label>参考分类<select id="folder-picker-category"><option value="">全部分类</option>${categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label></div>
    <label><input id="folder-picker-favorite" type="checkbox"> 只看收藏</label><p id="folder-picker-count" class="muted" aria-live="polite"></p>
    <div class="folder-picker-grid">${materials.map(a=>`<label class="folder-picker-card" data-folder-pick data-name="${esc(a.name)}" data-category="${esc(a.category)}" data-tags="${esc((a.tags||[]).join(' '))}" data-notes="${esc(a.notes||'')}" data-link="${esc(a.link||'')}" data-favorite="${!!a.favorite}">
      <span class="folder-picker-cover">${aestheticCover(a)}</span><span class="folder-picker-label"><input type="checkbox" name="folder-member" value="${esc(a.isProjectAsset?a.id:'aesthetic:'+a.id)}" ${a.folderIds?.includes(folder?.id)?'checked':''}> ${esc(a.name)}</span>
      <small>${esc(a.category)}${a.favorite?' · ★ 已收藏':''}</small><small>${esc((a.notes||'').slice(0,120))}</small></label>`).join('')}</div><p id="folder-picker-empty" class="muted" hidden>没有匹配的参考。可调整筛选，或先建空文件夹，稍后继续添加。</p>`;
}
function updateFolderPicker(){
  if(!$('#folder-picker-search'))return;
  const query={search:$('#folder-picker-search').value,category:$('#folder-picker-category').value,favorite:$('#folder-picker-favorite').checked};
  const cards=[...document.querySelectorAll('[data-folder-pick]')];
  let visible=0,selected=0;
  for(const card of cards){
    const d=card.dataset;card.hidden=!StudioFolders.pickerMatch({...d,tags:[d.tags],favorite:d.favorite==='true'},query);
    if(!card.hidden)visible++;if(card.querySelector('input').checked)selected++;
  }
  $('#folder-picker-count').textContent=`已选 ${selected} 项 · 当前显示 ${visible} / ${cards.length} 项`;
  $('#folder-picker-empty').hidden=visible>0;
}
document.addEventListener('input',e=>{if(e.target.id==='folder-picker-search')updateFolderPicker();});
document.addEventListener('change',e=>{if(['folder-picker-category','folder-picker-favorite'].includes(e.target.id)||e.target.name==='folder-member')updateFolderPicker();});
function folderOwner(e){const kind=e.dataset.ownerKind,id=e.dataset.ownerId;if(!id)return null;const entity=(kind==='project'?db.projects:db.topics).find(x=>x.id===id);if(!entity)throw Error('原项目或脚本不存在，请关闭后重试');return entity;}
async function folderAction(action,e){
  const folders=referenceFolders(),f=folders.find(f=>f.id===e.dataset.id);
  if(action==='folder-open'){referenceFolder=e.dataset.id;aestheticQuery={category:'全部',tag:'全部',search:'',favorite:false,page:1};route={view:'aesthetic'};render();return;}
  if(action==='folder-new'||action==='folder-manage'){
    if(action==='folder-manage'&&!f)throw Error('文件夹不存在');
    const owner=folderOwner(e),ownerAttrs=owner?`data-owner-kind="${esc(e.dataset.ownerKind)}" data-owner-id="${esc(owner.id)}"`:'';
    dialog(f?'编辑项目参考文件夹':'新建项目参考文件夹',`
      ${owner?`<p class="muted">保存后自动关联到「${esc(owner.title)}」，留在当前工作台继续创作。</p>`:''}
      <label>文件夹名称<input id="folder-name" value="${esc(f?.name||(owner?owner.title+' · 项目参考':''))}" placeholder="例如：双十一我冠是军"></label>
      <label>本项目参考重点／不要照搬的部分<textarea id="folder-description" placeholder="例如：参考隧道光路与战鼓情绪，服装仍按本项目人物调整；场景需适配实际尺寸。">${esc(f?.description||'')}</textarea></label>
      ${folderPickerHTML(referenceCatalog(),f)}`,btn('保存文件夹','folder-save',`${f?`data-id="${esc(f.id)}"`:''} ${ownerAttrs}`,true));
    updateFolderPicker();return;
  }
  if(action==='folder-save'){
    const owner=folderOwner(e),name=$('#folder-name').value.trim();if(!name)throw Error('请填写文件夹名称');
    if(folders.some(x=>x.id!==f?.id&&x.name===name))throw Error('已有同名文件夹，请使用不同名称');
    const item=f||{id:C.uid()};item.name=name;item.description=$('#folder-description').value.trim();if(!f)folders.push(item);
    const selected=new Set([...document.querySelectorAll('[name="folder-member"]:checked')].map(n=>n.value)),shared=globalAssets();
    for(const [prefix,all]of [['aesthetic',shared],['asset',db.assets]])for(const a of all){
      a.folderIds=StudioFolders.ids(a.folderIds).filter(id=>id!==item.id);if(selected.has(prefix+':'+a.id))a.folderIds.push(item.id);
    }
    saveReferenceFolders(folders);saveAesthetic(shared);
    if(owner)owner.folderIds=StudioFolders.ids([...(owner.folderIds||[]),item.id]);
    save();referenceFolder=item.id;close();render();
    notify(owner?'参考文件夹已建立并关联到当前项目；原素材仍在总审美库。':'项目参考已保存；原素材仍在总审美库。');return;
  }
  if(action==='folder-asset-save'){const a=db.assets.find(a=>a.id===e.dataset.id);if(!a)throw Error('资料不存在');a.folderIds=selectedFolders('material-folder');save();render();return;}
  if(action==='folder-bind'||action==='folder-bind-save'){
    const kind=e.dataset.kind,target=(kind==='project'?db.projects:db.topics).find(x=>x.id===e.dataset.id);if(!target)throw Error('项目或脚本不存在');
    if(action==='folder-bind'){dialog('选择参考文件夹',folderChoices(target.folderIds||[]),btn('保存关联文件夹','folder-bind-save',`data-kind="${kind}" data-id="${target.id}"`,true));return;}
    target.folderIds=selectedFolders();save();close();render();return;
  }
}
