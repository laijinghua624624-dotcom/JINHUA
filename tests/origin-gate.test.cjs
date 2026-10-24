const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../studio-core'),W=require('../studio-creative'),P=require('../studio-ppt');

/* 一条已确认方向的创意（不依赖门禁本身就是就绪的草稿） */
function topic(){
  const t=C.topic('门禁验证片');
  t.quick.fields.outline='核心创意：用一封信承载没来得及说的话';
  t.quick.fields.meaning='推荐理由：情绪与专场自然相连';
  W.ensure(t);
  t.creativeReport={directionApproved:true,visualApproved:true,visual:null,references:[]};
  return t;
}
const blocked={blocked:true,count:2,reasons:['（summary）摘要页没有说明这条创意与专场的关系','（camera）影像页画面没有支撑主张'],level:'需修改'};

test('没有体检结果时导出计划不受影响',()=>{
  const t=topic();
  const plan=P.planDeck(t,'topic',[],'decision');
  assert.equal(plan.draft,false,'未接入门禁时不该被标成讨论稿');
  assert.equal(plan.slides.some(s=>s.title==='出发点体检'),false);
});

test('骨架体检有必须改时，导出自动降级为方向讨论稿',()=>{
  const t=topic();
  globalThis.originGate=()=>blocked;
  try{
    assert.equal(P.planDeck(t,'topic',[],'decision').draft,true);
    assert.equal(P.reportStatus(t,'topic',[],'decision').draft,true);
    const plan=P.planDeck(t,'topic',[],'decision');
    const page=plan.slides.find(s=>s.title==='出发点体检');
    assert.ok(page,'讨论稿里要有一页说明为什么降级');
    assert.match(JSON.stringify(page),/摘要页没有说明这条创意与专场的关系/);
  }finally{delete globalThis.originGate;}
});

test('体检没问题时照常按原规则判断草稿',()=>{
  const t=topic();
  globalThis.originGate=()=>({blocked:false,count:0,reasons:[]});
  try{
    assert.equal(P.planDeck(t,'topic',[],'decision').draft,false);
    assert.equal(P.planDeck(t,'topic',[],'decision').slides.some(s=>s.title==='出发点体检'),false);
  }finally{delete globalThis.originGate;}
});

test('项目（专场）导出同样受门禁约束',()=>{
  const p=C.project('专场门禁验证');
  p.fields.outline='整体概念';
  p.fields.meaning='为什么';
  W.ensure(p);
  p.creativeReport={directionApproved:true,visualApproved:true};
  globalThis.originGate=()=>blocked;
  try{
    assert.equal(P.planDeck(p,'project',[],'decision').draft,true);
  }finally{delete globalThis.originGate;}
});
