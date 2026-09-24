const SUPPLY_SCORE_LABELS={audience:'观众吸引',business:'业务匹配',visual:'视觉表现',feasibility:'拍摄可行',novelty:'新鲜程度'};
const SUPPLY_STATUSES={candidate:'待判断',primary:'主推',backup:'备选',rejected:'已淘汰'};
let supplyFilter='active';

function supplyBrief(){
  const defaults={theme:'',audience:'',facts:'',needs:'',type:'单条内容',platform:'多平台',goal:'建立认知',projectId:''};
  db.inspirationBrief={...defaults,...(db.inspirationBrief||{})};
  return db.inspirationBrief;
}
function supplyScores(value={}){
  return Object.fromEntries(Object.keys(SUPPLY_SCORE_LABELS).map(key=>[key,Math.max(1,Math.min(5,Number(value[key])||3))]));
}
function supplyScore(item){const values=Object.values(supplyScores(item.scores));return Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*20);}
function supplyUpgrade(item){
  if(!Object.hasOwn(SUPPLY_STATUSES,item.status))item.status='candidate';
  item.scores=supplyScores(item.scores);
  if(typeof item.oneLine!=='string'||!item.oneLine.trim())item.oneLine=item.hook||item.title;
  if(typeof item.scoreReason!=='string')item.scoreReason='待结合实际任务复核评分。';
  return item;
}
function supplyProjectContext(brief){
  const project=db.projects.find(project=>project.id===brief.projectId);
  return project?{title:project.title,date:project.date,idea:project.idea,fields:project.fields,plannedStories:C.sessionTarget(project),existingStories:(project.topicIds||[]).map(id=>db.topics.find(topic=>topic.id===id)?.title).filter(Boolean)}:null;
}
function supplyFavoriteContext(){
  const favorites=globalAssets().filter(item=>item.favorite).slice(0,8);
  return {items:favorites.map(item=>({title:item.name,category:item.category,tags:item.tags,notes:item.notes,linkNotRead:!!item.link})),imageIds:favorites.flatMap(item=>(item.files||[]).filter(file=>file.kind==='image'&&file.localId).map(file=>file.localId)).slice(0,4)};
}
function supplyStatusButton(item,status,label){return btn(label,'supply-status',`data-id="${item.id}" data-status="${status}" class="${item.status===status?'active':''}"`);}
function supplyScoreHTML(item){return `<div class="supply-scores" aria-label="创意评分">${Object.entries(SUPPLY_SCORE_LABELS).map(([key,label])=>`<span><small>${label}</small><strong>${item.scores[key]}/5</strong></span>`).join('')}</div>`;}
function supplyDevelopmentHTML(item){const value=item.development;if(!value)return'';return `<section class="supply-development"><div class="section-head compact"><div><small class="eyebrow">DEVELOPED DIRECTION</small><h4>深化结果</h4></div>${btn('重新深化','supply-deepen',`data-id="${item.id}"`)}</div><p><strong>前三秒开场：</strong>${esc(value.opening)}</p><p><strong>故事推进：</strong>${esc(value.arc)}</p><p><strong>关键画面：</strong>${esc(value.keyVisuals)}</p><p><strong>汇报话术：</strong>${esc(value.pitch)}</p><p><strong>落地方式：</strong>${esc(value.execution)}</p><p><strong>仍需确认：</strong>${esc(value.risks)}</p></section>`;}
function supplyCard(item){
  const score=supplyScore(item),status=SUPPLY_STATUSES[item.status];
  return `<article class="card supply-card supply-${item.status}"><div class="supply-card-head"><span class="badge">${esc(item.angle)} · ${status}</span><strong class="supply-total">${score}<small>/100</small></strong></div><h3>${esc(item.title)}</h3><p class="supply-one-line">${esc(item.oneLine)}</p><div class="supply-visual"><small>CORE VISUAL · 核心画面</small><p>${esc(item.visual)}</p></div>${supplyScoreHTML(item)}<p class="supply-score-reason">${esc(item.scoreReason)}</p><details class="supply-detail"><summary>查看洞察、业务作用与风险</summary><p><strong>内容切入：</strong>${esc(item.hook)}</p><p><strong>观众洞察：</strong>${esc(item.insight)}</p><p><strong>内容作用：</strong>${esc(item.purpose)}</p><p><strong>待核实：</strong>${esc(item.risks)}</p></details>${supplyDevelopmentHTML(item)}<div class="actions supply-decision-actions">${supplyStatusButton(item,'primary','设为主推')}${supplyStatusButton(item,'backup','设为备选')}${supplyStatusButton(item,'rejected','淘汰')}</div><div class="actions supply-card-actions">${btn(item.saved?'★ 已收藏':'☆ 收藏','supply-save',`data-id="${item.id}"`)}${item.development?'':btn('AI深化','supply-deepen',`data-id="${item.id}"`)}${btn('转入选题库','supply-topic',`data-id="${item.id}"`,true)}</div></article>`;
}
function supplyMatches(item){if(supplyFilter==='active')return item.status!=='rejected';if(supplyFilter==='saved')return item.saved;if(supplyFilter==='all')return true;return item.status===supplyFilter;}
function renderInspiration(){
  const brief=supplyBrief(),items=(db.inspirations||[]).map(supplyUpgrade),visible=items.filter(supplyMatches).slice().reverse(),counts=Object.fromEntries(Object.keys(SUPPLY_STATUSES).map(status=>[status,items.filter(item=>item.status===status).length]));
  const projects=db.projects.filter(project=>!project.archivedAt&&!project.cancelledAt),project=supplyProjectContext(brief),source=supplyFavoriteContext();
  return hero('CREATIVE DECISION DESK','My·工作 · 创意补给','把业务任务转成可比较、可深化、可落地的候选方向；先做判断，再写脚本。',btn('生成一批新方向','supply-generate','',true))+
   `<div class="rule"><strong>按需生成，不会后台自动扣费。</strong> 每批6个候选方向，不等于6条完成脚本；系统不会冒充实时热点监测，具体事实仍需核实。</div>
   <section class="panel supply-brief"><div class="section-head"><div><small class="eyebrow">01 · TASK BRIEF</small><h2>这次要解决什么</h2></div><span class="badge">${source.items.length}条收藏参考 · ${source.imageIds.length}张图可参与判断</span></div><div class="formgrid"><label>任务类型<select data-field="inspirationBrief.type">${['单条内容','整体专场','直播预热','人物内容','产品机制','视觉实验'].map(value=>`<option ${brief.type===value?'selected':''}>${value}</option>`).join('')}</select></label><label>发布场景<select data-field="inspirationBrief.platform">${['多平台','抖音','小红书','视频号','直播大屏','线下活动'].map(value=>`<option ${brief.platform===value?'selected':''}>${value}</option>`).join('')}</select></label><label>希望达成的结果<select data-field="inspirationBrief.goal">${['建立认知','制造期待','解释产品','强化人物','促进转化','建立情绪连接'].map(value=>`<option ${brief.goal===value?'selected':''}>${value}</option>`).join('')}</select></label><label>关联项目<select data-field="inspirationBrief.projectId"><option value="">暂不关联项目</option>${projects.map(value=>`<option value="${value.id}" ${brief.projectId===value.id?'selected':''}>${esc(value.title)}</option>`).join('')}</select></label>${field('本轮主题、业务任务或节点','inspirationBrief.theme',brief.theme,true)}${field('目标观众与希望改变的感受','inspirationBrief.audience',brief.audience,true)}${field('已核实的产品／人物／品牌资料','inspirationBrief.facts',brief.facts,true)}${field('想突破什么、避免什么、实际拍摄条件','inspirationBrief.needs',brief.needs,true)}</div>${project?`<p class="muted">本轮会结合项目《${esc(project.title)}》的整体方向和已有内容，避免重复。</p>`:''}</section>
   <section class="supply-summary"><span><strong>${items.length}</strong>全部方向</span><span><strong>${counts.primary}</strong>主推</span><span><strong>${counts.backup}</strong>备选</span><span><strong>${items.filter(item=>item.saved).length}</strong>收藏</span></section>
   <div class="section-head supply-result-head"><div><small class="eyebrow">02 · DECIDE</small><h2>候选创意</h2><p class="muted">评分用于比较，不替代你的判断；先定主推和备选，再深化或转入选题。</p></div></div><nav class="supply-filters" aria-label="筛选创意方向">${[['active','正在判断'],['primary','主推'],['backup','备选'],['saved','收藏'],['rejected','已淘汰'],['all','全部']].map(([value,label])=>btn(`${label} · ${value==='active'?items.length-counts.rejected:value==='saved'?items.filter(item=>item.saved).length:value==='all'?items.length:counts[value]}`,'supply-filter',`data-filter="${value}" class="${supplyFilter===value?'active':''}"`)).join('')}</nav>
   <div class="grid supply-grid">${visible.map(supplyCard).join('')||empty('这里还没有匹配的方向',items.length?'切换筛选，或把候选方向重新标记为主推／备选。':'填写任务和真实资料，再生成第一批候选方向。')}</div>`;
}
async function supplyAction(action,e){
  if(scope==='personal')throw Error('创意补给属于My·工作空间；个人创作请使用选题与灵感');
  if(action==='supply-filter'){supplyFilter=e.dataset.filter||'active';render();return;}
  if(action==='supply-generate'){
    const brief=supplyBrief();if(!brief.theme.trim())throw Error('请先填写本轮主题或任务');
    const source=supplyFavoriteContext(),project=supplyProjectContext(brief),creator=profileContext();
    await withJob('生成并评估内容方向',1,async()=>{
      const raw=await chat(`你是内容总监的创意与决策搭档。依据任务、已授权的工作资料、关联项目和收藏参考，提供6个彼此不同且能推进的内容方向。不要全部套用宏大造势；可以探索真实工作瞬间、人物关系、产品使用洞察、反差叙事、情绪连接或形式实验。只在已有依据时使用具体性能、人物经历、数据和热点，其他必须写入待核实。参考链接若没有内容只视为书签；未联网时不声称当前热门。\n每个方向必须先给一个能被快速判断的一句话概念和核心画面，再解释观众与业务作用、执行风险。对观众吸引、业务匹配、视觉表现、拍摄可行、新鲜程度分别做1–5分保守评分；评分理由必须具体，不能全部满分。\n任务：${JSON.stringify(brief)}\n关联项目：${JSON.stringify(project)}\n已授权工作资料：${JSON.stringify(creator)}\n收藏参考说明：${JSON.stringify(source.items)}\n避免重复已有标题：${JSON.stringify((db.inspirations||[]).slice(-40).map(item=>item.title))}\n只返回JSON：{"ideas":[6个对象，每个{"title":"标题","angle":"方向类型","oneLine":"一句话创意概念","hook":"有具体悬念或情境的切入","insight":"观众洞察","visual":"第一眼能想象的核心画面","purpose":"内容和业务作用","risks":"事实与执行待核实","scores":{"audience":1到5整数,"business":1到5整数,"visual":1到5整数,"feasibility":1到5整数,"novelty":1到5整数},"scoreReason":"评分依据"}}]}`,source.imageIds);
      const required=['title','angle','hook','insight','visual','purpose','risks'];
      if(!Array.isArray(raw.ideas)||raw.ideas.length!==6||raw.ideas.some(item=>required.some(key=>!C.text(item[key])))||new Set(raw.ideas.map(item=>item.title)).size!==6)throw Error('AI返回方向不完整，原有创意已保留');
      const created=raw.ideas.map(item=>supplyUpgrade({...Object.fromEntries(required.map(key=>[key,item[key]])),oneLine:C.text(item.oneLine)?item.oneLine:item.hook,scoreReason:C.text(item.scoreReason)?item.scoreReason:'待结合实际任务复核评分。',scores:supplyScores(item.scores),id:C.uid(),saved:false,status:'candidate',time:new Date().toISOString(),brief:C.clone(brief)}));
      db.inspirations.push(...created);save();progress('6个候选方向已生成并评分');
    });return;
  }
  const item=db.inspirations.find(value=>value.id===e.dataset.id);if(!item)throw Error('创意不存在');supplyUpgrade(item);
  if(action==='supply-save'){item.saved=!item.saved;save();render();return;}
  if(action==='supply-status'){
    const status=e.dataset.status;if(!Object.hasOwn(SUPPLY_STATUSES,status))throw Error('创意状态无效');
    if(status==='primary')for(const other of db.inspirations)if(other.id!==item.id&&other.status==='primary')other.status='backup';
    item.status=item.status===status?'candidate':status;if(['primary','backup'].includes(item.status))item.saved=true;save();render();return;
  }
  if(action==='supply-deepen'){
    const source=supplyFavoriteContext();
    await withJob('深化创意方向',1,async()=>{
      const raw=await chat(`你是内容总监的创意搭档。把下面这个候选方向推进到可以拿去做方向汇报、但还不是完整脚本的程度。必须尊重已核实事实和拍摄条件，不补造品牌数据、人物经历或实时热点。\n任务：${JSON.stringify(item.brief||supplyBrief())}\n候选方向：${JSON.stringify({title:item.title,angle:item.angle,oneLine:item.oneLine,hook:item.hook,insight:item.insight,visual:item.visual,purpose:item.purpose,risks:item.risks})}\n只返回JSON：{"opening":"前三秒具体发生什么","arc":"用起承转合简述故事推进","keyVisuals":"3个关键画面，写清人物、动作、场景和构图","pitch":"60秒内可向老板说明的推荐话术","execution":"最小可行拍摄方式，包括场景、人物和资源","risks":"仍需确认的事实与执行条件"}`,source.imageIds);
      const keys=['opening','arc','keyVisuals','pitch','execution','risks'];if(keys.some(key=>!C.text(raw[key])))throw Error('AI深化结果不完整，原方向已保留');item.development=Object.fromEntries(keys.map(key=>[key,raw[key]]));item.developedAt=new Date().toISOString();save();progress('方向已深化，可以继续判断或转入选题');
    });return;
  }
  if(action==='supply-topic'){
    const topic=C.topic(item.title),development=item.development;
    topic.idea=[`一句话概念：${item.oneLine}`,`切入：${item.hook}`,`洞察：${item.insight}`,`核心画面：${item.visual}`,`内容作用：${item.purpose}`,development?`前三秒开场：${development.opening}`:'',development?`故事推进：${development.arc}`:'',development?`关键画面：${development.keyVisuals}`:'',`待核实：${development?.risks||item.risks}`].filter(Boolean).join('\n');
    topic.form=item.angle;topic.sourceInspiration=C.clone(item);topic.inspirationSource='AI创意补给 · 由内容总监筛选后转入';
    const project=db.projects.find(value=>value.id===(item.brief?.projectId||''));
    if(project&&(project.topicIds||[]).length<C.sessionTarget(project)){topic.projectId=project.id;project.topicIds.push(topic.id);}
    db.topics.push(topic);item.status=item.status==='candidate'?'backup':item.status;item.saved=true;item.transferredTopicId=topic.id;save();route={view:'topic',id:topic.id,tab:'quick'};render();
  }
}
