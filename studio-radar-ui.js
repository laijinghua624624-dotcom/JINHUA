const Radar=StudioRadar;
let radarQuery={category:'全部',search:''};
function radarSaved(item){return Radar.duplicate(globalAssets(),item);}
function radarOpenLink(url,label='打开来源'){return `<a class="button" href="${esc(A.link(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;}
function radarPreviewURL(url){const base=location.hostname.endsWith('github.io')?'https://lance-content-studio.onrender.com':'';return `${base}/api/radar-preview?url=${encodeURIComponent(url)}`;}
function radarChineseGuide(item){
  return `<details class="radar-cn-guide"><summary><span>中文看片卡</span><strong>英文不用硬读，先看这里</strong></summary><div class="radar-cn-grid"><div><b>这是什么</b><p>${esc(item.goal)}</p></div><div><b>故事怎么走</b><p>${esc(item.arc)}</p></div><div><b>重点看画面</b><p>${esc(item.craft)}</p></div><div><b>封面怎么判断</b><p>${esc(item.cover)}</p></div><div><b>AI怎么参与</b><p>${esc(item.ai)}</p></div><div><b>注意别照搬</b><p>${esc([item.avoid,item.risk].filter(Boolean).join('；'))}</p></div></div><p class="radar-cn-note">确认这张看片卡对你有价值后，再打开原网站；进入英文页面时只需要看原片、图片和幕后花絮。</p></details>`;
}
function radarCaseCard(item,featured=false){
  const saved=radarSaved(item),visual=item.poster?`<img src="${esc(radarPreviewURL(item.poster))}" alt="${esc(item.title)}案例预览" loading="lazy" onerror="this.closest('.radar-case-visual').classList.add('image-failed');this.remove()">`:`<span class="radar-case-placeholder">待补预览</span>`;
  return `<article class="radar-case ${featured?'featured':''}"><a class="radar-case-visual" href="${esc(A.link(item.url))}" target="_blank" rel="noopener noreferrer">${visual}<span class="radar-case-source">${esc(item.site||'案例来源')} · 只看原片 ↗</span></a><div class="radar-case-body"><div class="radar-card-top"><span class="badge">${esc(item.visualFocus||item.category)}</span><small>${esc(item.category)} · ${esc(item.type)}</small></div><h3>${esc(item.title)}</h3><p class="radar-mechanism">${esc(item.mechanism)}</p><dl><div><dt>为什么值得看</dt><dd>${esc(item.craft||item.goal)}</dd></div><div><dt>开场8秒</dt><dd>${esc(item.hook)}</dd></div><div><dt>怎么转成我的</dt><dd>${esc(item.transfer)}</dd></div></dl>${radarChineseGuide(item)}<div class="actions">${radarOpenLink(item.url,'值得看，再开原片')}${saved?btn('已收藏 · 整理文件夹','radar-open-saved',`data-id="${esc(saved.id)}"`):btn('收藏到审美库','radar-save-case',`data-id="${esc(item.id)}"`,true)}${btn('转为我的选题','radar-topic',`data-id="${esc(item.id)}"`)}</div></div></article>`;
}
function radarMotionCard(item){
  const saved=radarSaved(item);
  return `<article class="radar-motion-card"><div class="radar-motion-symbol" aria-hidden="true">${esc(item.symbol)}</div><div class="radar-motion-head"><span>${esc(item.en)}</span><h3>${esc(item.name)}</h3></div><p>${esc(item.description)}</p><dl><div><dt>画面感受</dt><dd>${esc(item.effect)}</dd></div><div><dt>拍摄执行</dt><dd>${esc(item.execution)}</dd></div><div><dt>适合</dt><dd>${esc(item.use)}</dd></div><div><dt>避免</dt><dd>${esc(item.avoid)}</dd></div></dl>${saved?btn('已在参考库','radar-open-saved',`data-id="${esc(saved.id)}"`):btn('加入我的参考库','radar-save-motion',`data-id="${esc(item.id)}"`,true)}</article>`;
}
function renderRadar(){
  const search=radarQuery.search.toLowerCase(),cases=Radar.CASES.filter(item=>(radarQuery.category==='全部'||item.category===radarQuery.category)&&`${item.title} ${item.goal} ${item.mechanism} ${item.site}`.toLowerCase().includes(search));
  const featured=Radar.daily(Radar.CASES);
  return hero('CASE RADAR','案例雷达','先看图片和中文看片卡，再决定要不要进入英文网站；原网站只负责看原片，不要求你读懂英文。',btn('快速收藏案例','radar-new','',true)+btn('一键收藏助手','radar-helper')+btn('同步 Pinterest','radar-pinterest')+btn('打开已收藏','nav','data-view="aesthetic"'))+
    `<section class="radar-language-help"><strong>英文网站不用硬读</strong><span>① 看预览图判断气质　② 展开中文看片卡理解创意　③ 值得看才进入原站，只看视频和幕后画面</span></section>`+
    `<section class="radar-start"><div class="section-head"><div><span class="eyebrow">TODAY’S 3 PICKS</span><h2>今天先看 3 个</h2></div><p>每天只给3个起点，避免越收藏越没方向。</p></div><div class="radar-grid">${featured.map(item=>radarCaseCard(item,true)).join('')}</div></section>`+
    `<section class="radar-library"><div class="section-head"><div><span class="eyebrow">CREATIVE DIRECTIONS</span><h2>按任务找案例</h2></div><label class="radar-search">搜索案例<input data-radar-search value="${esc(radarQuery.search)}" placeholder="例如：造势、世界观、舞台"></label></div><div class="radar-filters">${['全部',...Radar.CATEGORIES].map(category=>btn(esc(category),'radar-filter',`data-category="${esc(category)}" class="${radarQuery.category===category?'active':''}"`)).join('')}</div><div class="radar-grid">${cases.map(item=>radarCaseCard(item)).join('')||empty('没有匹配的案例','调整分类或搜索词。')}</div></section>`+
    `<section class="radar-motion-library"><div class="section-head"><div><span class="eyebrow">CAMERA MOVEMENT</span><h2>中文运镜词典 · ${Radar.MOTIONS.length}种</h2><p>这是为你的工作台重新编写的中文拍摄说明，不复制 Frameset 的影片、GIF或原文。</p></div><div class="actions">${radarOpenLink('https://frameset.app/search','打开 Frame Set 找画面')}${btn('全部加入参考库','radar-save-motion-all','',true)}</div></div><div class="radar-motion-grid">${Radar.MOTIONS.map(radarMotionCard).join('')}</div></section>`+
    `<details class="panel radar-sources"><summary><strong>网站源清单 · ${Radar.SOURCES.length}个</strong><span>需手动挑选作品，系统不会自动登录或抓取</span></summary><div class="radar-source-grid">${Radar.SOURCES.map(item=>{const saved=radarSaved(item);return `<article class="radar-source"><div><h3>${esc(item.name)}</h3><p>${esc(item.note)}</p><div class="aesthetic-tags">${item.categories.map(c=>`<span>${esc(c)}</span>`).join('')}</div></div><div class="actions">${radarOpenLink(item.url,'访问网站')}${saved?btn('已收藏','radar-open-saved',`data-id="${esc(saved.id)}"`):btn('收藏这个来源','radar-save-source',`data-id="${esc(item.id)}"`)}</div></article>`;}).join('')}</div></details>`+
    `<div class="callout"><strong>收藏规则</strong><p>链接只是线索，不代表系统已读取网页。AI案例必须标清“商业交付／完整成片／模型测试”，并核对角色连续、镜头连续、真实可拍性和版权风险。</p></div>`;
}
function radarCustomDialog(){
  StudioCapture.quickDialog();
}
function radarStore(item,kind){
  const all=globalAssets(),existing=Radar.duplicate(all,item);if(existing)return existing;
  const record=kind==='source'?Radar.sourceToAesthetic(item,C.uid):kind==='motion'?Radar.motionToAesthetic(item,C.uid):Radar.caseToAesthetic(item,C.uid,scope);all.push(record);saveAesthetic(all);return record;
}
async function radarAction(action,e){
  if(action==='radar-filter'){radarQuery.category=e.dataset.category;render();return;}
  if(action==='radar-new'){radarCustomDialog();return;}
  if(action==='radar-helper'){StudioCapture.helperDialog();return;}
  if(action==='radar-pinterest'){await StudioCapture.pinterestDialog();return;}
  if(action==='radar-pinterest-sync'){await StudioCapture.pinterestSync();return;}
  if(action==='radar-capture-paste'){await StudioCapture.paste();return;}
  if(action==='radar-capture-voice'){StudioCapture.voice(e);return;}
  if(action==='radar-capture-copy'){await StudioCapture.copyBookmarklet();return;}
  if(action==='radar-capture-save'){StudioCapture.save();return;}
  if(action==='radar-save-case'){const item=Radar.CASES.find(x=>x.id===e.dataset.id);if(!item)throw Error('案例不存在');radarStore(item,'case');render();notify('已收藏到当前空间的审美库，可继续补图或归入项目文件夹。');return;}
  if(action==='radar-save-source'){const item=Radar.SOURCES.find(x=>x.id===e.dataset.id);if(!item)throw Error('来源不存在');radarStore(item,'source');render();notify('网站来源已收藏；挑中具体作品后，请再建一张案例卡。');return;}
  if(action==='radar-save-motion'){const item=Radar.MOTIONS.find(x=>x.id===e.dataset.id);if(!item)throw Error('运镜卡不存在');radarStore(item,'motion');render();notify('中文运镜卡已加入当前空间的审美参考库。');return;}
  if(action==='radar-save-motion-all'){const before=globalAssets().length;for(const item of Radar.MOTIONS)radarStore(item,'motion');const added=globalAssets().length-before;render();notify(added?`已加入 ${added} 张中文运镜卡；已有卡片不会重复。`:'全部中文运镜卡已经在参考库里。');return;}
  if(action==='radar-open-saved'){const item=globalAssets().find(x=>x.id===e.dataset.id);if(!item)throw Error('收藏记录不存在');route={view:'aesthetic'};render();aestheticDialog(item);return;}
  if(action==='radar-topic'){const item=Radar.CASES.find(x=>x.id===e.dataset.id);if(!item)throw Error('案例不存在');radarStore(item,'case');const topic=Radar.caseToTopic(item,C.topic,scope);db.topics.push(topic);save();route={view:'topic',id:topic.id,tab:scope==='personal'?'idea':'direction'};render();notify('已建立新选题；只带入可迁移的方法，完整汇报仍需你确认后生成。');return;}
}
document.addEventListener('input',event=>{if(!event.target.hasAttribute('data-radar-search'))return;radarQuery.search=event.target.value;const pos=event.target.selectionStart;render();$('[data-radar-search]')?.focus();$('[data-radar-search]')?.setSelectionRange(pos,pos);});
