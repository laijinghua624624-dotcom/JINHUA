/* Uses the current workspace library and backend; never automatically crawls saved links. */
const A=StudioAesthetic;
let aestheticQuery={category:'全部',coverType:'人物照片',tag:'全部',search:'',favorite:false,page:1};
const aestheticStoreKey=(space=scope)=>'lance_studio_aesthetic_'+space;
const aestheticTrashKey=(space=scope)=>'lance_studio_aesthetic_trash_'+space;
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
  const wardrobe=a?.isProjectAsset&&a.kind==='wardrobe'?usableWardrobeOutfits(a):[];
  const wardrobeImages=wardrobe.map(o=>a.frames?.[o.frameIndex]).filter(f=>C.assetOK(f,'image'));
  if(wardrobeImages.length)return `<span class="wardrobe-cover-grid wardrobe-cover-${Math.min(wardrobeImages.length,3)}">${wardrobeImages.slice(0,3).map((image,i)=>`<img src="${mediaURL(image)}" alt="${esc(wardrobe[i]?.name||a.name||'服装全身参考')}" loading="lazy">`).join('')}</span>`;
  const files=Array.isArray(a?.files)?a.files:[],preferred=files.find(f=>f.localId===a.coverId&&f.kind==='image'),image=preferred||files.find(f=>f.kind==='image'),video=files.find(f=>f.kind==='video');
  if(image)return `<img src="${mediaURL(image)}" alt="${esc(a.name||'审美参考')}" loading="eager">`;
  if(a?.legacyImage)return `<img src="${esc(a.legacyImage)}" alt="${esc(a.name||'旧版审美参考')}" loading="lazy">`;
  if(a?.externalPreview){const base=location.hostname.endsWith('github.io')?'https://lance-content-studio.onrender.com':'',src=a.previewDirect?a.externalPreview:`${base}/api/radar-preview?url=${encodeURIComponent(a.externalPreview)}`;return `<img src="${esc(src)}" alt="${esc(a.name||'来源预览')}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;}
  if(video)return `<video src="${mediaURL(video)}" muted playsinline preload="metadata"></video>`;
  return `<span class="aesthetic-placeholder"><span aria-hidden="true">${a?.isProjectAsset?(a.kind==='scene'?'◫':'◇'):(a?.link?'↗':'▣')}</span><small>${esc(a?.category||'待添加封面')}</small></span>`;
}
function conciseWardrobeText(value,fallback='适合的场景与搭配说明待补充'){
  const text=String(value||fallback).replace(/\s+/g,' ').trim(),first=text.split(/[。；\n]/).find(Boolean)||text;
  return first.length>58?first.slice(0,58)+'…':first;
}
function coverReferenceTitle(a,coverFolders){
  if(a?.name&&!/^image(?:\(\d+\))?$/i.test(a.name))return a.name;
  const indexed=[a?.name,...(a?.files||[]).map(file=>file.name)].find(value=>/image\((\d+)\)/i.test(value||'')),index=Number(indexed?.match(/image\((\d+)\)/i)?.[1]),portrait=A.coverSubtypeMatch(a,'人物照片',coverFolders),text=A.coverSubtypeMatch(a,'纯字体',coverFolders),ai=A.coverSubtypeMatch(a,'增量优化',coverFolders),label=portrait?'人物封面':text?'字体参考':ai?'AI优化':'封面参考';
  return Number.isInteger(index)?`${label} ${String(index+1).padStart(3,'0')}`:label;
}
function aestheticCard(a,coverFolders){
  const wardrobe=a?.isProjectAsset&&a.kind==='wardrobe',outfits=wardrobe?usableWardrobeOutfits(a):[];
  if(wardrobe){
    const title=outfits.map(o=>o.name).filter(Boolean).join(' / ')||a.name;
    const description=conciseWardrobeText(outfits[0]?.recommendation||outfits[0]?.description||a.requirements);
    return `<article class="aesthetic-card wardrobe-library-card"><button class="aesthetic-cover" data-action="aesthetic-open" data-id="${esc(a.id)}">${aestheticCover(a)}<span class="aesthetic-category">${esc(A.categoryOf(a,coverFolders))}</span></button><div class="aesthetic-info"><div class="aesthetic-title"><h3>${esc(title)}</h3>${btn(a.favorite?'★':'☆','aesthetic-star',`data-id="${esc(a.id)}" aria-label="${a.favorite?'取消收藏':'收藏'} ${esc(a.name)}"`)}</div><p>${esc(description)}</p><div class="actions"><small>${outfits.length?`${outfits.length} 套全身参考`:'待添加全身照'}</small>${btn('查看服装','aesthetic-open',`data-id="${esc(a.id)}"`)}</div></div></article>`;
  }
  if(A.coverReference(a,coverFolders)){
    const portrait=A.coverSubtypeMatch(a,'人物照片',coverFolders),text=A.coverSubtypeMatch(a,'纯字体',coverFolders),ai=A.coverSubtypeMatch(a,'增量优化',coverFolders),kind=portrait?'人物':text?'字体':ai?'AI':'封面',title=coverReferenceTitle(a,coverFolders);
    return `<article class="aesthetic-card cover-reference-card ${portrait?'cover-reference-portrait':text?'cover-reference-landscape':''}"><button class="aesthetic-cover" data-action="aesthetic-open" data-id="${esc(a.id)}" aria-label="查看 ${esc(title)}">${aestheticCover(a)}<span class="aesthetic-category">${kind}</span></button><div class="aesthetic-info"><div class="aesthetic-title"><h3>${esc(title)}</h3>${btn(a.favorite?'★':'☆','aesthetic-star',`data-id="${esc(a.id)}" aria-label="${a.favorite?'取消收藏':'收藏'} ${esc(title)}"`)}</div></div></article>`;
  }
  return `<article class="aesthetic-card"><button class="aesthetic-cover" data-action="aesthetic-open" data-id="${esc(a.id)}">${aestheticCover(a)}<span class="aesthetic-category">${esc(A.categoryOf(a,coverFolders))}</span></button><div class="aesthetic-info"><div class="aesthetic-title"><h3>${esc(a.name)}</h3>${btn(a.favorite?'★':'☆','aesthetic-star',`data-id="${esc(a.id)}" aria-label="${a.favorite?'取消收藏':'收藏'} ${esc(a.name)}"`)}</div><div class="aesthetic-tags">${a.tags.slice(0,5).map(t=>`<span>${esc(t)}</span>`).join('')}</div><p>${esc(a.notes||'记录喜欢的光线、构图、材质或节奏')}</p><div class="actions"><small>${a.files.length} 个附件${a.link?' · 有来源链接':''}</small>${btn('查看／编辑','aesthetic-open',`data-id="${esc(a.id)}"`)}</div></div></article>`;
}
function loadAesthetic(){
  ensureScopedLibraries();const store=aestheticStoreKey(),raw=localStorage.getItem(store)||'[]';
  const old=scope==='personal'?localStorage.getItem('xuan_ti_ku_visual')||'[]':'[]';
  let items;try{items=A.migrate(JSON.parse(raw),JSON.parse(old));}catch{throw Error('审美库数据无法读取，未覆盖原数据。请保留旧版备份。');}
  const next=JSON.stringify(items);if(raw!==next){localStorage.setItem(store+'_previous',raw);localStorage.setItem(store,next);}return items;
}
function saveAesthetic(items,space=scope){ensureScopedLibraries();const store=aestheticStoreKey(space),prior=localStorage.getItem(store);try{if(prior)localStorage.setItem(store+'_previous',prior);localStorage.setItem(store,JSON.stringify(items));globalThis.markWorkspaceDirty?.(space);}catch{throw Error('审美库本机存储不足，原记录已保留，请先导出备份');}}
function loadAestheticTrash(){let items;try{items=JSON.parse(localStorage.getItem(aestheticTrashKey())||'[]');}catch{throw Error('回收站数据无法读取，原数据未覆盖');}if(!Array.isArray(items))throw Error('回收站数据格式异常，原数据未覆盖');return items;}
function saveAestheticTrash(items){const store=aestheticTrashKey(),prior=localStorage.getItem(store);try{if(prior)localStorage.setItem(store+'_previous',prior);localStorage.setItem(store,JSON.stringify(items));globalThis.markWorkspaceDirty?.(scope);}catch{throw Error('回收站保存失败，未删除原参考');}}
function coverReferenceSubnav(all,q,folders){const types=[['人物照片','人物照片'],['纯字体','纯字体'],['增量优化','AI优化']];return `<div class="cover-reference-subnav"><div class="actions">${types.map(([type,label])=>btn(`${label} <small>${all.filter(item=>A.coverSubtypeMatch(item,type,folders)).length}</small>`,'aesthetic-cover-type',`data-cover-type="${esc(type)}" class="${q.coverType===type?'active':''}"`)).join('')}</div></div>`;}
function currentAestheticQuery(){return {...aestheticQuery,coverFolders:coverReferenceFolders()};}
function renderAesthetic(){
  const all=folderLibraryEntries(globalAssets()),coverFolders=coverReferenceFolders(),projectFolders=projectReferenceFolders(),trashCount=loadAestheticTrash().length,q=aestheticQuery,matches=A.viewFilter(all,currentAestheticQuery()),categories=[...new Set([...A.CATEGORIES,...all.map(a=>A.categoryOf(a,coverFolders))])],tags=[...new Set(all.flatMap(a=>a.tags))].sort();
  const isVisualLanding=!q.search&&q.category==='全部'&&q.tag==='全部'&&!q.favorite,items=isVisualLanding?matches.filter(item=>A.visualWeight(item)>0):matches,pageSize=15;
  const pages=Math.max(1,Math.ceil(items.length/pageSize));q.page=Math.max(1,Math.min(q.page,pages));
  const activeFolder=referenceFolder==='all'?'全部画面':referenceFolder==='unfiled'?'尚未归项目':projectFolders.find(folder=>folder.id===referenceFolder)?.name||'全部画面';
  const folderNav=btn('全部','folder-open',`data-id="all" class="${referenceFolder==='all'?'primary':''}"`)+btn('未归类','folder-open',`data-id="unfiled" class="${referenceFolder==='unfiled'?'primary':''}"`)+projectFolders.map(folder=>btn(esc(folder.name),'folder-open',`data-id="${esc(folder.id)}" class="${referenceFolder===folder.id?'primary':''}"`)).join('');
  return hero('REFERENCE LIBRARY','参考库','用画面做判断，用搜索快速收窄方向。',btn('快速收藏链接','radar-new','',true)+btn(q.category==='封面参考'?'手动添加封面':'手动添加资料','aesthetic-new'))+
    `<section class="library-visual-first"><div class="library-search"><label for="library-visual-search"><span>搜索参考画面</span><input id="library-visual-search" data-aesthetic-search value="${esc(q.search)}" placeholder="搜场景、光线、色调、构图、情绪或项目…"></label>${btn(q.favorite?'★ 收藏中':'☆ 只看收藏','aesthetic-favorite-filter')}</div>
    <div class="library-result-head"><div><span>${isVisualLanding?'最近可预览画面':'搜索结果'}</span><strong>${esc(activeFolder)}</strong><small>${items.length} 项${isVisualLanding&&matches.length>items.length?` · 已隐藏 ${matches.length-items.length} 项纯文字资料`:''}</small></div></div>
    <details class="library-filters" ${q.category!=='全部'||q.tag!=='全部'?'open':''}><summary>分类与项目范围${q.category!=='全部'?' · '+esc(q.category):''}</summary><div class="aesthetic-toolbar"><label>标签<select data-aesthetic-filter="tag"><option>全部</option>${tags.map(t=>`<option ${q.tag===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label></div><div class="aesthetic-filters">${['全部',...categories].map(c=>btn(`${esc(c)} <small>${c==='全部'?all.length:all.filter(a=>A.categoryOf(a,coverFolders)===c).length}</small>`,'aesthetic-category',`data-category="${esc(c)}" class="${q.category===c?'active':''}"`)).join('')}</div>${q.category==='封面参考'?coverReferenceSubnav(all,q,coverFolders):`<nav class="actions library-folder-nav" aria-label="切换参考库范围">${folderNav}</nav>`}</details>
    <div class="aesthetic-grid ${q.category==='封面参考'?`cover-reference-wall cover-wall-${q.coverType==='人物照片'?'portrait':q.coverType==='纯字体'?'landscape':'mixed'}`:''}">${items.slice((q.page-1)*pageSize,q.page*pageSize).map(a=>aestheticCard(a,coverFolders)).join('')||empty(isVisualLanding?'还没有可预览的画面':'没有匹配的参考',isVisualLanding?'添加图片或视频，之后进来就能直接看画面。':'换一个搜索词，或调整分类与项目范围。')}</div>
    <div class="actions library-pagination">${btn('上一页','aesthetic-page',`data-page="${q.page-1}" ${q.page===1?'disabled':''}`)}<span>${items.length} 条 · ${q.page}/${pages} 页</span>${btn('下一页','aesthetic-page',`data-page="${q.page+1}" ${q.page===pages?'disabled':''}`)}</div></section>
    <details class="library-management"><summary>文件夹、批量与资料管理</summary>${folderToolbar()}<div class="actions library-management-actions">${btn('一键收藏助手','radar-helper')}${btn('同步 Pinterest','radar-pinterest')}${btn(q.category==='封面参考'?'批量导入封面':'批量上传','aesthetic-batch')}${btn('AI语义检索','aesthetic-semantic')}${btn(`回收站${trashCount?' · '+trashCount:''}`,'aesthetic-trash')}</div></details>`;
}
function aestheticDialog(a){
  const coverFolders=coverReferenceFolders(),categories=[...new Set([...A.CATEGORIES,...globalAssets().map(item=>A.categoryOf(item,coverFolders))])],defaultCategory=a?.category||(aestheticQuery.category==='封面参考'?'封面参考':'摄影参考'),defaultTags=a?.tags||(['人物照片','纯字体','增量优化'].includes(aestheticQuery.coverType)?[aestheticQuery.coverType]:[]);
  if(a&&A.coverReference(a,coverFolders)){
    const image=A.image(a),title=coverReferenceTitle(a,coverFolders);
    dialog(title,`<div class="cover-detail-visual">${image?`<img src="${mediaURL(image)}" alt="${esc(title)}">`:aestheticCover(a)}</div><details class="cover-admin"><summary>管理信息</summary><div class="formgrid"><label>标题<input id="aes-name" value="${esc(a.name||'')}"></label><label>分类<input id="aes-category" value="${esc(defaultCategory)}"></label><label class="wide">标签（逗号分隔）<input id="aes-tags" value="${esc(defaultTags.join('，'))}"></label><label class="wide">参考说明<textarea id="aes-notes">${esc(a.notes||'')}</textarea></label><label class="wide">来源链接<textarea id="aes-link" class="short">${esc(a.link||'')}</textarea></label><label>来源网站<input id="aes-source-site" value="${esc(a.sourceSite||'')}"></label><label>使用范围标记<select id="aes-source-usage"><option value="unconfirmed" ${(a.sourceUsage||'unconfirmed')==='unconfirmed'?'selected':''}>待确认</option><option value="internal-reference" ${a.sourceUsage==='internal-reference'?'selected':''}>仅内部视觉参考</option><option value="owned" ${a.sourceUsage==='owned'?'selected':''}>本人／团队原创素材</option><option value="licensed" ${a.sourceUsage==='licensed'?'selected':''}>已确认授权素材</option></select></label></div>${folderMembership(a)}</details>`,btn('保存修改','aesthetic-save',`data-id="${esc(a.id)}"`,true)+btn('移入回收站','aesthetic-delete-request',`data-id="${esc(a.id)}" class="danger"`));return;
  }
  dialog(a?'参考详情与编辑':'添加审美参考',`<div class="formgrid"><label>标题<input id="aes-name" value="${esc(a?.name||'')}"></label><label>分类（可直接输入新分类）<input id="aes-category" list="aes-categories" value="${esc(defaultCategory)}"><datalist id="aes-categories">${categories.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label><label class="wide">标签（逗号分隔）<input id="aes-tags" value="${esc(defaultTags.join('，'))}" placeholder="逆光、雾气、冷暖对比"></label><label class="wide">来源链接或分享文字<textarea id="aes-link" class="short" placeholder="支持http/https网页、视频链接及含链接的分享文字">${esc(a?.link||'')}</textarea></label><label>来源网站<input id="aes-source-site" value="${esc(a?.sourceSite||'')}" placeholder="例如 ShotDeck"></label><label>使用范围标记<select id="aes-source-usage"><option value="unconfirmed" ${(a?.sourceUsage||'unconfirmed')==='unconfirmed'?'selected':''}>待确认</option><option value="link-only" ${a?.sourceUsage==='link-only'?'selected':''}>只保存链接</option><option value="internal-reference" ${a?.sourceUsage==='internal-reference'?'selected':''}>仅内部视觉参考</option><option value="owned" ${a?.sourceUsage==='owned'?'selected':''}>本人／团队原创素材</option><option value="licensed" ${a?.sourceUsage==='licensed'?'selected':''}>已确认授权素材</option></select></label><label class="wide">喜欢什么／参考重点／来源说明<textarea id="aes-notes">${esc(a?.notes||'')}</textarea></label></div>
    <p class="muted">ShotDeck 等素材库建议标记为“仅内部视觉参考”。系统不会自动登录、抓取或批量下载网站内容。</p>
    ${a?StudioCapture.assetTools(a):''}${folderMembership(a)}${a?.link&&!a?.captureStatus?`<p><a href="${esc(A.link(a.link))}" target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a></p>`:''}
    ${a?`<h3>附件与封面</h3><div class="grid">${a.files.map(f=>`<div class="card">${f.kind==='audio'?`<audio controls src="${mediaURL(f)}"></audio>`:mediaMarkup(f)}<p>${esc(f.name||f.kind)}</p></div>`).join('')}${a.legacyImage?`<img class="media" src="${esc(a.legacyImage)}" alt="旧版参考图">`:''}</div><label>卡片封面<select id="aes-cover"><option value="">自动选择</option>${a.files.filter(f=>f.kind==='image').map(f=>`<option value="${esc(f.localId)}" ${a.coverId===f.localId?'selected':''}>${esc(f.name||'参考图')}</option>`).join('')}</select></label><p class="muted">可一次选择多个附件。追加时会一并保存当前文字修改。</p>${upload('追加图片／视频／音频／PDF','aesthetic-files',`data-id="${esc(a.id)}" multiple`,'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/mp4,application/pdf')}`:'<p class="muted">先建立参考卡，再追加附件；批量上传会按每个文件建立一张参考卡。</p>'}`,
    btn('保存参考','aesthetic-save',a?`data-id="${esc(a.id)}"`:'',true)+(a?btn(`复制到 ${scope==='personal'?'My·工作':'My·个人'}`,'aesthetic-copy',`data-id="${esc(a.id)}"`)+btn('移入回收站','aesthetic-delete-request',`data-id="${esc(a.id)}" class="danger"`):''));
}
function aestheticTrashDialog(){
  const items=loadAestheticTrash().sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));
  dialog(`审美参考回收站 · ${items.length}`,items.length?`<p class="muted">这里的记录不会出现在总库、项目文件夹或AI参考中。系统不自动清空，需要时可恢复。</p><div class="list">${items.map(item=>`<article class="row"><div><strong>${esc(item.name)}</strong><p class="muted">${esc(item.category||'其他')} · ${item.files?.length||0}个附件 · ${esc((item.deletedAt||'').replace('T',' ').slice(0,16))}</p></div>${btn('恢复到审美库','aesthetic-restore',`data-id="${esc(item.id)}"`,true)}</article>`).join('')}</div>`:empty('回收站是空的','移入回收站的参考会出现在这里。'));
}
async function aestheticAction(action,e){
  if(e.dataset.id?.startsWith('asset:')){const item=db.assets.find(a=>a.id===e.dataset.id.slice(6));if(!item)throw Error('资料不存在');if(action==='aesthetic-open'){route={view:'asset',id:item.id};render();return;}if(action==='aesthetic-star'){item.favorite=!item.favorite;save();render();return;}}
  const all=globalAssets(),a=all.find(x=>x.id===e.dataset.id);
  if(action==='aesthetic-trash'){aestheticTrashDialog();return;}
  if(action==='aesthetic-delete-request'){
    if(!a)throw Error('参考不存在');
    dialog('确认移入回收站？',`<div class="rule"><strong>${esc(a.name)}</strong><p>移入后会立即从审美库、项目参考文件夹和AI参考中隐藏。</p></div><p class="muted">这是可恢复操作，不会删除服务器上的原媒体或备份。请再确认一次，防止误触。</p>`,btn('取消，返回编辑','aesthetic-open',`data-id="${esc(a.id)}"`)+btn('确认移入回收站','aesthetic-delete-confirm',`data-id="${esc(a.id)}" class="danger"`));return;
  }
  if(action==='aesthetic-delete-confirm'){
    if(!a)throw Error('参考不存在');const moved=A.trashItem(all,a.id),trash=loadAestheticTrash();
    saveAestheticTrash([...trash,moved.deleted]);saveAesthetic(moved.items);close();route={view:'aesthetic'};render();notify('已移入回收站，需要时可恢复。');return;
  }
  if(action==='aesthetic-restore'){
    const trash=loadAestheticTrash(),result=A.restoreItem(all,trash,e.dataset.id,C.uid),validFolders=new Set(referenceFolders().map(f=>f.id));result.restored.folderIds=(result.restored.folderIds||[]).filter(id=>validFolders.has(id));
    saveAesthetic(result.items);saveAestheticTrash(result.trash);aestheticTrashDialog();render();notify('参考已恢复到审美库。');return;
  }
  if(action==='aesthetic-semantic'){const items=A.viewFilter(folderLibraryEntries(all),{...currentAestheticQuery(),search:''});if(!items.length)throw Error('当前文件夹或筛选下没有参考');if(items.length>100)throw Error('请先选择项目文件夹或分类，将范围缩小到100条以内');dialog('AI审美语义检索',`<p>范围：当前空间、文件夹与分类下的 ${items.length} 条参考。按视觉含义和文字描述寻找相近参考，不是自动训练个人模型。</p><label>想找什么？<textarea id="semantic-query" placeholder="例如：冷色长廊尽头的一束暖光，有孤独但坚定的感觉"></textarea></label><p class="muted">首次会将这些参考的描述及封面图发送给方舟向量模型，产生按量费用。相同素材和模型复用本机缓存；链接不自动抓取，视频需先有关键帧。</p>`,btn('确认范围并检索','aesthetic-semantic-run','',true));return;}
  if(action==='aesthetic-semantic-run'){const query=$('#semantic-query').value.trim();if(!query)throw Error('请填写要找的审美方向');const items=A.viewFilter(folderLibraryEntries(all),{...currentAestheticQuery(),search:''});const requestScope=scope;close();let result;await withJob('审美语义检索',1,async()=>{const task=await api('reference/search',{scope:requestScope,query,items:items.map(a=>({id:a.id,text:[a.name,a.category,(a.tags||[]).join(' '),a.notes,a.requirements].filter(Boolean).join('\n').slice(0,6000),imageId:(a.files.find(f=>f.localId===a.coverId&&f.kind==='image')||a.files.find(f=>f.kind==='image'))?.localId}))});result=await pollJob(task.jobId);progress('相关参考已排序');});if(result&&result.scope===scope)dialog('语义检索结果',`<p class="muted">${esc(query)} · ${esc(result.model)}。相似度只用于排序，不代表质量判断。</p><div class="grid">${result.matches.map(match=>{const a=items.find(a=>a.id===match.id);return a?`<div class="card">${aestheticCover(a)}<h3>${esc(a.name)}</h3><p>${esc(a.notes||'')}</p>${btn('打开参考','aesthetic-open',`data-id="${esc(a.id)}"`)}</div>`:'';}).join('')}</div>`);return;}
  if(action==='aesthetic-new'){aestheticDialog(null);return;}
  if(action==='aesthetic-copy'){if(!a)throw Error('参考不存在');const target=scope==='personal'?'xinxuan':'personal',existing=JSON.parse(localStorage.getItem(aestheticStoreKey(target))||'[]');if(existing.some(x=>x.copiedFrom?.scope===scope&&x.copiedFrom?.id===a.id))throw Error('目标空间已有这份参考的副本');const copy=C.clone(a);copy.id=C.uid();copy.name=a.name+'（来自'+(scope==='personal'?'My·个人':'My·工作')+'）';copy.folderIds=[];copy.usedIn=[];copy.copiedFrom={scope,id:a.id};copy.createdAt=copy.updatedAt=new Date().toISOString();existing.push(copy);saveAesthetic(existing,target);close();notify('已复制到'+(target==='personal'?'My·个人':'My·工作')+'；两个副本之后互不影响。');return;}
  if(action==='aesthetic-open'){if(!a)throw Error('参考不存在');aestheticDialog(a);return;}
  if(action==='aesthetic-category'){aestheticQuery.category=e.dataset.category;aestheticQuery.coverType=aestheticQuery.category==='封面参考'?'人物照片':'全部';if(aestheticQuery.category==='封面参考')referenceFolder='all';aestheticQuery.page=1;render();return;}
  if(action==='aesthetic-cover-type'){aestheticQuery.category='封面参考';aestheticQuery.coverType=e.dataset.coverType||'人物照片';referenceFolder='all';aestheticQuery.page=1;render();return;}
  if(action==='aesthetic-favorite-filter'){aestheticQuery.favorite=!aestheticQuery.favorite;aestheticQuery.page=1;render();return;}
  if(action==='aesthetic-page'){aestheticQuery.page=Number(e.dataset.page);render();return;}
  if(action==='aesthetic-star'){if(!a)throw Error('参考不存在');a.favorite=!a.favorite;saveAesthetic(all);render();return;}
  if(action==='aesthetic-batch'){const coverMode=aestheticQuery.category==='封面参考',tag=['人物照片','纯字体','增量优化'].includes(aestheticQuery.coverType)?aestheticQuery.coverType:'';dialog(coverMode?'批量导入封面参考':'批量上传审美参考',`<label>本批分类（可自定义）<input id="aes-batch-category" value="${coverMode?'封面参考':'摄影参考'}"></label><label>本批标签（逗号分隔）<input id="aes-batch-tags" value="${esc(tag)}"></label><p class="muted">每个文件建立一张卡片，单文件最多250MB。失败会逐项提示，已成功的不会丢失。支持图片、视频、音频与PDF。</p>`,upload('选择多个文件','aesthetic-batch','multiple','image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/mp4,application/pdf'));return;}
  if(action==='aesthetic-save'){
    const link=A.link($('#aes-link').value),name=$('#aes-name').value.trim();if(!name&&!link)throw Error('请填写标题或来源链接');
    const record=a||A.entry(name||new URL(link).hostname);record.name=name||new URL(link).hostname;record.category=$('#aes-category').value.trim()||'其他';record.tags=A.tags($('#aes-tags').value);record.notes=$('#aes-notes').value.trim();record.requirements=record.notes;record.link=link;record.sourceSite=$('#aes-source-site').value.trim()||(link?new URL(link).hostname:'');record.sourceUsage=$('#aes-source-usage').value;record.coverId=$('#aes-cover')?.value||null;record.updatedAt=new Date().toISOString();
    record.folderIds=selectedFolders('material-folder');if(!a)all.push(record);saveAesthetic(all);close();render();notify('参考已保存，可继续追加附件');if(!a)aestheticDialog(record);return;
  }
}
async function aestheticFiles(e){
  if(job)throw Error('请等待当前任务完成');const files=[...e.files];if(!files.length)return;
  const batch=e.dataset.upload==='aesthetic-batch',id=e.dataset.id,category=$('#aes-batch-category')?.value.trim()||'摄影参考',tags=A.tags($('#aes-batch-tags')?.value||'');
  if(!batch){const all=globalAssets(),a=all.find(a=>a.id===id);if(!a)throw Error('参考不存在');const link=A.link($('#aes-link').value);a.name=$('#aes-name').value.trim()||a.name;a.category=$('#aes-category').value.trim()||'其他';a.tags=A.tags($('#aes-tags').value);a.notes=$('#aes-notes').value.trim();a.requirements=a.notes;a.folderIds=selectedFolders('material-folder');a.link=link;a.sourceSite=$('#aes-source-site').value.trim()||(link?new URL(link).hostname:'');a.sourceUsage=$('#aes-source-usage').value;a.coverId=$('#aes-cover')?.value||null;saveAesthetic(all);}
  const errors=[];await withJob('保存审美参考附件',files.length,async()=>{await ensureService();for(const file of files){if(stop)break;try{const media=await api('upload',file);media.name=file.name;const all=globalAssets();const a=batch?A.entry(file.name.replace(/\.[^.]+$/,'')):all.find(a=>a.id===id);if(!a)throw Error('参考不存在');if(batch){a.category=category;a.tags=tags;a.folderIds=referenceFolders().some(f=>f.id===referenceFolder)?[referenceFolder]:[];all.push(a);}a.files.push(media);a.updatedAt=new Date().toISOString();saveAesthetic(all);}catch(error){errors.push(file.name+'：'+error.message);}progress(file.name);}if(errors.length)throw Error('部分失败：'+errors.join('；'));});
  close();if(!batch){const a=globalAssets().find(a=>a.id===id);if(a)aestheticDialog(a);}render();if(errors.length)notify('部分失败，已成功的素材已保存：'+errors.join('；'));
}
document.addEventListener('input',event=>{if(!event.target.hasAttribute('data-aesthetic-search'))return;aestheticQuery.search=event.target.value;aestheticQuery.page=1;const pos=event.target.selectionStart;render();$('[data-aesthetic-search]').focus();$('[data-aesthetic-search]').setSelectionRange(pos,pos);});
document.addEventListener('change',event=>{if(!event.target.dataset.aestheticFilter)return;aestheticQuery[event.target.dataset.aestheticFilter]=event.target.value;aestheticQuery.page=1;render();});
