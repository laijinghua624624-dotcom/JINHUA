/* Uses the shared studio UI and backend; never automatically crawls saved links. */
const A=StudioAesthetic;
let aestheticQuery={category:'全部',tag:'全部',search:'',favorite:false,page:1};
function loadAesthetic(){
  const raw=localStorage.getItem('lance_studio_aesthetic')||'[]';
  const old=localStorage.getItem('xuan_ti_ku_visual')||'[]';
  let items;try{items=A.migrate(JSON.parse(raw),JSON.parse(old));}catch{throw Error('审美库数据无法读取，未覆盖原数据。请保留旧版备份。');}
  const next=JSON.stringify(items);if(raw!==next){localStorage.setItem('lance_studio_aesthetic_previous',raw);localStorage.setItem('lance_studio_aesthetic',next);}return items;
}
function saveAesthetic(items){const prior=localStorage.getItem('lance_studio_aesthetic');try{if(prior)localStorage.setItem('lance_studio_aesthetic_previous',prior);localStorage.setItem('lance_studio_aesthetic',JSON.stringify(items));}catch{throw Error('审美库本机存储不足，原记录已保留，请先导出备份');}}
function aestheticCover(a){const cover=A.image(a);if(cover)return `<img src="${mediaURL(cover)}" alt="${esc(a.name)}" loading="lazy">`;if(a.legacyImage)return `<img src="${esc(a.legacyImage)}" alt="旧版上传参考" loading="lazy">`;const video=a.files.find(f=>f.kind==='video');if(video)return `<video src="${mediaURL(video)}#t=0.1" muted preload="metadata" playsinline></video>`;return `<div class="aesthetic-placeholder"><span>${a.link?'↗':a.files.some(f=>f.kind==='audio')?'♫':'＋'}</span><small>${a.link?'链接收藏 · 点击查看来源':a.files.length?'附件参考':'待上传参考'}</small></div>`;}
function renderAesthetic(){
  const all=globalAssets(),q=aestheticQuery,items=A.filter(all,q),categories=[...new Set([...A.CATEGORIES,...all.map(a=>a.category)])],tags=[...new Set(all.flatMap(a=>a.tags))].sort();
  const pages=Math.max(1,Math.ceil(items.length/24));q.page=Math.max(1,Math.min(q.page,pages));
  return hero('AESTHETIC LIBRARY','审美参考库','收藏不同的视觉语言，记录你具体喜欢什么。TMD 与 My 共用。',btn('添加参考／链接','aesthetic-new','',true)+btn('批量上传','aesthetic-batch'))+
    `<div class="aesthetic-toolbar"><label>搜索标题、标签、备注或来源<input data-aesthetic-search value="${esc(q.search)}" placeholder="例如：低饱和、追光、长镜头"></label><label>标签<select data-aesthetic-filter="tag"><option>全部</option>${tags.map(t=>`<option ${q.tag===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>${btn(q.favorite?'★ 只看收藏':'☆ 只看收藏','aesthetic-favorite-filter')}</div>
    <div class="aesthetic-filters">${['全部',...categories].map(c=>btn(`${esc(c)} <small>${c==='全部'?all.length:all.filter(a=>a.category===c).length}</small>`,'aesthetic-category',`data-category="${esc(c)}" class="${q.category===c?'active':''}"`)).join('')}</div>
    <p class="muted">上传图片、视频、音频或PDF；也可直接收藏网页／视频分享链接。链接不会自动下载或绕过登录，可补传封面。直接上传需连接本机服务。</p>
    <div class="aesthetic-grid">${items.slice((q.page-1)*24,q.page*24).map(a=>`<article class="aesthetic-card"><button class="aesthetic-cover" data-action="aesthetic-open" data-id="${esc(a.id)}">${aestheticCover(a)}<span class="aesthetic-category">${esc(a.category)}</span></button><div class="aesthetic-info"><div class="aesthetic-title"><h3>${esc(a.name)}</h3>${btn(a.favorite?'★':'☆','aesthetic-star',`data-id="${esc(a.id)}" aria-label="${a.favorite?'取消收藏':'收藏'} ${esc(a.name)}"`)}</div><div class="aesthetic-tags">${a.tags.slice(0,5).map(t=>`<span>${esc(t)}</span>`).join('')}</div><p>${esc(a.notes||'记录喜欢的光线、构图、材质或节奏')}</p><div class="actions"><small>${a.files.length} 个附件${a.link?' · 有来源链接':''}</small>${btn('查看／编辑','aesthetic-open',`data-id="${esc(a.id)}"`)}</div></div></article>`).join('')||empty('还没有匹配的参考','添加素材，或调整分类和搜索条件。')}</div>
    <div class="actions" style="margin-top:20px">${btn('上一页','aesthetic-page',`data-page="${q.page-1}" ${q.page===1?'disabled':''}`)}<span>${items.length} 条 · ${q.page}/${pages} 页</span>${btn('下一页','aesthetic-page',`data-page="${q.page+1}" ${q.page===pages?'disabled':''}`)}</div>`;
}
function aestheticDialog(a){
  const categories=[...new Set([...A.CATEGORIES,...globalAssets().map(a=>a.category)])];
  dialog(a?'参考详情与编辑':'添加审美参考',`<div class="formgrid"><label>标题<input id="aes-name" value="${esc(a?.name||'')}"></label><label>分类（可直接输入新分类）<input id="aes-category" list="aes-categories" value="${esc(a?.category||'摄影参考')}"><datalist id="aes-categories">${categories.map(c=>`<option value="${esc(c)}">`).join('')}</datalist></label><label class="wide">标签（逗号分隔）<input id="aes-tags" value="${esc((a?.tags||[]).join('，'))}" placeholder="逆光、雾气、冷暖对比"></label><label class="wide">来源链接或分享文字<textarea id="aes-link" class="short" placeholder="支持http/https网页、视频链接及含链接的分享文字">${esc(a?.link||'')}</textarea></label><label class="wide">喜欢什么／参考重点／来源说明<textarea id="aes-notes">${esc(a?.notes||'')}</textarea></label></div>
    ${a?.link?`<p><a href="${esc(A.link(a.link))}" target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a></p>`:''}
    <div class="panel"><h3>选用于当前空间的项目</h3><p class="muted">AI会使用选中项目的文字备注及最多4张本机图片；仅收藏链接不代表AI已读取网页。</p>${db.projects.map(p=>`<label><input name="aes-project" type="checkbox" value="${esc(p.id)}" ${a?.usedIn.some(x=>x.scope===scope&&x.id===p.id)?'checked':''}> ${esc(p.title)}</label>`).join('')||'<p class="muted">还没有项目，可先收藏。</p>'}</div>
    ${a?`<h3>附件与封面</h3><div class="grid">${a.files.map(f=>`<div class="card">${f.kind==='audio'?`<audio controls src="${mediaURL(f)}"></audio>`:mediaMarkup(f)}<p>${esc(f.name||f.kind)}</p></div>`).join('')}${a.legacyImage?`<img class="media" src="${esc(a.legacyImage)}" alt="旧版参考图">`:''}</div><label>卡片封面<select id="aes-cover"><option value="">自动选择</option>${a.files.filter(f=>f.kind==='image').map(f=>`<option value="${esc(f.localId)}" ${a.coverId===f.localId?'selected':''}>${esc(f.name||'参考图')}</option>`).join('')}</select></label><p class="muted">可一次选择多个附件。追加时会一并保存当前文字修改。</p>${upload('追加图片／视频／音频／PDF','aesthetic-files',`data-id="${esc(a.id)}" multiple`,'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/mp4,application/pdf')}`:'<p class="muted">先建立参考卡，再追加附件；批量上传会按每个文件建立一张参考卡。</p>'}`,
    btn('保存参考','aesthetic-save',a?`data-id="${esc(a.id)}"`:'',true));
}
async function aestheticAction(action,e){
  const all=globalAssets(),a=all.find(x=>x.id===e.dataset.id);
  if(action==='aesthetic-new'){aestheticDialog(null);return;}
  if(action==='aesthetic-open'){if(!a)throw Error('参考不存在');aestheticDialog(a);return;}
  if(action==='aesthetic-category'){aestheticQuery.category=e.dataset.category;aestheticQuery.page=1;render();return;}
  if(action==='aesthetic-favorite-filter'){aestheticQuery.favorite=!aestheticQuery.favorite;aestheticQuery.page=1;render();return;}
  if(action==='aesthetic-page'){aestheticQuery.page=Number(e.dataset.page);render();return;}
  if(action==='aesthetic-star'){if(!a)throw Error('参考不存在');a.favorite=!a.favorite;saveAesthetic(all);render();return;}
  if(action==='aesthetic-batch'){dialog('批量上传审美参考',`<label>本批分类（可自定义）<input id="aes-batch-category" value="摄影参考"></label><label>本批标签（逗号分隔）<input id="aes-batch-tags"></label><p class="muted">每个文件建立一张卡片，单文件最多250MB。失败会逐项提示，已成功的不会丢失。支持图片、视频、音频与PDF。</p>`,upload('选择多个文件','aesthetic-batch','multiple','image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/mp4,application/pdf'));return;}
  if(action==='aesthetic-save'){
    const link=A.link($('#aes-link').value),name=$('#aes-name').value.trim();if(!name&&!link)throw Error('请填写标题或来源链接');
    const record=a||A.entry(name||new URL(link).hostname);record.name=name||new URL(link).hostname;record.category=$('#aes-category').value.trim()||'其他';record.tags=A.tags($('#aes-tags').value);record.notes=$('#aes-notes').value.trim();record.requirements=record.notes;record.link=link;record.coverId=$('#aes-cover')?.value||null;record.updatedAt=new Date().toISOString();
    record.usedIn=[...record.usedIn.filter(p=>p.scope!==scope),...[...document.querySelectorAll('[name=aes-project]:checked')].map(n=>({scope,id:n.value}))];if(!a)all.push(record);saveAesthetic(all);close();render();notify('参考已保存，可继续追加附件');if(!a)aestheticDialog(record);return;
  }
}
async function aestheticFiles(e){
  if(job)throw Error('请等待当前任务完成');const files=[...e.files];if(!files.length)return;
  const batch=e.dataset.upload==='aesthetic-batch',id=e.dataset.id,category=$('#aes-batch-category')?.value.trim()||'摄影参考',tags=A.tags($('#aes-batch-tags')?.value||'');
  if(!batch){const all=globalAssets(),a=all.find(a=>a.id===id);if(!a)throw Error('参考不存在');const link=A.link($('#aes-link').value);a.name=$('#aes-name').value.trim()||a.name;a.category=$('#aes-category').value.trim()||'其他';a.tags=A.tags($('#aes-tags').value);a.notes=$('#aes-notes').value.trim();a.requirements=a.notes;a.link=link;a.coverId=$('#aes-cover')?.value||null;a.usedIn=[...a.usedIn.filter(p=>p.scope!==scope),...[...document.querySelectorAll('[name=aes-project]:checked')].map(n=>({scope,id:n.value}))];saveAesthetic(all);}
  const errors=[];await withJob('保存审美参考附件',files.length,async()=>{await ensureService();for(const file of files){if(stop)break;try{const media=await api('upload',file);media.name=file.name;const all=globalAssets();const a=batch?A.entry(file.name.replace(/\.[^.]+$/,'')):all.find(a=>a.id===id);if(!a)throw Error('参考不存在');if(batch){a.category=category;a.tags=tags;all.push(a);}a.files.push(media);a.updatedAt=new Date().toISOString();saveAesthetic(all);}catch(error){errors.push(file.name+'：'+error.message);}progress(file.name);}if(errors.length)throw Error('部分失败：'+errors.join('；'));});
  close();if(!batch){const a=globalAssets().find(a=>a.id===id);if(a)aestheticDialog(a);}render();if(errors.length)notify('部分失败，已成功的素材已保存：'+errors.join('；'));
}
document.addEventListener('input',event=>{if(!event.target.hasAttribute('data-aesthetic-search'))return;aestheticQuery.search=event.target.value;aestheticQuery.page=1;const pos=event.target.selectionStart;render();$('[data-aesthetic-search]').focus();$('[data-aesthetic-search]').setSelectionRange(pos,pos);});
document.addEventListener('change',event=>{if(!event.target.dataset.aestheticFilter)return;aestheticQuery[event.target.dataset.aestheticFilter]=event.target.value;aestheticQuery.page=1;render();});
