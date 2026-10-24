const Radar=StudioRadar;
let radarQuery={category:'全部',search:''};
function radarSaved(item){return Radar.duplicate(globalAssets(),item);}
const RADAR_SEEN_KEY='lance_radar_seen_v1',RADAR_DAY_KEY='lance_radar_daily_v1',RADAR_SIGNAL_KEY='lance_radar_signals_v1';
let radarFeed={date:'',items:[],remaining:0,reset:false,offset:0,signature:'',why:{}},radarExcluded=new Set();
function radarReadJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function radarSeenIds(){const value=radarReadJSON(RADAR_SEEN_KEY,[]);return Array.isArray(value)?value:[];}
function radarSignalStore(){const value=radarReadJSON(RADAR_SIGNAL_KEY,null);return value&&Array.isArray(value.events)?value:Radar.emptySignals();}
function radarInvalidate(){radarFeed={...radarFeed,date:'',items:[],signature:''};try{localStorage.removeItem(RADAR_DAY_KEY);}catch{}}
// 口味 = 已存的行为信号 + 参考库里已有的收藏 + 已经转为选题的案例（老数据也能直接学到）。
function radarProfile(){
  const stored=radarSignalStore(),projects=(db&&db.topics)||[];
  return Radar.deriveSignals({cases:Radar.CASES,events:stored.events,assets:globalAssets(),topics:projects});
}
function radarActiveProject(){
  const projects=((db&&db.projects)||[]).filter(project=>project&&!project.archivedAt&&!project.cancelledAt);
  if(!projects.length)return null;
  const current=route&&route.id?projects.find(project=>project.id===route.id):null;
  if(current)return current;
  return [...projects].sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null;
}
function radarProjectContext(){try{return Radar.projectContext(radarActiveProject());}catch{return null;}}
// ── 语义匹配：把案例和你「正在做的项目 + 已收藏的口味」都变成向量，按余弦相似度排序 ──
// 案例向量在服务端按内容哈希缓存，算过一次就永久命中；每天只为 query 付一次调用。
const RADAR_SEMANTIC_KEY='lance_radar_semantic_v1';
let radarSemantic={day:'',query:'',scores:{},ready:false,warming:false,coverage:0,error:''};
function radarLoadSemantic(){
  const cached=radarReadJSON(RADAR_SEMANTIC_KEY,null),day=Radar.dayKey(new Date(),'Asia/Shanghai');
  if(cached&&cached.day===day&&cached.scores&&typeof cached.scores==='object'&&Object.keys(cached.scores).length){
    radarSemantic={...radarSemantic,day:cached.day,query:cached.query||'',scores:cached.scores,ready:Boolean(cached.ready),coverage:Number(cached.coverage)||Object.keys(cached.scores).length,warming:false,error:''};
  }
  return radarSemantic;
}
function radarSemanticQuery(){
  const parts=[],project=radarActiveProject();
  if(project){
    parts.push(project.title,project.idea);
    const fields=Object.values(project.fields||{}).filter(Boolean).join(' ');
    if(fields)parts.push(fields.slice(0,400));
  }
  const summary=Radar.signalSummary(radarProfile(),new Date());
  const categories=Radar.topSignals(summary,'category',3).map(item=>item.name);
  const focuses=Radar.topSignals(summary,'focus',2).map(item=>item.name);
  if(categories.length)parts.push(categories.join('、'));
  if(focuses.length)parts.push(focuses.join('、'));
  const saved=(globalAssets()||[]).filter(asset=>asset&&(asset.radarKind==='case'||asset.radarKind==='feed')).slice(-6).map(asset=>asset.name).filter(Boolean);
  if(saved.length)parts.push(saved.join('、'));
  return parts.filter(Boolean).join(' / ').slice(0,600);
}
function radarSemanticLine(){
  if(radarSemantic.warming)return `语义匹配准备中 ${radarSemantic.coverage||0} / ${Radar.CASES.length}（首次约一分钟，之后每天只需一次调用）`;
  if(radarSemantic.ready)return `语义匹配已开启 · 已索引 ${radarSemantic.coverage||0} 条案例`;
  if(radarSemantic.error)return `语义匹配暂不可用（${radarSemantic.error}），已回到本地口味匹配`;
  return '语义匹配未开启，先用本地口味匹配';
}
async function radarWarmSemantic(force=false){
  if(radarSemantic.warming)return radarSemantic;
  const day=Radar.dayKey(new Date(),'Asia/Shanghai'),query=radarSemanticQuery();
  if(!query)return radarSemantic;
  // 已经成功、或者今天已经失败过，都不再重复重试，避免每次渲染都打一次接口。
  if(!force&&radarSemantic.day===day&&radarSemantic.query===query&&(radarSemantic.ready||radarSemantic.error))return radarSemantic;
  const fresh=radarSemantic.day!==day||radarSemantic.query!==query;
  radarSemantic={...radarSemantic,day,query,warming:true,error:'',scores:fresh?{}:(radarSemantic.scores||{}),coverage:fresh?0:(radarSemantic.coverage||0)};
  const items=Radar.CASES.map(item=>({id:item.id,text:Radar.caseEmbeddingText(item)}));
  try{
    for(let round=0;round<24;round++){
      const data=await api('radar-rank',{scope,query,items,limit:8});
      radarSemantic.scores={...(radarSemantic.scores||{}),...(data.scores||{})};
      radarSemantic.coverage=Object.keys(radarSemantic.scores).length;
      radarRefreshMeta();
      if(!data.pending)break;
    }
    radarSemantic.ready=radarSemantic.coverage>=Math.max(8,Math.floor(items.length*0.6));
    try{localStorage.setItem(RADAR_SEMANTIC_KEY,JSON.stringify({day,query,scores:radarSemantic.scores,ready:radarSemantic.ready,coverage:radarSemantic.coverage}));}catch{}
    // 不主动清今日缓存：语义准备好以后由「换一组」或明天自动接手，
    // 避免用户正在看的时候整组推荐突然被换掉。
    if(radarSemantic.ready&&route.view==='radar')notify('语义匹配已开启：下次「换一组」会按你的项目和收藏排序。');
  }catch(error){
    radarSemantic.error=error.message||'语义匹配暂时不可用';
  }
  radarSemantic.warming=false;
  radarRefreshMeta();
  return radarSemantic;
}
function radarRefreshMeta(){
  const node=document.querySelector('.radar-feed-meta');
  if(node)node.outerHTML=radarFeedMetaMarkup();
}
function radarFeedMetaMarkup(){
  const context=radarProjectContext(),taste=Radar.profileLine(Radar.signalSummary(radarProfile(),new Date()),context);
  return `<div class="radar-feed-meta"><p class="radar-taste ${taste.cold?'cold':''}"><b>智能推荐</b>${esc(taste.text)}</p><p>已给你看过 ${radarFeed.shown||0} / ${Radar.CASES.length} 条；同样的案例要等 ${Math.max(1,Radar.CASES.length-3)} 条之后才会再出现。</p><p class="radar-semantic ${radarSemantic.ready?'on':''}">${esc(radarSemanticLine())}</p><div class="radar-meta-actions">${btn('换一组 · 不重复','radar-refresh')}${btn('重置口味','radar-reset-taste')}</div></div>`;
}
// 签名只跟「项目 + 今天主动移除的案例」有关：点「更多这类」不会打乱正在看的这一组，
// 只有「少来这类」才立刻换掉那一条。
function radarSignature(profile,context){
  return [context?context.id:'',[...radarExcluded].sort().join(',')].join('|');
}
function radarPicks(force=false){
  const pool=Radar.CASES,count=Math.min(3,pool.length),date=Radar.dayKey(new Date(),'Asia/Shanghai'),profile=radarProfile(),context=radarProjectContext(),cached=radarReadJSON(RADAR_DAY_KEY,null);
  if(radarFeed.date&&radarFeed.date!==date){radarFeed.offset=0;radarExcluded.clear();}
  // 刷新页面时把今天「少来这类」的排除项找回来，保证同一天看到的还是同一组。
  if(!force&&cached&&cached.date===date&&Array.isArray(cached.exclude)&&!radarExcluded.size)cached.exclude.forEach(id=>radarExcluded.add(id));
  const signature=radarSignature(profile,context);
  if(!force&&radarFeed.date===date&&radarFeed.items.length===count&&radarFeed.signature===signature)return radarFeed.items;
  if(!force&&!radarFeed.offset){
    if(cached&&cached.date===date&&cached.signature===signature&&Array.isArray(cached.ids)){
      const restored=cached.ids.map(id=>pool.find(item=>item.id===id)).filter(Boolean);
      if(restored.length===count){radarFeed={date,items:restored,remaining:Number(cached.remaining)||0,shown:Number(cached.shown)||radarSeenIds().length,reset:false,offset:0,signature,why:cached.why||{}};return restored;}
    }
  }
  const batch=Radar.planSmart(pool,{seenIds:radarSeenIds(),date:new Date(),offset:radarFeed.offset,count:3,profile,context,exclude:[...radarExcluded],semantic:radarSemantic.ready?radarSemantic.scores:null});
  const why={};for(const pick of batch.picks)why[pick.id]=pick.why;
  try{localStorage.setItem(RADAR_SEEN_KEY,JSON.stringify(batch.seen));localStorage.setItem(RADAR_DAY_KEY,JSON.stringify({date:batch.date,ids:batch.items.map(item=>item.id),remaining:batch.remaining,shown:batch.shown,signature,exclude:[...radarExcluded],why}));}catch{}
  radarFeed={date:batch.date,items:batch.items,remaining:batch.remaining,shown:batch.shown,reset:batch.reset,offset:radarFeed.offset,signature,why};
  return batch.items;
}
// 只让「更多这类／少来这类」立刻改今天的推荐；收藏、打开原片、转选题只影响以后，不打断当前这一组。
function radarRecord(kind,item,steer=false){
  if(!item||!item.id)return;
  try{localStorage.setItem(RADAR_SIGNAL_KEY,JSON.stringify(Radar.appendSignal(radarSignalStore(),{kind,item})));}catch{}
  if(steer){radarInvalidate();}
}
function radarRecordOpen(id){radarRecord('open',Radar.CASES.find(item=>item.id===id));}
function radarWhyLine(id){
  const why=(radarFeed.why||{})[id];
  return why&&why.length?`<p class="radar-why"><b>为什么推给你</b>${why.map(esc).join(' · ')}</p>`:'';
}
function radarOpenLink(url,label='打开来源'){return `<a class="button" href="${esc(A.link(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;}
const RADAR_NEWS_KEY='lance_radar_news_v1';
const RADAR_FEED_SOURCES=[{id:'digitaling',name:'数英'},{id:'eventmarketer',name:'Event Marketer'},{id:'stash',name:'Stash'},{id:'livedesign',name:'Live Design'},{id:'directorslibrary',name:'Directors’ Library'}];
let radarNews={date:'',items:[],sources:[],loading:false,error:'',fetchedAt:0},radarNewsPending=false;
function radarBase(){return location.hostname.endsWith('github.io')?'https://lance-content-studio.onrender.com':'';}
// 「你喜欢的网站」= 你收藏过作品或收藏过来源的站；没有记录时先按全部更新源推。
function radarFavoriteSources(){
  const assets=globalAssets()||[],sites=new Set(),ids=new Set();
  for(const asset of assets){
    if(!asset)continue;
    if(asset.sourceSite)sites.add(asset.sourceSite);
    if(asset.radarKind==='source'&&asset.radarSourceId)ids.add(asset.radarSourceId);
  }
  return RADAR_FEED_SOURCES.filter(source=>sites.has(source.name)||sites.has(source.id)||ids.has(source.id)).map(source=>source.id);
}
function radarFmtDate(value){
  const time=Date.parse(value||'');
  if(!time)return '时间待核对';
  const date=new Date(time);
  return `${date.getMonth()+1}月${date.getDate()}日`;
}
async function radarLoadNews(force=false){
  const today=Radar.dayKey(new Date(),'Asia/Shanghai'),cached=radarReadJSON(RADAR_NEWS_KEY,null);
  if(!force&&cached&&cached.date===today&&Array.isArray(cached.items)&&cached.items.length&&!cached.error){radarNews={...cached,loading:false,error:''};return radarNews;}
  const favorites=radarFavoriteSources(),ids=favorites.length?favorites:RADAR_FEED_SOURCES.map(source=>source.id);
  radarNews={date:today,items:[],sources:[],loading:true,error:'',fetchedAt:0};
  try{
    const response=await fetch(`${radarBase()}/api/radar-feed?source=${encodeURIComponent(ids.join(','))}&limit=12`,{cache:'no-store'});
    if(!response.ok)throw Error(`网站更新暂时取不到（${response.status}）`);
    const data=await response.json();
    radarNews={date:today,items:Array.isArray(data.items)?data.items:[],sources:Array.isArray(data.sources)?data.sources:[],loading:false,error:'',fetchedAt:Number(data.fetchedAt)||0,settled:true};
    try{localStorage.setItem(RADAR_NEWS_KEY,JSON.stringify(radarNews));}catch{}
  }catch(error){
    radarNews={date:today,items:[],sources:[],loading:false,error:error.message||'网站更新暂时取不到',fetchedAt:0,settled:true};
  }
  return radarNews;
}
function radarEnsureNews(){
  const today=Radar.dayKey(new Date(),'Asia/Shanghai');
  if(radarNewsPending||radarNews.loading)return;
  if(radarNews.date===today&&(radarNews.settled||radarNews.items.length||radarNews.error))return;
  radarNewsPending=true;
  radarLoadNews().then(()=>{radarNewsPending=false;radarNewsUpdate();}).catch(()=>{radarNewsPending=false;});
}
// 只在原地替换「网站最新」这一块，避免整页重渲染打断正在点击的按钮。
function radarNewsUpdate(){
  const node=document.querySelector('.radar-news');
  if(node)node.outerHTML=radarNewsMarkup();
}
function radarNewsMarkup(){
  const favorites=radarFavoriteSources(),names=favorites.map(id=>(RADAR_FEED_SOURCES.find(source=>source.id===id)||{}).name).filter(Boolean);
  const subtitle=favorites.length?`来自你收藏过的网站：${names.join('、')}`:'来自案例雷达的公开更新源；收藏过的网站会优先出现在这里';
  const head=`<div class="section-head"><div><span class="eyebrow">FROM YOUR SOURCES</span><h2>你喜欢的网站 · 最新</h2><p>${esc(subtitle)}。只带标题、链接和封面，正文和影片请回原站看。</p></div><div class="actions">${btn('刷新更新','radar-news-refresh')}</div></div>`;
  if(radarNews.loading)return `<section class="radar-news">${head}<p class="radar-news-note">正在读取网站更新…</p></section>`;
  if(radarNews.error)return `<section class="radar-news">${head}<p class="radar-news-note">${esc(radarNews.error)}</p></section>`;
  if(!radarNews.items.length)return `<section class="radar-news">${head}<p class="radar-news-note">这些网站最近没有新内容。</p></section>`;
  const cards=radarNews.items.map(item=>{
    const saved=Radar.duplicate(globalAssets(),item);
    const visual=item.poster?`<img src="${esc(radarPreviewURL(item.poster))}" alt="${esc(item.title)}" loading="lazy" onerror="this.closest('.radar-news-visual').classList.add('image-failed');this.remove()">`:'<span class="radar-news-placeholder">原站查看</span>';
    return `<article class="radar-news-card"><a class="radar-news-visual" href="${esc(A.link(item.url))}" target="_blank" rel="noopener noreferrer">${visual}</a><div class="radar-news-body"><div class="radar-news-meta"><span>${esc(item.site||'网站更新')}</span><small>${esc(radarFmtDate(item.publishedAt))}</small></div><h3>${esc(item.title)}</h3><div class="actions"><a class="button" href="${esc(A.link(item.url))}" target="_blank" rel="noopener noreferrer">打开原文 ↗</a>${saved?btn('已在参考库','radar-open-saved',`data-id="${esc(saved.id)}"`):btn('收进参考库','radar-news-save',`data-id="${esc(item.id)}"`,true)}</div></div></article>`;
  }).join('');
  return `<section class="radar-news">${head}<div class="radar-news-grid">${cards}</div></section>`;
}
function radarPreviewURL(url){const base=location.hostname.endsWith('github.io')?'https://lance-content-studio.onrender.com':'';return `${base}/api/radar-preview?url=${encodeURIComponent(url)}`;}
function radarChineseGuide(item){
  return `<details class="radar-cn-guide"><summary><span>中文看片卡</span><strong>英文不用硬读，先看这里</strong></summary><div class="radar-cn-grid"><div><b>这是什么</b><p>${esc(item.goal)}</p></div><div><b>故事怎么走</b><p>${esc(item.arc)}</p></div><div><b>重点看画面</b><p>${esc(item.craft)}</p></div><div><b>封面怎么判断</b><p>${esc(item.cover)}</p></div><div><b>AI怎么参与</b><p>${esc(item.ai)}</p></div><div><b>注意别照搬</b><p>${esc([item.avoid,item.risk].filter(Boolean).join('；'))}</p></div></div><p class="radar-cn-note">确认这张看片卡对你有价值后，再打开原网站；进入英文页面时只需要看原片、图片和幕后花絮。</p></details>`;
}
function radarCaseCard(item,featured=false){
  const saved=radarSaved(item),visual=item.poster?`<img src="${esc(radarPreviewURL(item.poster))}" alt="${esc(item.title)}案例预览" loading="lazy" onerror="this.closest('.radar-case-visual').classList.add('image-failed');this.remove()">`:`<span class="radar-case-placeholder">待补预览</span>`;
  const open=`<a class="button" href="${esc(A.link(item.url))}" target="_blank" rel="noopener noreferrer" onclick="radarRecordOpen('${esc(item.id)}')">值得看，再开原片 ↗</a>`;
  const tune=featured?`<div class="radar-tune"><button data-action="radar-like" data-id="${esc(item.id)}">更多这类</button><button data-action="radar-less" data-id="${esc(item.id)}">少来这类</button></div>`:'';
  return `<article class="radar-case ${featured?'featured':''}"><a class="radar-case-visual" href="${esc(A.link(item.url))}" target="_blank" rel="noopener noreferrer" onclick="radarRecordOpen('${esc(item.id)}')">${visual}<span class="radar-case-source">${esc(item.site||'案例来源')} · 只看原片 ↗</span></a><div class="radar-case-body"><div class="radar-card-top"><span class="badge">${esc(item.visualFocus||item.category)}</span><small>${esc(item.category)} · ${esc(item.type)}</small></div><h3>${esc(item.title)}</h3>${featured?radarWhyLine(item.id):''}<p class="radar-mechanism">${esc(item.mechanism)}</p><dl><div><dt>为什么值得看</dt><dd>${esc(item.craft||item.goal)}</dd></div><div><dt>开场8秒</dt><dd>${esc(item.hook)}</dd></div><div><dt>怎么转成我的</dt><dd>${esc(item.transfer)}</dd></div></dl>${radarChineseGuide(item)}<div class="actions">${open}${saved?btn('已收藏 · 整理文件夹','radar-open-saved',`data-id="${esc(saved.id)}"`):btn('收藏到审美库','radar-save-case',`data-id="${esc(item.id)}"`,true)}${btn('转为我的选题','radar-topic',`data-id="${esc(item.id)}"`)}</div>${tune}</div></article>`;
}
function radarMotionCard(item){
  const saved=radarSaved(item);
  return `<article class="radar-motion-card"><div class="radar-motion-symbol" aria-hidden="true">${esc(item.symbol)}</div><div class="radar-motion-head"><span>${esc(item.en)}</span><h3>${esc(item.name)}</h3></div><p>${esc(item.description)}</p><dl><div><dt>画面感受</dt><dd>${esc(item.effect)}</dd></div><div><dt>拍摄执行</dt><dd>${esc(item.execution)}</dd></div><div><dt>适合</dt><dd>${esc(item.use)}</dd></div><div><dt>避免</dt><dd>${esc(item.avoid)}</dd></div></dl>${saved?btn('已在参考库','radar-open-saved',`data-id="${esc(saved.id)}"`):btn('加入我的参考库','radar-save-motion',`data-id="${esc(item.id)}"`,true)}</article>`;
}
function renderRadar(){
  radarLoadSemantic();
  const search=radarQuery.search.toLowerCase(),cases=Radar.CASES.filter(item=>(radarQuery.category==='全部'||item.category===radarQuery.category)&&`${item.title} ${item.goal} ${item.mechanism} ${item.site}`.toLowerCase().includes(search));
  const featured=radarPicks();
  radarEnsureNews();
  radarWarmSemantic();
  return hero('CASE RADAR','案例雷达','先看图片和中文看片卡，再决定要不要进入英文网站；原网站只负责看原片，不要求你读懂英文。',btn('快速收藏案例','radar-new','',true)+btn('一键收藏助手','radar-helper')+btn('同步 Pinterest','radar-pinterest')+btn('打开已收藏','nav','data-view="aesthetic"'))+
    `<section class="radar-language-help"><strong>英文网站不用硬读</strong><span>① 看预览图判断气质　② 展开中文看片卡理解创意　③ 值得看才进入原站，只看视频和幕后画面</span></section>`+
    `<section class="radar-start"><div class="section-head"><div><span class="eyebrow">TODAY’S 3 PICKS</span><h2>今天先看 3 个</h2></div>${radarFeedMetaMarkup()}</div><div class="radar-grid">${featured.map(item=>radarCaseCard(item,true)).join('')}</div></section>`+
    radarNewsMarkup()+
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
// 收藏后把封面真正下载进库：先落链接，封面到了再补，失败不影响收藏本身。
async function radarAttachCover(recordId,item){
  if(!recordId||!item||!item.poster)return null;
  const find=()=>globalAssets().find(value=>value.id===recordId)||null;
  const current=find();
  if(!current)return null;
  if((current.files||[]).some(file=>file&&file.kind==='image'))return current;
  const uploaded=await capturePublicImage(item.poster,item.title||item.name||'案例封面');
  if(!uploaded)return null;
  const all=globalAssets(),record=all.find(value=>value.id===recordId);
  if(!record)return null;
  if((record.files||[]).some(file=>file&&(file.kind==='image'||file.localId===uploaded.localId)))return record;
  record.files=[...(record.files||[]),uploaded];
  record.coverId=uploaded.localId;
  record.sourceUsage='internal-reference';
  record.notes=[record.notes||'',`封面已保存到本机（${uploaded.name||'图片'}），仅作内部视觉参考，不做二次发布。`].filter(Boolean).join('\n');
  record.requirements=record.notes;
  record.updatedAt=new Date().toISOString();
  saveAesthetic(all);
  return record;
}
function radarAfterCover(record,item,label){
  if(!record)return Promise.resolve(null);
  return radarAttachCover(record.id,item).then(saved=>{
    if(route.view==='radar')render();
    if(saved)notify(`${label}：封面已一起保存进参考库。`);
    else notify(`${label}：封面这次没抓到，已保留标题和链接，可稍后在详情里补图。`,'warning');
    return saved;
  }).catch(()=>null);
}
async function radarAction(action,e){
  if(action==='radar-filter'){radarQuery.category=e.dataset.category;render();return;}
  if(action==='radar-refresh'){radarFeed.offset+=1;radarPicks(true);render();notify(radarFeed.reset?`上一轮 ${Radar.CASES.length} 条已走完，现在开始新一轮`:'已换一组，这一轮内不会重复');return;}
  if(action==='radar-like'||action==='radar-less'){
    const item=Radar.CASES.find(x=>x.id===e.dataset.id);
    if(!item)throw Error('案例不存在');
    if(action==='radar-like'){
      radarRecord('like',item);
      render();
      notify(`记住了：以后多推「${item.visualFocus||item.category}」这类。`);
    }else{
      radarExcluded.add(item.id);radarRecord('less',item,true);
      radarFeed.offset+=1;radarPicks(true);render();
      notify(`这条已移出今天的推荐，并会少推「${item.visualFocus||item.category}」这类。`);
    }
    return;
  }
  if(action==='radar-reset-taste'){
    try{localStorage.removeItem(RADAR_SIGNAL_KEY);}catch{}
    radarExcluded.clear();radarInvalidate();radarPicks(true);render();
    notify('已清空口味记录；已收藏的参考不会被删除。');
    return;
  }
  if(action==='radar-news-refresh'){
    await radarLoadNews(true);render();
    notify(radarNews.error?radarNews.error:(radarNews.items.length?`已刷新：${radarNews.items.length} 条网站新内容`:'这些网站最近没有新内容'));
    return;
  }
  if(action==='radar-news-save'){
    const item=(radarNews.items||[]).find(value=>value.id===e.dataset.id);
    if(!item)throw Error('这条网站更新已经不在列表里，请刷新更新');
    const all=globalAssets(),existing=Radar.duplicate(all,item);
    if(existing){route={view:'aesthetic'};render();aestheticDialog(existing);return;}
    const record=Radar.feedToAesthetic(item,C.uid);
    all.push(record);saveAesthetic(all);
    render();notify('已收进参考库，正在抓取封面…');
    radarAfterCover(record,item,'已收进参考库');
    return;
  }
  if(action==='radar-new'){radarCustomDialog();return;}
  if(action==='radar-helper'){StudioCapture.helperDialog();return;}
  if(action==='radar-pinterest'){await StudioCapture.pinterestDialog();return;}
  if(action==='radar-pinterest-sync'){await StudioCapture.pinterestSync();return;}
  if(action==='radar-capture-paste'){await StudioCapture.paste();return;}
  if(action==='radar-capture-voice'){StudioCapture.voice(e);return;}
  if(action==='radar-capture-copy'){await StudioCapture.copyBookmarklet();return;}
  if(action==='radar-capture-save'){StudioCapture.save();return;}
  if(action==='radar-save-case'){const item=Radar.CASES.find(x=>x.id===e.dataset.id);if(!item)throw Error('案例不存在');const record=radarStore(item,'case');radarRecord('save',item);render();notify('已收藏到当前空间的审美库，正在抓取封面…');radarAfterCover(record,item,'已收藏');return;}
  if(action==='radar-save-source'){const item=Radar.SOURCES.find(x=>x.id===e.dataset.id);if(!item)throw Error('来源不存在');radarStore(item,'source');render();notify('网站来源已收藏；挑中具体作品后，请再建一张案例卡。');return;}
  if(action==='radar-save-motion'){const item=Radar.MOTIONS.find(x=>x.id===e.dataset.id);if(!item)throw Error('运镜卡不存在');radarStore(item,'motion');render();notify('中文运镜卡已加入当前空间的审美参考库。');return;}
  if(action==='radar-save-motion-all'){const before=globalAssets().length;for(const item of Radar.MOTIONS)radarStore(item,'motion');const added=globalAssets().length-before;render();notify(added?`已加入 ${added} 张中文运镜卡；已有卡片不会重复。`:'全部中文运镜卡已经在参考库里。');return;}
  if(action==='radar-open-saved'){const item=globalAssets().find(x=>x.id===e.dataset.id);if(!item)throw Error('收藏记录不存在');route={view:'aesthetic'};render();aestheticDialog(item);return;}
  if(action==='radar-topic'){const item=Radar.CASES.find(x=>x.id===e.dataset.id);if(!item)throw Error('案例不存在');const record=radarStore(item,'case');radarRecord('topic',item);radarAttachCover(record&&record.id,item).catch(()=>null);const topic=Radar.caseToTopic(item,C.topic,scope);db.topics.push(topic);save();route={view:'topic',id:topic.id,tab:scope==='personal'?'idea':'direction'};render();notify('已建立新选题；只带入可迁移的方法，完整汇报仍需你确认后生成。');return;}
}
document.addEventListener('input',event=>{if(!event.target.hasAttribute('data-radar-search'))return;radarQuery.search=event.target.value;const pos=event.target.selectionStart;render();$('[data-radar-search]')?.focus();$('[data-radar-search]')?.setSelectionRange(pos,pos);});
