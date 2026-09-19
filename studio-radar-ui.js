const Radar=StudioRadar;
let radarQuery={category:'全部',search:''};
function radarSaved(item){return Radar.duplicate(globalAssets(),item);}
function radarOpenLink(url,label='打开来源'){return `<a class="button" href="${esc(A.link(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;}
function radarCaseCard(item,featured=false){
  const saved=radarSaved(item);return `<article class="radar-case ${featured?'featured':''}"><div class="radar-card-top"><span class="badge">${esc(item.category)}</span><small>${esc(item.type)}</small></div><h3>${esc(item.title)}</h3><p class="radar-mechanism">${esc(item.mechanism)}</p><dl><div><dt>目标</dt><dd>${esc(item.goal)}</dd></div><div><dt>开场8秒</dt><dd>${esc(item.hook)}</dd></div><div><dt>可迁移</dt><dd>${esc(item.transfer)}</dd></div></dl><div class="actions">${radarOpenLink(item.url)}${saved?btn('已收藏 · 整理文件夹','radar-open-saved',`data-id="${esc(saved.id)}"`):btn('收藏到审美库','radar-save-case',`data-id="${esc(item.id)}"`,true)}${btn('转为我的选题','radar-topic',`data-id="${esc(item.id)}"`)}</div></article>`;
}
function renderRadar(){
  const search=radarQuery.search.toLowerCase(),cases=Radar.CASES.filter(item=>(radarQuery.category==='全部'||item.category===radarQuery.category)&&`${item.title} ${item.goal} ${item.mechanism} ${item.site}`.toLowerCase().includes(search));
  const featured=Radar.daily(Radar.CASES);
  return hero('CASE RADAR','案例雷达','找方法，不搬画面。先打开来源看完整作品，再收藏到审美库或转成你的新选题。',btn('记录我发现的案例','radar-new','',true)+btn('打开已收藏','nav','data-view="aesthetic"'))+
    `<section class="radar-start"><div class="section-head"><div><span class="eyebrow">TODAY’S 3 PICKS</span><h2>今天先看 3 个</h2></div><p>每天只给3个起点，避免越收藏越没方向。</p></div><div class="radar-grid">${featured.map(item=>radarCaseCard(item,true)).join('')}</div></section>`+
    `<section class="radar-library"><div class="section-head"><div><span class="eyebrow">CREATIVE DIRECTIONS</span><h2>按任务找案例</h2></div><label class="radar-search">搜索案例<input data-radar-search value="${esc(radarQuery.search)}" placeholder="例如：造势、世界观、舞台"></label></div><div class="radar-filters">${['全部',...Radar.CATEGORIES].map(category=>btn(esc(category),'radar-filter',`data-category="${esc(category)}" class="${radarQuery.category===category?'active':''}"`)).join('')}</div><div class="radar-grid">${cases.map(item=>radarCaseCard(item)).join('')||empty('没有匹配的案例','调整分类或搜索词。')}</div></section>`+
    `<details class="panel radar-sources"><summary><strong>网站源清单 · ${Radar.SOURCES.length}个</strong><span>需手动挑选作品，系统不会自动登录或抓取</span></summary><div class="radar-source-grid">${Radar.SOURCES.map(item=>{const saved=radarSaved(item);return `<article class="radar-source"><div><h3>${esc(item.name)}</h3><p>${esc(item.note)}</p><div class="aesthetic-tags">${item.categories.map(c=>`<span>${esc(c)}</span>`).join('')}</div></div><div class="actions">${radarOpenLink(item.url,'访问网站')}${saved?btn('已收藏','radar-open-saved',`data-id="${esc(saved.id)}"`):btn('收藏这个来源','radar-save-source',`data-id="${esc(item.id)}"`)}</div></article>`;}).join('')}</div></details>`+
    `<div class="callout"><strong>收藏规则</strong><p>链接只是线索，不代表系统已读取网页。AI案例必须标清“商业交付／完整成片／模型测试”，并核对角色连续、镜头连续、真实可拍性和版权风险。</p></div>`;
}
function radarCustomDialog(){
  dialog('记录我发现的案例',`<div class="formgrid"><label>案例名称<input id="radar-title" required placeholder="作品或项目名"></label><label>类型<select id="radar-category">${Radar.CATEGORIES.map(c=>`<option>${esc(c)}</option>`).join('')}</select></label><label class="wide">来源链接<textarea id="radar-link" class="short" required placeholder="https://"></textarea></label><label>案例性质<select id="radar-type"><option>商业交付案例</option><option>完整成片参考</option><option>模型效果测试</option><option>制作方法</option></select></label><label>目标<input id="radar-goal" placeholder="预约、造势、信任、成交或品牌"></label><label class="wide">一句话创意机制<textarea id="radar-mechanism" placeholder="它用什么办法让观众想继续看？"></textarea></label><label class="wide">我想借鉴什么<textarea id="radar-transfer" placeholder="只写方法，不写“照着拍”"></textarea></label><label class="wide">不能照搬什么<textarea id="radar-avoid" placeholder="IP、人物、画面、品牌语言、特定机制……"></textarea></label></div><p class="muted">保存后进入当前 ${scope==='xinxuan'?'My·工作':'My·个人'} 的审美参考库，不会自动抓取网页。</p>`,btn('收藏并继续整理','radar-save-custom','',true));
}
function radarStore(item,kind){
  const all=globalAssets(),existing=Radar.duplicate(all,item);if(existing)return existing;
  const record=kind==='source'?Radar.sourceToAesthetic(item,C.uid):Radar.caseToAesthetic(item,C.uid,scope);all.push(record);saveAesthetic(all);return record;
}
async function radarAction(action,e){
  if(action==='radar-filter'){radarQuery.category=e.dataset.category;render();return;}
  if(action==='radar-new'){radarCustomDialog();return;}
  if(action==='radar-save-case'){const item=Radar.CASES.find(x=>x.id===e.dataset.id);if(!item)throw Error('案例不存在');radarStore(item,'case');render();notify('已收藏到当前空间的审美库，可继续补图或归入项目文件夹。');return;}
  if(action==='radar-save-source'){const item=Radar.SOURCES.find(x=>x.id===e.dataset.id);if(!item)throw Error('来源不存在');radarStore(item,'source');render();notify('网站来源已收藏；挑中具体作品后，请再建一张案例卡。');return;}
  if(action==='radar-open-saved'){const item=globalAssets().find(x=>x.id===e.dataset.id);if(!item)throw Error('收藏记录不存在');route={view:'aesthetic'};render();aestheticDialog(item);return;}
  if(action==='radar-topic'){const item=Radar.CASES.find(x=>x.id===e.dataset.id);if(!item)throw Error('案例不存在');radarStore(item,'case');const topic=Radar.caseToTopic(item,C.topic,scope);db.topics.push(topic);save();route={view:'topic',id:topic.id,tab:scope==='personal'?'idea':'direction'};render();notify('已建立新选题；只带入可迁移的方法，完整汇报仍需你确认后生成。');return;}
  if(action==='radar-save-custom'){
    const title=$('#radar-title').value.trim(),url=A.link($('#radar-link').value);if(!title)throw Error('请填写案例名称');
    const item={id:'custom:'+Radar.normalizedURL(url),title,url,site:new URL(url).hostname,category:$('#radar-category').value,type:$('#radar-type').value,goal:$('#radar-goal').value.trim(),mechanism:$('#radar-mechanism').value.trim(),transfer:$('#radar-transfer').value.trim(),avoid:$('#radar-avoid').value.trim(),hook:'待看完整片后补充',arc:'待看完整片后补充',craft:'待看完整片后补充',cover:'待观察视频封面和首帧',ai:'待核对AI参与类型、模型和工作流',risk:'待核对版权、肖像、品牌与真实可拍性'};
    const existing=Radar.duplicate(globalAssets(),item);if(existing)throw Error('这个链接已在审美库，可直接编辑原记录');const record=radarStore(item,'case');close();route={view:'aesthetic'};render();aestheticDialog(record);notify('案例已收藏，请补图并选入项目参考文件夹。');return;
  }
}
document.addEventListener('input',event=>{if(!event.target.hasAttribute('data-radar-search'))return;radarQuery.search=event.target.value;const pos=event.target.selectionStart;render();$('[data-radar-search]')?.focus();$('[data-radar-search]')?.setSelectionRange(pos,pos);});
