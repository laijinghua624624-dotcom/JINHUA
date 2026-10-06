/* 出发点面板：素材 → 出发点 → 10页映射 → 逻辑体检。数据存在 t.origin，随时可回看。 */
const ORIGIN_KINDS=globalThis.StudioOrigin.MATERIAL_KINDS;
const ORIGIN_LEVEL={block:'必须改',warn:'建议改',info:'提示'};

function originUnit(t){
  if(!t.origin||typeof t.origin!=='object')t.origin=globalThis.StudioOrigin.create(t.title||'',t.quick?'单条':'专场');
  const u=t.origin;
  for(const k of ['materials','objections','frames'])if(!Array.isArray(u[k]))u[k]=[];
  for(const k of ['title','proposition','fallback','assumptionRisk','notes','audience'])if(typeof u[k]!=='string')u[k]=k==='audience'?'老板':'';
  if(!u.cost||typeof u.cost!=='object')u.cost={days:'待确认',crew:'待确认',budget:'待确认',rights:'待确认'};
  return u;
}

function originKindLabel(kind){const hit=ORIGIN_KINDS.find(([k])=>k===kind);return hit?hit[1]:kind;}

function originMaterialsHTML(t,u){
  const path=creativePath(t)+'.origin';
  const rows=u.materials.map((m,i)=>`<details class="panel" ${i===u.materials.length-1?'open':''}><summary>m${i+1} · ${esc(originKindLabel(m.kind))} · ${esc((m.text||'').slice(0,26))}</summary>
    <p class="muted">${esc(m.source||'未注明来源')}</p>${field('素材内容',`${path}.materials.${i}.text`,m.text,true)}${field('来源',`${path}.materials.${i}.source`,m.source||'')}
    <div class="actions">${btn('删除这条','creative-origin-remove',`data-id="${t.id}" data-index="${i}"`)}</div></details>`).join('')||'<p class="muted">还没有素材。先加业务事实和场地条件，其余可以慢慢补。</p>';
  return `<section class="panel"><h2>出发点素材 · ${u.materials.length} 条</h2>
    <p>素材决定创意质量。业务事实是硬门槛；场地只有大概尺寸也照写，系统会把它标成假设并算代价。</p>
    <label>类型<select id="origin-kind">${ORIGIN_KINDS.map(([k,l])=>`<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></label>
    <label>内容<input id="origin-text" placeholder="例如：上次同类创意被否，老板说太文艺"></label>
    <label>来源<input id="origin-source" placeholder="例如：10月汇报纪要"></label>
    <div class="actions">${btn('加入素材','creative-origin-add',`data-id="${t.id}"`,true)}</div>
    ${rows}</section>`;
}

function originGapsHTML(u){
  const m=globalThis.StudioOrigin.materials(u);
  const rows=ORIGIN_KINDS.map(([k,l])=>{const has=!m.missing.includes(k);return `<li>${has?'✅':'⬜️'} ${esc(l)}${has?'':'（缺）'}</li>`;}).join('');
  return `<section class="panel"><h2>素材完整度</h2><ul class="list">${rows}</ul>
    ${m.blocking.length?`<p class="missing">还差：${esc(m.blocking.join('、'))}。缺了它就不该谈出发点。</p>`:''}
    ${m.missing.includes('venue')?'<p class="muted">没有场地条件时必须写清“假设风险”，否则不能确认。</p>':''}</section>`;
}

function originReadinessHTML(u){
  const r=globalThis.StudioOrigin.readiness(u);
  const tone=r.level==='可汇报'?'':r.level==='讨论稿'?'muted':'missing';
  return `<section class="panel"><h2>能不能拿去汇报</h2><p class="${tone}">${esc(r.label)}</p>
    ${r.missing.map(x=>`<p class="missing">${esc(x)}</p>`).join('')}</section>`;
}

function originResultHTML(t,u){
  if(!u.proposition&&!u.tension)return '';
  const path=creativePath(t)+'.origin';
  const frameBlock=(f,i)=>`<details class="panel" ${i===0?'open':''}><summary>画面 ${i+1} · ${esc(f.name||'未命名')}</summary>
    ${field('画面名',`${path}.frames.${i}.name`,f.name||'')}${field('场地与约数尺寸',`${path}.frames.${i}.venue`,f.venue||'',true)}
    ${field('机位与景别',`${path}.frames.${i}.camera`,f.camera||'')}${field('光',`${path}.frames.${i}.light`,f.light||'')}
    ${field('人物与人数',`${path}.frames.${i}.people`,f.people||'')}${field('道具（逗号分隔）',`${path}.frames.${i}.propsText`,(f.props||[]).join('、'))}
    ${field('预估秒数',`${path}.frames.${i}.seconds`,String(f.seconds||''),false,true)}</details>`;
  const obj=(o,i)=>`<details class="panel"><summary>反方 ${i+1} · ${esc(o.question||'')}</summary>${field('质疑',`${path}.objections.${i}.question`,o.question||'',true)}${field('回应',`${path}.objections.${i}.response`,o.response||'',true)}</details>`;
  return `<section class="panel"><h2>出发点</h2>
    ${field('张力 · 一侧',`${path}.tension.sideA`,u.tension?.sideA||'',true)}
    ${field('张力 · 另一侧',`${path}.tension.sideB`,u.tension?.sideB||'',true)}
    ${field('为什么两者同时成立',`${path}.tension.whyBoth`,u.tension?.whyBoth||'',true)}
    ${field('主张（30字内）',`${path}.proposition`,u.proposition||'',true)}
    ${field('退路（砍到什么程度还成立）',`${path}.fallback`,u.fallback||'',true)}
    ${field('假设风险（假设不成立时的代价）',`${path}.assumptionRisk`,u.assumptionRisk||'',true)}
    ${(u.objections||[]).map(obj).join('')}
    <div class="actions">${btn('记录沉淀（批／否／改）','creative-origin-sediment',`data-id="${t.id}"`)}${btn('清空重来','creative-origin-reset',`data-id="${t.id}"`)}</div></section>
    <section class="panel"><h2>关键画面 · ${(u.frames||[]).length}/3</h2><p>每个画面都要能直接发给摄影：场地、机位、光、人、道具、时长。</p>${(u.frames||[]).map(frameBlock).join('')}</section>
    <section class="panel"><h2>代价</h2>${field('天数',`${path}.cost.days`,u.cost?.days||'',false,true)}${field('人数',`${path}.cost.crew`,u.cost?.crew||'',false,true)}${field('预算档',`${path}.cost.budget`,u.cost?.budget||'',false,true)}${field('授权',`${path}.cost.rights`,u.cost?.rights||'',false,true)}</section>
    ${u.sediment?`<section class="panel"><h2>沉淀卡</h2><p>${esc(u.sediment.decision==='approved'?'已批准':u.sediment.decision==='revised'?'修改后采用':'被否')} · ${esc(u.sediment.reason||'')}</p><p class="muted">机制：${esc(u.sediment.mechanism||'')}</p></section>`:''}`;
}

/* 体检用的汇报结构：出发点映射 + 创作区已填的决策事项 */
function originDeck(t){
  const u=originUnit(t),path=creativePath(t);
  const prop=u.proposition,decision=(get(`${path}.report.decisions`)||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const chapters=[
    {id:'cover',title:'封面',section:'story',group:'main',enabled:true,task:'一眼知道这是什么片'},
    {id:'summary',title:'一页摘要',section:'story',group:'main',enabled:true,task:'先让老板在一分钟内理解这条片'},
    {id:'camera',title:'影像与摄影',section:'execution',group:'main',enabled:true,task:'镜头方法必须能指导拍摄'},
    {id:'production',title:'拍摄落地',section:'execution',group:'main',enabled:true,task:'谁来做、何时做、哪里可能失败'},
    {id:'decisions',title:'决策清单',section:'decisions',group:'main',enabled:true,task:'只留需要拍板的事项'}
  ];
  const pages=[
    {slotId:'cover',title:'封面',section:'story',basis:'proposal',points:[prop].filter(Boolean),notes:u.notes||'',evidence:''},
    {slotId:'summary',title:'一页摘要',section:'story',basis:'proposal',points:[prop,u.tension?.whyBoth].filter(Boolean),notes:`张力：${u.tension?.sideA||''} ⚔ ${u.tension?.sideB||''}`,evidence:''},
    {slotId:'camera',title:'影像与摄影',section:'execution',basis:'proposal',points:(u.frames||[]).map(f=>`${f.name||''}：${f.camera||''}，${f.light||''}，${f.people||''}`),notes:(u.frames||[]).map(f=>f.venue).join('；'),evidence:''},
    {slotId:'production',title:'拍摄落地',section:'execution',basis:'assumption',points:[`${u.cost?.days||''}／${u.cost?.crew||''}／预算${u.cost?.budget||''}`,`风险与替代：${u.assumptionRisk||''}`],notes:u.assumptionRisk||'',evidence:''},
    {slotId:'decisions',title:'决策清单',section:'decisions',basis:'proposal',points:decision,notes:'',evidence:''}
  ];
  return {title:t.title,audience:u.audience||'老板',purpose:u.purpose||'单条',origin:u,chapters,pages,
    facts:{confirmed:(u.materials||[]).filter(m=>m.kind==='fact').map(m=>m.text),assumed:(u.materials||[]).filter(m=>m.kind==='venue').map(m=>m.text)}};
}

function originAuditHTML(t){
  const a=t.originAudit;if(!a||!a.findings)return '';
  const row=f=>`<p class="${f.level==='block'?'missing':'muted'}">[${esc(ORIGIN_LEVEL[f.level]||f.level)}]${f.page?'（'+esc(f.page)+'）':''}${esc(f.why)}${f.quote?`｜原文：${esc(f.quote)}`:''} → ${esc(f.fix)}</p>`;
  return `<section class="panel"><h2>逻辑体检 · ${esc(a.verdict?.label||'')}</h2>
    <p class="muted">${esc(a.at||'')}${a.rulesOnly?' · 规则已拦下结构性问题，未调用模型':''}${a.dropped?` · 丢弃了 ${a.dropped} 条引用对不上的模型意见`:''}</p>
    ${a.findings.filter(f=>f.level==='block').map(row).join('')}${a.findings.filter(f=>f.level!=='block').map(row).join('')}</section>`;
}

function creativeOriginPanel(t){
  const u=originUnit(t),r=globalThis.StudioOrigin.readiness(u);
  return `<section class="panel"><h2>先立住出发点，再谈创意</h2>
    <p>系统只给一个主张，不给六个候选；每个判断都要能指回素材。质量不高通常不是模型不行，而是出发点没立住。</p>
    <div class="actions">${btn('生成／更新出发点（1次文字调用）','creative-origin-generate',`data-id="${t.id}"`,true)}${btn('逻辑体检','creative-origin-check',`data-id="${t.id}"`)}${btn('查看10页映射','creative-origin-blocks',`data-id="${t.id}"`)}</div>
    ${t.error?`<p class="missing">${esc(t.error)}</p>`:''}
    <p class="muted">当前状态：${esc(r.label)}${u.proposition?` · 主张：${esc(u.proposition)}`:''}</p></section>
    ${originReadinessHTML(u)}${originMaterialsHTML(t,u)}${originGapsHTML(u)}${originResultHTML(t,u)}${originAuditHTML(t)}`;
}

function originBlocksHTML(t){
  const blocks=globalThis.StudioOrigin.toPitchBlocks(originUnit(t));
  return blocks.map(b=>`<section class="preview-block"><h2>第${b.page}页 · ${esc(b.title)}</h2><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(b.content,null,2))}</pre></section>`).join('');
}

function originSyncProps(u){
  /* 道具在界面上用顿号编辑，回写时转成数组，保证校验通过 */
  for(const f of u.frames||[]){
    if(typeof f.propsText==='string'){f.props=f.propsText.split(/[、,，\s]+/).filter(Boolean);delete f.propsText;}
    if(!Array.isArray(f.props))f.props=[];
    if(f.seconds!==''&&f.seconds!==undefined&&f.seconds!==null)f.seconds=Number(f.seconds)||f.seconds;
  }
  return u;
}

async function creativeOriginAction(action,e,t){
  const u=originUnit(t),path=creativePath(t);
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
        const result=await api('chat',{purpose:'director',prompt:globalThis.StudioOrigin.prompt(u),references:[]});
        if(stop)return;
        globalThis.StudioOrigin.accept(u,JSON.parse(result.text));
        u.at=new Date().toISOString();t.error='';t.originAudit=null;
      }catch(error){t.error=error.message;}
      save();render();
    });
    return;
  }
  if(action==='creative-origin-check'){
    const deck=originDeck(t),rules=globalThis.StudioAudit.scan(deck);
    const blockers=rules.filter(x=>x.level==='block');
    if(blockers.length){
      t.originAudit={findings:rules,verdict:globalThis.StudioAudit.verdict(rules),at:new Date().toISOString(),rulesOnly:true,dropped:0};
      save();render();notify('规则先拦下了结构性问题，先改这些再调用模型');return;
    }
    await withJob('汇报逻辑体检',1,async()=>{
      try{
        const result=await api('chat',{purpose:'refine',prompt:globalThis.StudioAudit.prompt(deck,rules),references:[]});
        if(stop)return;
        const audit=globalThis.StudioAudit.run(deck,JSON.parse(result.text));
        t.originAudit={findings:audit.findings,verdict:audit.verdict,at:new Date().toISOString(),dropped:(audit.ai.dropped||[]).length};
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
    const decision=$('#origin-decision')?.value,reason=$('#origin-reason')?.value;
    u.sediment=globalThis.StudioOrigin.sediment(u,decision,reason);
    close();save();render();notify('已记录沉淀，下次生成会把它当作历史结果');return;
  }
  save();render();
}
