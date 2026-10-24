/* 「开始」= 一条片的全貌，一页到底，不翻页。
   从上到下就是导演脑子的顺序：一句话 → 三个画面 → 场地能不能拍 → 代价 → 拿去讲。
   素材与依据折叠在最后；谁都能直接改，改完自动存。 */

function wizardState(t){
  if(!t.wizard||typeof t.wizard!=='object')t.wizard={};
  const w=t.wizard;
  for(const k of ['fact','history','venue'])if(typeof w[k]!=='string')w[k]='';
  if(!w.fact&&typeof t.idea==='string'&&t.idea.trim())w.fact=t.idea.trim();
  return w;
}

/* 三句话 → 出发点素材（只替换向导写的，手工加的不动） */
function wizardSyncMaterials(t){
  const w=wizardState(t),u=originUnit(t);
  u.materials=(u.materials||[]).filter(m=>m.source!=='向导');
  if(w.fact.trim())globalThis.StudioOrigin.addMaterial(u,'fact',w.fact.trim(),'向导');
  if(w.history.trim())globalThis.StudioOrigin.addMaterial(u,'history',w.history.trim(),'向导');
  if(w.venue.trim())globalThis.StudioOrigin.addMaterial(u,'venue',w.venue.trim(),'向导');
  return u;
}

/* 一眼看出还缺什么：状态条 + 跳到那一段 */
function wizardStatus(t){
  const u=originUnit(t),w=CR.ensure(t),f=CR.fields(t),labels=CR.labels(t);
  const dirNow=!!(CR.directionCurrent&&CR.directionCurrent(t)),visNow=!!(CR.visualCurrent&&CR.visualCurrent(t));
  const scriptDone=labels.filter(([k])=>String(f[k]||'').trim()).length;
  const items=[
    {id:'wz-line',label:'一句话',ok:!!u.proposition,note:u.proposition?'':'先写这一句'},
    {id:'wz-frames',label:'三个画面',ok:(u.frames||[]).length===3,note:(u.frames||[]).length+'/3'},
    {id:'wz-script',label:'汇报脚本',ok:scriptDone===labels.length,note:scriptDone+'/'+labels.length+' 段'},
    {id:'wz-report',label:'要拍板的事',ok:String((t.report&&t.report.decisions)||'').trim().length>0,note:'写一行就行'},
    {id:'wz-report',label:'确认版',ok:dirNow&&visNow,note:dirNow?(visNow?'已定稿':'方向已确认 · 缺关键视觉'):'点④的「确认这一版」'}
  ];
  const done=items.filter(x=>x.ok).length;
  return {items,done,html:`<div class="actions">${items.map(x=>`<a class="wizard-chip ${x.ok?'ok':''}" href="#${x.id}">${x.ok?'✓':'○'} ${esc(x.label)}<small>${esc(x.note)}</small></a>`).join('')}<a class="wizard-chip" href="#wz-cost">➕ 代价（可选）</a><a class="wizard-chip" href="#wz-extra">➕ 场景与机位（可选）</a></div>
    <div class="actions">${btn(done===items.length?'导出老板决策版 PPT（不花钱）':'导出（还能导，见最后一段）','creative-wizard-export',`data-id="${t.id}"`,done===items.length)}${btn('体检一次（规则免费）','creative-wizard-check',`data-id="${t.id}"`)}</div>`};
}
function wizardStatusHTML(t){return `<section class="panel wizard-status" id="wz-status-live">${wizardStatus(t).html}</section>`;}

/* ① 一句话 */
function wizardLineBlock(t){
  const u=originUnit(t),path=creativePath(t)+'.origin',w=CR.ensure(t),side=u.tension||{};
  const directions=(w.directions||[]).filter(d=>d.id!==undefined);
  return `<section class="panel" id="wz-line"><h2>① 一句话：这条片在讲什么</h2>
    <p class="muted">一句能拍出来的话。写下之后，下面的三个画面和汇报脚本都由它长出来。</p>
    <div class="formgrid">${originLine('主张（30 字内）',`${path}.proposition`,u.proposition||'',true)}</div>
    <div class="actions">${btn(u.proposition?'重新生成一句话与三个画面（1 次文字调用）':'生成一句话与三个画面（1 次文字调用）','creative-wizard-generate',`data-id="${t.id}"`,true)}${u.proposition?btn('再给我 3 个方向挑（1 次文字调用）','creative-wizard-propose',`data-id="${t.id}"`):''}</div>
    <p class="muted">${u.proposition?'不满意就直接改上面的字；改字不花钱。想换思路再点右边。':'它读的是最下面「素材与依据」里那三句话；想先看几个方向挑一个，去「1 创意方向」。'}</p>
    ${directions.length?`<div class="creative-directions">${directions.slice(-3).map(d=>`<article class="panel ${d.id===w.selectedId?'chosen':''}"><small>${d.id===w.selectedId?'当前选择':'候选方向'}</small><h3>${esc(d.title)}</h3><p>${esc(d.premise)}</p><p class="muted">取舍：${esc(d.tradeoff)}</p>${btn('采用这个方向','creative-choose',`data-id="${t.id}" data-choice="${d.id}"`)}</article>`).join('')}</div>`:''}
    ${u.proposition?`<div class="formgrid">
      ${originLine('张力这一侧（主张或需求）',`${path}.tension.sideA`,side.sideA||'')}
      ${originLine('张力另一侧（主张或需求）',`${path}.tension.sideB`,side.sideB||'')}
      ${originField('为什么两侧同时成立',`${path}.tension.whyBoth`,side.whyBoth||'')}
      ${originLine('退路（砍到什么程度还成立）',`${path}.fallback`,u.fallback||'',true)}
    </div>
    <details><summary>反方 ${(u.objections||[]).length} 条 · 老板会怎么问，我怎么答</summary>
      ${(u.objections||[]).map((o,i)=>`<div class="formgrid">${originLine('老板会问',`${path}.objections.${i}.question`,o.question||'')}${originLine('怎么回应',`${path}.objections.${i}.response`,o.response||'')}</div>`).join('')}
    </details>`:''}</section>`;
}

/* ② 三个画面 —— 三列并排，各自能改 */
function wizardFramesBlock(t){
  const u=originUnit(t),path=creativePath(t)+'.origin',frames=u.frames||[];
  if(!frames.length)return `<section class="panel" id="wz-frames"><h2>② 三个画面</h2><p class="muted">先在①写出主张，这里会出现建立／推进／落点三个画面。</p></section>`;
  const col=(f,i)=>`<div class="wizard-frame"><div class="wizard-frame-head"><span class="badge">${esc(f.stage||'待标')}</span><strong>${esc(f.name||'画面'+(i+1))}</strong><small>${esc(f.seconds||8)} 秒</small></div>
    ${originLine('场地与约数尺寸',`${path}.frames.${i}.venue`,f.venue||'')}
    ${originLine('机位与景别',`${path}.frames.${i}.camera`,f.camera||'')}
    ${originLine('光',`${path}.frames.${i}.light`,f.light||'')}
    ${originLine('人物与人数',`${path}.frames.${i}.people`,f.people||'')}
    ${originLine('道具（顿号分隔）',`${path}.frames.${i}.propsText`,(f.props||[]).join('、'))}
    ${originStage('阶段',`${path}.frames.${i}.stage`,f.stage||'')}
    ${btn('出这个画面的参考图（1 次图片调用）','creative-venue-image',`data-id="${t.id}" data-index="${i}"`)}
    ${(t.venueShots||[])[i]&&globalThis.StudioCore.selected(t.venueShots[i])?`<a class="button" href="${mediaURL(globalThis.StudioCore.selected(t.venueShots[i]))}" target="_blank" rel="noopener">打开参考图 ↗</a>`:''}
  </div>`;
  return `<section class="panel" id="wz-frames"><h2>② 三个画面：建立 → 推进 → 落点</h2>
    <p class="muted">每个画面都要能直接发给摄影。至少一个要有人物动作；参考图只是预演，先看数字。</p>
    <div class="wizard-frame-grid">${frames.map(col).join('')}</div></section>`;
}

/* ③ 场地：三个画面共用一个场地，就地算机位 */
function wizardVenueBlock(t){
  const v=venueOf(t),path=creativePath(t)+'.venue',frames=venueFrames(t);
  const result=globalThis.StudioVenue.plan(v,frames);
  if(!frames.length)return `<section class="panel" id="wz-venue"><h3>场景与机位：这三个画面能不能拍</h3>
    <p class="muted">先在①写出主张并生成三个画面，这里会自动算出每个画面的机位、焦段与光位；尺寸现在填也可以。</p>
    <div class="formgrid">
      ${venueLine('净宽（米）',`${path}.width`,v.width||'')}${venueLine('进深（米）',`${path}.depth`,v.depth||'')}
      ${venueLine('层高（米）',`${path}.height`,v.height||'')}${venueSelect('窗户在哪面墙',`${path}.windowWall`,v.windowWall||'north',VENUE_WALLS)}
    </div>
    <div class="actions">${btn('按常见住宅填一版','creative-venue-default',`data-id="${t.id}"`)}</div></section>`;
  const rows=result.ready?result.shots.map((s,i)=>`<div class="wizard-line"><span>画面 ${i+1} · ${esc(s.framingLabel)}</span><span>${s.focal}mm · 退 ${s.distance} 米</span><span class="${s.fits?'':'missing'}">${s.fits?'可拍':'需调整'}</span></div>`).join(''):'';
  const warn=result.ready?result.shots.flatMap((s,i)=>s.warnings.map(x=>`<p class="missing">画面 ${i+1}：${esc(x)}</p>`)).join(''):'';
  const photo=globalThis.StudioCore.selected(t.venuePhoto);
  return `<section class="panel" id="wz-venue"><h3>场景与机位：这三个画面能不能拍</h3>
    <p class="muted">填大概尺寸就够。系统按机位退不退得开、人数放不放得下、光从哪来，直接给结论。</p>
    <div class="formgrid">
      ${venueLine('净宽（米）',`${path}.width`,v.width||'')}${venueLine('进深（米）',`${path}.depth`,v.depth||'')}
      ${venueLine('层高（米）',`${path}.height`,v.height||'')}${venueSelect('窗户在哪面墙',`${path}.windowWall`,v.windowWall||'north',VENUE_WALLS)}
    </div>
    <div class="actions">${btn('按常见住宅填一版','creative-venue-default',`data-id="${t.id}"`)}${upload(photo?'替换场地照片':'上传场地照片（出参考图用）','creative-venue-photo',`data-id="${t.id}"`)}</div>
    ${result.ready?`${rows}${result.conflicts.map(x=>`<p class="missing">${esc(x)}</p>`).join('')}${warn}
      <details><summary>俯视机位图（可直接发摄影）</summary>${globalThis.StudioVenue.diagramSVG(v,result.shots)}</details>`
      :`<p class="missing">还缺：${esc(result.errors.join('、'))}</p>`}</section>`;
}


/* ③ 汇报脚本：AI 起草 → 就地改 → 采用；这是拿去讲的话 */
function wizardScriptBlock(t){
  const path=creativePath(t),w=CR.ensure(t),f=CR.fields(t),labels=CR.labels(t);
  const empty=labels.filter(([k])=>!String(f[k]||'').trim()).length;
  const hidden=`<div hidden>${labels.map(([k])=>`<input type="checkbox" name="creative-section" value="${k}" checked>`).join('')}</div>`;
  const proposal=w.proposal?`<section class="panel creative-proposal"><h3>待确认的修改（先对比，再采用）</h3><p>${esc(w.proposal.reason||'')}</p>
    ${Object.entries(w.proposal.changes||{}).map(([k,v])=>`<h4>${esc((labels.find(x=>x[0]===k)||[])[1]||k)}</h4><div class="creative-comparison"><div><small>当前稿</small><p class="preview-copy">${esc(f[k]||'空白')}</p></div><div><small>建议稿</small><p class="preview-copy">${esc(v)}</p></div></div>`).join('')}
    <div class="actions">${btn('采用这些修改','creative-accept',`data-id="${t.id}"`,true)}${btn('保留原稿，取消建议','creative-discard',`data-id="${t.id}"`)}</div></section>`:'';
  return `<section class="panel" id="wz-script"><h2>③ 汇报脚本：拿去讲的话</h2>
    <p class="muted">${empty?`还有 ${empty} 段是空的。`:'七段都写好了。'}点生成会按①那句话起草（只补空白，不动你写过的）；不满意就先在下面写一句怎么改，再让它改。</p>
    ${hidden}
    <div class="actions">${btn(empty?`生成汇报脚本（${empty} 段空白 · 1 次文字调用）`:'重新生成空白段（1 次文字调用）','creative-wizard-script',`data-id="${t.id}"`,empty>0)}${btn('按下面的反馈再改（1 次文字调用）','creative-wizard-revise',`data-id="${t.id}"`)}</div>
    ${originField('这一轮想怎么改（自然语言，一句话也行）',path+'.creative.feedback',w.feedback||'')}
    ${proposal}
    <div class="formgrid">${labels.map(([k,l])=>originField(l,path+(t.quick?'.quick.fields.':'.fields.')+k,f[k]||'')).join('')}</div>
  </section>`;
}

/* ➕ 可选：场景与机位分镜（先不做也能汇报） */
function wizardOptionalBlock(t){
  return `<details class="panel" id="wz-extra"><summary>➕ 加场景与机位分镜（可选 · 现在不做也可以汇报）</summary>
    <p class="muted">想看"这三个画面在这个场地能不能拍、机位退多远、光从哪来"时再展开。填大概尺寸就够。</p>
    ${wizardVenueBlock(t)}</details>`;
}

/* ➕ 可选：代价（第一次汇报通常用不上） */
function wizardCostBlock(t){
  const u=originUnit(t),path=creativePath(t)+'.origin',cost=u.cost||{};
  const gaps=globalThis.StudioOrigin.costGaps(u);
  return `<details class="panel" id="wz-cost"><summary>➕ 代价与资源：几天、几个人、多少钱、能不能用（可选 · 第一次汇报可以先不填）</summary>
    <p class="muted">要谈落地、要排期、要预算的时候再回来填。填了导出时会一起带上；不填不影响汇报。</p>
    ${gaps.length?`<p class="muted">现在空着的：${esc(gaps.join('、'))}。缺「资源限制」素材时，给一个档位假设也比空着好。</p>`:''}
    <div class="formgrid">
      ${originLine('天数',`${path}.cost.days`,cost.days||'')}${originLine('人数',`${path}.cost.crew`,cost.crew||'')}
      ${originLine('预算档',`${path}.cost.budget`,cost.budget||'')}${originLine('授权',`${path}.cost.rights`,cost.rights||'')}
    </div>
    ${originField('假设风险（假设不成立时的代价）',`${path}.assumptionRisk`,u.assumptionRisk||'')}</details>`;
}

/* ⑤ 拿去讲 */
function wizardReportBlock(t){
  const path=creativePath(t),report=StudioPpt.ensureReport(t),gate=wizardGate(t);
  const items=String(report.decisions||'').split('\n').map(x=>x.trim()).filter(Boolean);
  return `<section class="panel" id="wz-report"><h2>④ 拿去讲：只要老板拍板的事</h2>
    <p class="${gate.bad?'missing':'muted'}">${esc(gate.text)}</p>
    ${gate.list.length?`<p class="muted">${gate.list.map(esc).join('；')}</p>`:''}
    ${gate.fix?`<p class="muted">${esc(gate.fix)}</p>`:''}
    ${gate.action?`<div class="actions">${btn(gate.action.label,'creative-tab',`data-id="${t.id}" data-tab="${gate.action.tab}"`)}</div>`:''}
    <div class="formgrid">
      ${field('今天要老板拍板的事（一行一条，1–8 条）',path+'.report.decisions',report.decisions||'',true)}
      ${field('还没核实的信息（一行一条）',path+'.report.pending',report.pending||'',true)}
    </div>
    <p class="muted">目前 ${items.length} 条决策${items.length>8?'（超过 8 条，只留真正需要拍板的）':'（1–8 条最合适）'}。</p>
    <div class="actions">${btn('确认这一版（不花钱）','creative-wizard-approve',`data-id="${t.id}"`)}${btn('预览汇报（不花钱）','creative-report-preview',`data-id="${t.id}"`)}${btn('导出老板决策版 PPT（不花钱）','creative-wizard-export',`data-id="${t.id}"`,true)}${btn('看体检详情','creative-tab',`data-id="${t.id}" data-tab="origin"`)}</div>
    <p class="muted">确认之后导出的才算"确认版"；没确认就自动标成「方向讨论稿」，这是为了保护你——没定稿的东西不会以定稿的样子流出去。</p>
    ${t.error?`<p class="missing">${esc(t.error)}</p>`:''}</section>`;
}

/* 折叠：素材与依据 */
function wizardSourceBlock(t){
  const w=wizardState(t),u=originUnit(t),path=creativePath(t);
  const count=(u.materials||[]).length;
  return `<details class="panel" id="wz-source" ${u.proposition?'':'open'}><summary>素材与依据 · ${count} 条（生成时读这些，可随时补）</summary>
    <p class="muted">三句话是最省事的入口；要更细就到「0 出发点」按六类素材补。</p>
    <div class="formgrid">
      ${field('① 老板／业务要求（必填）',path+'.wizard.fact',w.fact,true)}
      ${field('② 上次为什么被否（选了很值钱）',path+'.wizard.history',w.history,true)}
      ${field('③ 场地大概什么样（大概值就够）',path+'.wizard.venue',w.venue,true)}
    </div>
    <div class="actions">${btn('用这三句生成／更新一句话与画面（1 次文字调用）','creative-wizard-generate',`data-id="${t.id}"`,true)}</div>
    ${originMaterialsHTML(t,u)}
    ${originGapsHTML(u)}</details>`;
}

function creativeWizardPanel(t){
  return wizardStatusHTML(t)+wizardLineBlock(t)+wizardFramesBlock(t)+wizardScriptBlock(t)+wizardReportBlock(t)+wizardCostBlock(t)+wizardOptionalBlock(t)+wizardSourceBlock(t);
}

function wizardGate(t){
  const gate=originGate(t),r=globalThis.StudioOrigin.readiness(originUnit(t));
  const dirOk=!!(CR.directionCurrent&&CR.directionCurrent(t)),visOk=!!(CR.visualCurrent&&CR.visualCurrent(t));
  if(gate.blocked)return {bad:true,dirOk,visOk,text:`只能导出「方向讨论稿」：体检还有 ${gate.count} 项必须改。`,list:gate.reasons,
    fix:'改完再体检一次；或者就按讨论稿去讲。',action:null};
  if(!dirOk)return {bad:false,dirOk,visOk,text:'能导出，但稿子会标成「方向讨论稿」：还没有确认这一版。',list:[],
    fix:'点下面的「确认这一版」就够了，不花钱。',action:null};
  if(!visOk)return {bad:false,dirOk,visOk,text:'方向已确认。稿子仍会标「方向讨论稿」，因为关键视觉还没定。',list:[],
    fix:'想让稿子算完整版，去②定一张关键画面（1 次图片调用）；只要方向汇报的话，这样导出就够。',
    action:{label:'去②关键视觉（1 次图片调用）',tab:'visual'}};
  if(r.level!=='可汇报')return {bad:false,dirOk,visOk,text:'可以导出完整版；只是素材还差几类，补齐会更稳。',list:r.missing.map(k=>k),fix:'不影响汇报。',action:null};
  return {bad:false,dirOk,visOk,text:'可以导出完整版：一句话、三个画面、代价都齐了，方向与关键视觉也确认过。',list:[],fix:'',action:null};
}

async function creativeWizardAction(action,e,t){
  const w=wizardState(t);
  if(action==='creative-wizard-propose'){
    wizardSyncMaterials(t);
    if(!String(t.idea||'').trim())t.idea=w.fact||'';
    await creativeAction('creative-explore',{dataset:{id:t.id}},t);
    save();render();return;
  }
  if(action==='creative-wizard-generate'){
    if(!w.fact.trim()&&!originUnit(t).proposition)throw Error('先在最下面「素材与依据」里写一句老板／业务要求，再生成');
    wizardSyncMaterials(t);
    await creativeOriginAction('creative-origin-generate',e,t);
    save();render();return;
  }
  if(action==='creative-wizard-approve'){
    const u=originUnit(t);
    if(!u.proposition)throw Error('先写出①那一句话，再确认');
    /* ① 那一句话就是汇报正文的主干；已有内容不覆盖 */
    const f=CR.fields(t);
    if(!String(f.outline||'').trim())f.outline=u.proposition;
    if(!String(f.meaning||'').trim())f.meaning=[u.tension&&u.tension.whyBoth,(u.objections||[]).map(o=>`${o.question}→${o.response}`).join('；')].filter(Boolean).join('\n');
    if(!String(f.description||'').trim())f.description=(u.frames||[]).map((x,i)=>`${i+1} ${x.stage||''} ${x.name||''}：${x.camera||''}｜${x.light||''}｜${x.people||''}`).join('\n');
    await creativeAction('creative-approve',{dataset:{id:t.id}},t);
    const visual=CR.visual(t);
    if(globalThis.StudioCore.selected(visual))await creativeAction('creative-visual-approve',{dataset:{id:t.id}},t);
    route.creativeTab='start';   /* 一页流程：确认完留在原地 */
    notify('已确认这一版：方向'+(globalThis.StudioCore.selected(visual)?'与关键视觉':'')+'已定稿');
    save();render();return;
  }
  if(action==='creative-wizard-script'||action==='creative-wizard-revise'){
    const u=originUnit(t);
    if(!u.proposition)throw Error('先在①写出那一句话，脚本才有依据');
    if(!String(t.idea||'').trim())t.idea=u.proposition;
    if(action==='creative-wizard-revise'&&!String(CR.ensure(t).feedback||'').trim())throw Error('先写一句这一轮想怎么改，再点它');
    await creativeAction(action==='creative-wizard-script'?'creative-fill':'creative-revise',{dataset:{id:t.id}},t);
    route.creativeTab='start';save();render();return;
  }
  if(action==='creative-wizard-check'){await creativeOriginAction('creative-origin-check',e,t);save();render();return;}
  if(action==='creative-wizard-export'){
    if(!String((t.report&&t.report.decisions)||'').trim())throw Error('先在⑤写一条要老板拍板的事，再导出');
    showReportOptions(creativeReportItem(t),t.quick?'topic':'project','decision');return;
  }
  save();render();
}

/* 改字之后就刷新状态条：只替换那一个块，不碰正在输入的框 */
if(typeof document!=='undefined'&&document.addEventListener){
  let timer=null;
  document.addEventListener('input',event=>{
    const el=event.target;
    if(!el||!el.dataset||!el.dataset.field)return;
    if(!el.closest||!el.closest('.creative-layout'))return;
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>{
      const box=document.getElementById('wz-status-live');
      const t=typeof currentTopic==='function'?currentTopic():null;
      if(!box||!t)return;
      try{box.innerHTML=wizardStatus(t).html;}catch(error){}
    },400);
  });
}
