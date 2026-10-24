/* 出发点面板：素材 → 出发点 → 10页映射 → 骨架体检。数据存在 t.origin，随时可回看。 */
const ORIGIN_KINDS=globalThis.StudioOrigin.MATERIAL_KINDS;
const ORIGIN_LEVEL={block:'必须改',warn:'建议改',info:'提示'};

function originUnit(t){
  if(!t.origin||typeof t.origin!=='object')t.origin=globalThis.StudioOrigin.create(t.title||'',t.quick?'单条':'专场');
  const u=t.origin;
  for(const k of ['materials','objections','frames'])if(!Array.isArray(u[k]))u[k]=[];
  for(const k of ['title','proposition','fallback','assumptionRisk','notes','audience'])if(typeof u[k]!=='string')u[k]=k==='audience'?'老板':'';
  if(!u.cost||typeof u.cost!=='object')u.cost={days:'待确认',crew:'待确认',budget:'待确认',rights:'待确认'};
  for(const f of u.frames)if(typeof f.propsText!=='string')f.propsText=(f.props||[]).join('、');
  return u;
}

function originKindLabel(kind){const hit=ORIGIN_KINDS.find(([k])=>k===kind);return hit?hit[1]:kind;}
/* 单行内容用 input：全局 textarea 最小高 100px，是页面过长的主因 */
function originLine(label,path,value,wide=false){return `<label class="${wide?'wide':''}">${esc(label)}<input data-field="${esc(path)}" value="${esc(value??'')}"></label>`;}
function originField(label,path,value,wide=true){return `<label class="${wide?'wide':''}">${esc(label)}<textarea class="short" data-field="${esc(path)}">${esc(value??'')}</textarea></label>`;}
function originStamp(value){return String(value||'').slice(0,16).replace('T',' ');}
function originStage(label,path,value){return `<label>${esc(label)}<select data-field="${esc(path)}"><option value="">待标</option>${(globalThis.StudioOrigin.STAGES||[]).map(x=>`<option value="${esc(x)}" ${value===x?'selected':''}>${esc(x)}</option>`).join('')}</select></label>`;}

function originMaterialsHTML(t,u){
  const path=creativePath(t)+'.origin';
  const rows=u.materials.map((m,i)=>`<details><summary style="display:flex;justify-content:space-between;gap:10px;align-items:center"><span>m${i+1} · ${esc(originKindLabel(m.kind))} · ${esc((m.text||'').slice(0,30))}${(m.text||'').length>30?'…':''}</span><span style="flex:none">${btn('删除','creative-origin-remove',`data-id="${t.id}" data-index="${i}"`)}</span></summary>
    ${originField('素材内容',`${path}.materials.${i}.text`,m.text)}
    ${originLine('来源',`${path}.materials.${i}.source`,m.source||'')}</details>`).join('');
  return `<section class="panel"><h2>出发点素材 · ${u.materials.length} 条</h2>
    <p>素材决定创意质量。业务事实是硬门槛；场地只有大概尺寸也照写，系统会把它标成假设并要求写代价。</p>
    <div class="formgrid">
      <label>类型<select id="origin-kind">${ORIGIN_KINDS.map(([k,l])=>`<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></label>
      <label>来源<input id="origin-source" placeholder="例如：10月汇报纪要"></label>
    </div>
    <label>内容<input id="origin-text" placeholder="例如：上次同类创意被否，老板说太文艺"></label>
    <div class="actions">${btn('加入素材','creative-origin-add',`data-id="${t.id}"`,true)}</div>
    ${rows||'<p class="muted">还没有素材。先加业务事实和场地条件，其余可以慢慢补。</p>'}</section>`;
}

function originGapsHTML(u){
  const m=globalThis.StudioOrigin.materials(u);
  const chips=ORIGIN_KINDS.map(([k,l])=>m.missing.includes(k)?`<span class="badge bad">缺 ${esc(l)}</span>`:`<span class="badge">${esc(l)}</span>`).join(' ');
  return `<section class="panel"><h2>素材完整度</h2><p>${chips}</p>
    ${m.blocking.length?`<p class="missing">还差：${esc(m.blocking.join('、'))}。缺了它就不该谈出发点。</p>`:''}
    ${m.missing.includes('venue')?'<p class="muted">没有场地条件时必须在「假设风险」里写清代价。</p>':''}</section>`;
}

function originResultHTML(t,u){
  if(!u.proposition&&!u.tension)return '';
  const path=creativePath(t)+'.origin';
  const frameBlock=(f,i)=>`<details ${i===0?'open':''}><summary>画面 ${i+1} · ${esc(f.stage||'待标阶段')} · ${esc(f.name||'未命名')} · ${esc(f.seconds||'')}秒</summary>
    <div class="formgrid">
      ${originLine('画面名',`${path}.frames.${i}.name`,f.name||'')}
      ${originStage('阶段',`${path}.frames.${i}.stage`,f.stage||'')}
      ${originLine('预估秒数',`${path}.frames.${i}.seconds`,String(f.seconds||''))}
      ${originLine('场地与约数尺寸',`${path}.frames.${i}.venue`,f.venue||'',true)}
      ${originLine('机位与景别',`${path}.frames.${i}.camera`,f.camera||'')}
      ${originLine('光',`${path}.frames.${i}.light`,f.light||'')}
      ${originLine('人物与人数',`${path}.frames.${i}.people`,f.people||'')}
      ${originLine('道具（顿号分隔）',`${path}.frames.${i}.propsText`,(f.props||[]).join('、'))}
    </div></details>`;
  const obj=(o,i)=>`<details><summary>反方 ${i+1} · ${esc((o.question||'').slice(0,24))}${(o.question||'').length>24?'…':''}</summary>
    <div class="formgrid">${originField('质疑',`${path}.objections.${i}.question`,o.question||'')}${originField('回应',`${path}.objections.${i}.response`,o.response||'')}</div></details>`;
  return `<section class="panel"><h2>出发点</h2><div class="formgrid">
      ${originLine('张力 · 一侧',`${path}.tension.sideA`,u.tension?.sideA||'')}
      ${originLine('张力 · 另一侧',`${path}.tension.sideB`,u.tension?.sideB||'')}
      ${originField('为什么两者同时成立',`${path}.tension.whyBoth`,u.tension?.whyBoth||'')}
      ${originLine('主张（30字内）',`${path}.proposition`,u.proposition||'',true)}
      ${originField('退路（砍到什么程度还成立）',`${path}.fallback`,u.fallback||'')}
      ${originField('假设风险（假设不成立时的代价）',`${path}.assumptionRisk`,u.assumptionRisk||'')}
    </div>
    ${(u.objections||[]).map(obj).join('')}
    <div class="actions">${btn('记录沉淀（批／否／改）','creative-origin-sediment',`data-id="${t.id}"`)}${btn('清空重来','creative-origin-reset',`data-id="${t.id}"`)}</div></section>
    <section class="panel"><h2>关键画面 · ${(u.frames||[]).length}/3</h2><p>每个画面都要能直接发给摄影：场地、机位、光、人、道具、时长；三个阶段分别是建立、推进、落点，至少一个要有人物动作。</p>
    ${globalThis.StudioOrigin.stageGaps(u)?'<p class="muted">画面还没标阶段（建立／推进／落点）；重新生成会自动带上。</p>':''}${(u.frames||[]).map(frameBlock).join('')}</section>
    <section class="panel"><h2>代价</h2>${(()=>{const gaps=globalThis.StudioOrigin.costGaps(u);return gaps.length?`<p class="muted">还挂着待确认：${esc(gaps.join('、'))}。缺「资源限制」素材时，可以先要一个档位假设（含依据），不要四栏都空着。</p>`:'';})()}<div class="formgrid">
      ${originLine('天数',`${path}.cost.days`,u.cost?.days||'')}${originLine('人数',`${path}.cost.crew`,u.cost?.crew||'')}
      ${originLine('预算档',`${path}.cost.budget`,u.cost?.budget||'')}${originLine('授权',`${path}.cost.rights`,u.cost?.rights||'')}
    </div></section>
    ${u.sediment?`<section class="panel"><h2>沉淀卡</h2><p>${esc(u.sediment.decision==='approved'?'已批准':u.sediment.decision==='revised'?'修改后采用':'被否')} · ${esc(u.sediment.reason||'')}</p><p class="muted">机制：${esc(u.sediment.mechanism||'')}</p></section>`:''}`;
}

/* 骨架：出发点映射出的 5 页。只用于体检，不是完整汇报。 */
function originDeck(t){
  const u=originUnit(t),path=creativePath(t);
  const decisions=(get(`${path}.report.decisions`)||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const chapters=[
    {id:'cover',title:'封面',section:'story',group:'main',enabled:true,task:'一眼知道这是什么片'},
    {id:'summary',title:'一页摘要',section:'story',group:'main',enabled:true,task:'先让老板在一分钟内理解这条片'},
    {id:'camera',title:'影像与摄影',section:'execution',group:'main',enabled:true,task:'镜头方法必须能指导拍摄'},
    {id:'production',title:'拍摄落地',section:'execution',group:'main',enabled:true,task:'谁来做、何时做、哪里可能失败'},
    {id:'decisions',title:'决策清单',section:'decisions',group:'main',enabled:true,task:'只留需要拍板的事项'}
  ];
  const pages=[
    {slotId:'cover',title:'封面',section:'story',basis:'proposal',points:[u.proposition].filter(Boolean),notes:u.notes||'',evidence:''},
    {slotId:'summary',title:'一页摘要',section:'story',basis:'proposal',points:[u.proposition,u.tension?.whyBoth].filter(Boolean),notes:`张力：${u.tension?.sideA||''} ⚔ ${u.tension?.sideB||''}`,evidence:''},
    {slotId:'camera',title:'影像与摄影',section:'execution',basis:'proposal',points:(u.frames||[]).map(f=>`${f.name||''}：${f.camera||''}，${f.light||''}，${f.people||''}`),notes:(u.frames||[]).map(f=>f.venue).join('；'),evidence:''},
    {slotId:'production',title:'拍摄落地',section:'execution',basis:'assumption',points:[`${u.cost?.days||''}／${u.cost?.crew||''}／预算${u.cost?.budget||''}`,`风险与替代：${u.assumptionRisk||''}`],notes:u.assumptionRisk||'',evidence:''},
    {slotId:'decisions',title:'决策清单',section:'decisions',basis:'proposal',points:decisions,notes:'',evidence:''}
  ];
  return {title:t.title,audience:u.audience||'老板',purpose:u.purpose||'单条',auto:true,origin:u,chapters,pages,
    facts:{confirmed:(u.materials||[]).filter(m=>m.kind==='fact').map(m=>m.text),assumed:(u.materials||[]).filter(m=>m.kind==='venue').map(m=>m.text)}};
}

/* 骨架页降噪：没有讲稿不该报；空页降级为提示（正文接入后再判） */
function originAdjust(list){
  return (list||[]).filter(f=>f.id!=='R02b').map(f=>f.id==='R02'?{...f,level:'info',why:f.why+'（骨架页，正文接入后再判）'}:f);
}

/* 骨架体检：去掉噪音、降级空页、给出下一步 */
function originAudit(t){
  const deck=originDeck(t),path=creativePath(t);
  const raw=globalThis.StudioAudit.scan(deck);
  const hints=[];
  if(!(get(`${path}.report.decisions`)||'').trim())hints.push('决策清单还没写：到「3 汇报」填上今天要老板拍板的事');
  return {deck,rules:originAdjust(raw),hints};
}

function originAuditHTML(t){
  const a=t.originAudit;if(!a||!a.findings)return '';
  const tag=f=>f.level==='block'?'<span class="badge bad">必须改</span>':f.level==='warn'?'<span class="badge">建议改</span>':'<span class="badge">提示</span>';
  const row=f=>`<p class="${f.level==='block'?'missing':'muted'}">${tag(f)}${f.page?'（'+esc(f.page)+'）':''}${esc(f.why)}${f.quote?`｜原文：${esc(f.quote)}`:''} → ${esc(f.fix)}</p>`;
  return `<section class="panel"><h2>骨架体检 · 基于出发点的 5 页映射 · ${esc(a.verdict?.label||'')}</h2>
    <p class="muted">${esc(originStamp(a.at))}${a.rulesOnly?' · 规则已拦下结构性问题，未调用模型':''}${a.dropped?` · 丢弃了 ${a.dropped} 条引用对不上的模型意见`:''}</p>
    ${(a.hints||[]).map(x=>`<p class="muted">提示：${esc(x)}</p>`).join('')}
    ${a.findings.filter(f=>f.level==='block').map(row).join('')}${a.findings.filter(f=>f.level!=='block').map(row).join('')}
    ${a.findings.some(f=>f.level==='block')?'<p class="missing">导出门禁：本次导出会自动标为方向讨论稿，完整版与执行版停用。</p>':''}
    <p class="muted">这是出发点的骨架，不是完整汇报；正文接入后会再体检一次。</p></section>`;
}

function creativeOriginPanel(t){
  const u=originUnit(t),r=globalThis.StudioOrigin.readiness(u),m=globalThis.StudioOrigin.materials(u);
  /* 还没生成过就只给一句引导，不把整套缺项甩在第一次打开的人脸上 */
  const started=!!u.proposition,missing=started?r.missing.slice(0,4):[];
  return `<section class="panel"><h2>先立住出发点，再谈创意 <span class="badge${r.level==='可汇报'?'':' bad'}">${esc(r.label)}</span></h2>
    <p>系统只给一个主张，不给六个候选；每个判断都要能指回素材。质量不高通常不是模型不行，而是出发点没立住。</p>
    <div class="actions">${btn('生成／更新出发点（1次文字调用）','creative-origin-generate',`data-id="${t.id}"`,true)}${btn('骨架体检','creative-origin-check',`data-id="${t.id}"${started?'':' disabled'}`)}${btn('查看10页映射','creative-origin-blocks',`data-id="${t.id}"`)}</div>
    ${started?'':`<p class="muted">第一步：在下面加一条业务事实（场地只有大概尺寸也可以），再点生成。${m.blocking.length?'':'业务事实已经有了。'}</p>`}
    ${t.error?`<p class="missing">${esc(t.error)}</p>`:''}
    ${missing.map(x=>`<p class="missing">${esc(x)}</p>`).join('')}
    ${started&&r.missing.length>missing.length?`<p class="muted">还有 ${r.missing.length-missing.length} 项要补，先改最上面的。</p>`:''}
    ${u.proposition?`<p class="muted">当前主张：${esc(u.proposition)}</p>`:''}</section>
    ${originMaterialsHTML(t,u)}${originGapsHTML(u)}${originResultHTML(t,u)}${originAuditHTML(t)}`;
}

function originBlocksHTML(t){
  const blocks=globalThis.StudioOrigin.toPitchBlocks(originUnit(t));
  return blocks.map(b=>`<section class="preview-block"><h2>第${b.page}页 · ${esc(b.title)}</h2><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(b.content,null,2))}</pre></section>`).join('');
}

function originSyncProps(u){
  for(const f of u.frames||[]){
    if(typeof f.propsText==='string'){f.props=f.propsText.split(/[、,，\s]+/).filter(Boolean);delete f.propsText;}
    if(!Array.isArray(f.props))f.props=[];
    if(f.seconds!==''&&f.seconds!==undefined&&f.seconds!==null)f.seconds=Number(f.seconds)||f.seconds;
  }
  return u;
}

async function creativeOriginAction(action,e,t){
  const u=originUnit(t);
  if(action==='creative-origin-add'){
    const kind=$('#origin-kind')?.value,text=$('#origin-text')?.value,source=$('#origin-source')?.value;
    try{globalThis.StudioOrigin.addMaterial(u,kind,text,source);t.error='';}
    catch(error){t.error=error.message;}
    const box=$('#origin-text');if(box)box.value='';
    save();render();return;
  }
  if(action==='creative-origin-remove'){u.materials.splice(Number(e.dataset.index),1);save();render();return;}
  if(action==='creative-origin-reset'){dialog('清空出发点','<p>素材会保留，只清空张力、主张、反方、画面与代价。</p>',btn('确认清空','creative-origin-reset-confirm',`data-id="${t.id}"`,true));return;}
  if(action==='creative-origin-reset-confirm'){
    for(const k of ['tension','proposition','propositionBasis','objections','fallback','frames','cost','sediment','assumptionRisk'])delete u[k];
    t.originAudit=null;t.error='';close();save();render();return;
  }
  if(action==='creative-origin-generate'){
    if(!globalThis.StudioOrigin.materials(u).ready)throw Error('先补业务事实；场地缺失可以后补，但要在假设风险里写清代价');
    await withJob('生成出发点',1,async()=>{
      try{
        const result=await api('chat',{purpose:'director',prompt:globalThis.StudioOrigin.prompt(u),references:[],task:'structure',thinking:true});
        if(stop)return;
        globalThis.StudioOrigin.accept(u,JSON.parse(result.text));
        u.at=new Date().toISOString();t.error='';t.originAudit=null;
      }catch(error){t.error=error.message;}
      save();render();
    });
    return;
  }
  if(action==='creative-origin-check'){
    const {deck,rules,hints}=originAudit(t);
    if(rules.some(x=>x.level==='block')){
      t.originAudit={findings:rules,verdict:globalThis.StudioAudit.verdict(rules),hints,at:new Date().toISOString(),rulesOnly:true,dropped:0};
      save();render();return;
    }
    await withJob('骨架体检',1,async()=>{
      try{
        const result=await api('chat',{purpose:'refine',prompt:globalThis.StudioAudit.prompt(deck,rules),references:[],task:'verify'});
        if(stop)return;
        const audit=globalThis.StudioAudit.run(deck,JSON.parse(result.text));
        const findings=originAdjust(audit.findings);
        t.originAudit={findings,verdict:globalThis.StudioAudit.verdict(findings),hints,at:new Date().toISOString(),dropped:(audit.ai.dropped||[]).length};
        t.error='';
      }catch(error){t.error=error.message;}
      save();render();
    });
    return;
  }
  if(action==='creative-origin-blocks'){dialog('10页映射（可直接进现有模板）',originBlocksHTML(t),btn('关闭','close'));return;}
  if(action==='creative-origin-sediment'){
    dialog('记录这次的结果',`<p>沉淀卡下次能被检索复用：机制、条件、以及为什么批或否。</p>
      <label>结果<select id="origin-decision"><option value="approved">批准</option><option value="revised">修改后采用</option><option value="rejected">被否</option></select></label>
      <label>原因<input id="origin-reason" placeholder="例如：老板认为和专场关系不清"></label>`,
      btn('保存沉淀','creative-origin-sediment-save',`data-id="${t.id}"`,true));return;
  }
  if(action==='creative-origin-sediment-save'){
    originSyncProps(u);
    u.sediment=globalThis.StudioOrigin.sediment(u,$('#origin-decision')?.value,$('#origin-reason')?.value);
    close();save();render();notify('已记录沉淀，下次生成会把它当作历史结果');return;
  }
  save();render();
}

/* 导出门禁：骨架体检有“必须改”时，只允许导出方向讨论稿 */
function originGate(item){
  const audit=item&&item.originAudit;
  if(!audit||!Array.isArray(audit.findings))return {blocked:false,count:0,reasons:[]};
  const blockers=audit.findings.filter(f=>f.level==='block');
  return {blocked:blockers.length>0,count:blockers.length,
    reasons:blockers.map(f=>(f.page?'（'+f.page+'）':'')+f.why),
    level:audit.verdict&&audit.verdict.level};
}

/* 摘要行里的按钮不该触发展开／折叠 */
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('click',event=>{
  if(event.target.closest('[data-action="creative-origin-remove"]'))event.preventDefault();
});
