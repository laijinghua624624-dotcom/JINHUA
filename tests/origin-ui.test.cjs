const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const O=require('../studio-origin'),A=require('../studio-audit');

function completeUnit(){
  const u=O.create('秋天的第一封信','单条');
  O.addMaterial(u,'fact','老板要求：双十一前两周发，为主体专场预热','需求会');
  O.addMaterial(u,'venue','老式居民楼房间，约 4×6 米，一扇朝东窗','勘景（约数）');
  O.addMaterial(u,'history','上次同类创意被否：太文艺','10月纪要');
  O.accept(u,{tension:{sideA:'最想说的话最难开口',sideB:'记住的不是产品而是一次对话',whyBoth:'要情绪也要看出与业务关系',basis:['m1']},
    proposition:'用一扇朝东的窗，拍妈妈把没寄出的信读给女儿听',basis:['m1'],
    objections:[{question:'还是文艺片吗',response:'片尾收件人指向专场主角'},{question:'一个房间够吗',response:'用光变化替代场景量'}],
    fallback:'砍掉女儿只留妈妈和窗',
    frames:[{name:'写信',stage:'建立',venue:'书桌靠窗约2米',camera:'固定中景',light:'东窗侧逆光',people:'妈妈1人',props:['信纸'],seconds:8,basis:['m1']},
      {name:'读信',stage:'推进',venue:'窗边',camera:'近景缓推',light:'正面柔光',people:'妈妈1人',props:['信纸'],seconds:8,basis:['m1']},
      {name:'收信',stage:'落点',venue:'窗边过曝',camera:'过肩特写',light:'正对窗',people:'妈妈1人',props:['信封'],seconds:8,basis:['m1']}],
    cost:{days:'1天',crew:'4人',budget:'低',rights:'已签'},assumptionRisk:'进深不足时第三人机位改手持'});
  return u;
}

function topic(unit){
  const t={id:'t1',title:'秋天的第一封信',quick:{stage:'direction'}};
  if(unit)t.origin=unit;
  t.report={decisions:'确认是否只拍妈妈一人\n决定片尾是否出现专场主角'};
  return t;
}

function adapter(t,reply,promptReply){
  const inputs={};let calls=0,lastPrompt='';
  const db={topics:[t],projects:[]};
  const context=vm.createContext({
    StudioOrigin:O,StudioAudit:A,
    esc:v=>String(v??''),
    btn:(label,action,attrs)=>`<button data-action="${action}" ${attrs||''}>${label}</button>`,
    field:(label,path,value)=>`<textarea data-field="${path}">${value??''}</textarea>`,
    creativePath:()=>`topics.0`,
    $:sel=>({value:inputs[sel]||''}),
    db,save(){},render(){},notify(){},progress(){},dialog(){},close(){},
    withJob:async(name,total,fn)=>fn(),
    api:async(path,body)=>{calls++;lastPrompt=body?.prompt||'';return {text:JSON.stringify(calls===1?reply:(promptReply||reply))};},
    get:path=>{try{return path.split('.').reduce((v,k)=>v[k],db);}catch{return undefined;}},
    document:{addEventListener(){}},stop:false,route:{},job:null
  });
  const src=fs.readFileSync(require.resolve('../studio-origin-ui'),'utf8')+
    '\n;globalThis.__panel=creativeOriginPanel;globalThis.__action=creativeOriginAction;globalThis.__unit=originUnit;globalThis.__blocks=originBlocksHTML;globalThis.__originAudit=originAudit;globalThis.__gate=originGate;';
  vm.runInContext(src,context);
  return {context,calls:()=>calls,lastPrompt:()=>lastPrompt,inputs};
}

test('出发点面板渲染素材录入、完整度与状态',()=>{
  const t=topic(completeUnit()),x=adapter(t,{});
  const html=x.context.__panel(t);
  assert.match(html,/先立住出发点，再谈创意/);
  assert.match(html,/creative-origin-add/);
  assert.match(html,/素材完整度/);
  assert.match(html,/m1/);
  assert.match(html,/<summary style="[^"]*">[\s\S]{0,120}data-action="creative-origin-remove"/,'删除按钮要放在摘要行里（折叠时也能点）');
  assert.match(html,/class="badge/);
  assert.match(html,/方向讨论稿/);
  assert.match(html,/关键画面 · 3\/3/);
  assert.match(html,/用一扇朝东的窗/);
});

test('加入素材写入 t.origin，缺业务事实时拒绝生成',async()=>{
  const t=topic(),x=adapter(t,{});
  await assert.rejects(()=>x.context.__action('creative-origin-generate',{dataset:{id:'t1'}},t),/先补业务事实/);
  assert.equal(x.calls(),0);
  x.inputs['#origin-kind']='fact';x.inputs['#origin-text']='老板要求双十一前两周发';x.inputs['#origin-source']='需求会';
  await x.context.__action('creative-origin-add',{dataset:{id:'t1'}},t);
  assert.equal(t.origin.materials.length,1);
  assert.equal(t.origin.materials[0].source,'需求会');
});

test('生成出发点只调用一次模型，失败时保留原内容',async()=>{
  const u=O.create('片','单条');
  O.addMaterial(u,'fact','老板要求双十一前两周发');O.addMaterial(u,'venue','约4×6米房间');
  const t=topic(u),x=adapter(t,{proposition:'打造沉浸式体验'});
  await x.context.__action('creative-origin-generate',{dataset:{id:'t1'}},t);
  assert.equal(x.calls(),1);
  assert.match(t.error,/空话词/);
  assert.equal(t.origin.proposition,'');
  assert.match(x.lastPrompt(),/只允许提出 \*\*1 个主张\*\*/);
});

test('体检先跑规则：有必须改就不调用模型',async()=>{
  const u=completeUnit();u.frames[0].light='';
  const t=topic(u),x=adapter(t,{findings:[]});
  await x.context.__action('creative-origin-check',{dataset:{id:'t1'}},t);
  assert.equal(x.calls(),0);
  assert.equal(t.originAudit.rulesOnly,true);
  assert.ok(t.originAudit.findings.some(f=>f.id==='R10b'));
});

test('规则通过后调用模型，结论与丢弃计数都写回',async()=>{
  const t=topic(completeUnit()),x=adapter(t,{findings:[
    {page:'camera',level:'warn',quote:'写信：固定中景，东窗侧逆光',why:'这一页没有说清画面怎样支撑主张',fix:'补一句'},
    {page:'camera',level:'block',quote:'原文里没有这句话',why:'编造的引用',fix:'x'}
  ]});
  await x.context.__action('creative-origin-check',{dataset:{id:'t1'}},t);
  assert.equal(x.calls(),1);
  assert.equal(t.originAudit.dropped,1);
  assert.ok(t.originAudit.findings.some(f=>f.source==='ai'&&f.level==='warn'));
  assert.ok(!t.originAudit.findings.some(f=>f.why==='编造的引用'));
  assert.match(x.lastPrompt(),/原样摘抄/);
});

test('首次打开只给一句引导，不甩一墙缺项，体检按钮禁用',()=>{
  const t={id:'t1',title:'新的内容',quick:{}},x=adapter(t,{});
  const html=x.context.__panel(t);
  assert.match(html,/第一步：在下面加一条业务事实/);
  assert.ok(!/缺少张力/.test(html),'还没生成时不该列整套缺项');
  assert.match(html,/data-action="creative-origin-check"[^>]*disabled/);
  x.context.__unit(t).proposition='已经有主张';
  const html2=x.context.__panel(t);
  assert.ok(!/第一步：在下面加一条业务事实/.test(html2));
  assert.ok(!/disabled/.test(html2.split('骨架体检')[0].slice(-80)+html2.split('骨架体检')[1].slice(0,40)));
});

test('画面带阶段选择器与阶段摘要，代价缺口会提示',()=>{
  const t=topic(completeUnit()),x=adapter(t,{});
  const html=x.context.__panel(t);
  assert.match(html,/画面 1 · 建立 · 写信/);
  assert.match(html,/阶段<select data-field="topics\.0\.origin\.frames\.0\.stage"/);
  assert.match(html,/建立<\/option>/);
  const u=x.context.__unit(t);u.cost={days:'待确认',crew:'4人',budget:'低',rights:'待签'};
  const html2=x.context.__panel(t);
  assert.match(html2,/还挂着待确认：天数、授权/);
});

test('体检级别用徽标区分颜色',async()=>{
  const t=topic(completeUnit()),x=adapter(t,{findings:[{page:'summary',level:'warn',quote:'用一扇朝东的窗',why:'摘要页没有说明与专场的关系',fix:'加一句关联句'}]});
  await x.context.__action('creative-origin-check',{dataset:{id:'t1'}},t);
  const html=x.context.__panel(t);
  assert.match(html,/<span class="badge">建议改<\/span>/);
  assert.ok(!/\[建议改\]/.test(html),'级别不再用方括号文字');
});

test('骨架体检不再把空决策页判成必须改，而是给提示',async()=>{
  const t=topic(completeUnit());delete t.report;
  const x=adapter(t,{findings:[]});
  await x.context.__action('creative-origin-check',{dataset:{id:'t1'}},t);
  assert.equal(x.calls(),1);                                   // 无 block，走到模型
  assert.ok(t.originAudit.hints.some(h=>/决策清单还没写/.test(h)));
  assert.ok(!t.originAudit.findings.some(f=>f.id==='R02'&&f.level==='block'));
  const html=x.context.__panel(t);
  assert.match(html,/骨架体检 · 基于出发点的 5 页映射/);
  assert.match(html,/提示：决策清单还没写/);
});

test('骨架页不报“没有讲稿”这类噪音',()=>{
  const t=topic(completeUnit()),x=adapter(t,{});
  const {rules}=x.context.__originAudit(t);
  assert.ok(!rules.some(f=>f.id==='R02b'));
});

test('门禁函数：只有必须改才拦截，并把原因带出去',()=>{
  const t=topic(completeUnit()),x=adapter(t,{});
  const none=x.context.__gate(t);
  assert.equal(none.blocked,false);assert.equal(none.count,0);assert.deepEqual([...none.reasons],[]);
  t.originAudit={findings:[{level:'block',page:'summary',why:'摘要页没有说明与专场的关系'},{level:'warn',page:'camera',why:'画面支撑不够明确'}],verdict:{level:'需修改'}};
  const gate=x.context.__gate(t);
  assert.equal(gate.blocked,true);
  assert.equal(gate.count,1);
  assert.match(gate.reasons[0],/（summary）摘要页没有说明与专场的关系/);
  assert.match(x.context.__panel(t),/导出门禁：本次导出会自动标为方向讨论稿/);
});

test('10页映射与沉淀卡可用',()=>{
  const t=topic(completeUnit()),x=adapter(t,{});
  const html=x.context.__blocks(t);
  assert.equal((html.match(/preview-block/g)||[]).length,10);
  const card=O.sediment(t.origin,'rejected','和专场关系不清');
  assert.equal(card.reusableFrames.length,3);
});
