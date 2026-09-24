const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../studio-core');const P=require('../studio-ppt');
test('决策讨论稿可以先导出，但不会把素材缺项判为完整交付',()=>{
  const t=C.topic('冠军篇');t.quick.fields.outline='隧道中的犹疑，走向共同的舞台';t.quick.fields.meaning='个人荣誉转为团队承诺';
  assert.equal(P.reportStatus(t,'topic',[],'decision').ready,true);assert.equal(P.reportStatus(t,'topic',[],'full').ready,false);
  const plan=P.planDeck(t,'topic',[],'decision');assert.equal(plan.draft,true);assert.ok(plan.slides.length<=15);assert.ok(plan.slides.some(s=>s.title==='素材待办'));assert.ok(!plan.slides.some(s=>s.type==='video'));
  assert.ok(!JSON.stringify(plan).includes('销量冠军'));assert.equal(t.report,undefined);
});
test('长文和短行脚本保留全部字句并拆页，空白不产生附件页',()=>{
  const text=Array.from({length:100},(_,i)=>'台词'+i+'：'+('月光落在餐桌上。'.repeat(12))).join('\n');
  const pages=P.splitText(text);assert.ok(pages.length>10);assert.equal(pages.join('').replace(/\s/g,''),text.replace(/\s/g,''));assert.ok(pages.every(p=>p.split('\n').length<=8));assert.deepEqual(P.splitText('  \n '),[]);
});
test('六条决策汇报不因长文膨胀，备注保留原文',()=>{
  const p=C.project('中秋专场'),topics=Array.from({length:6},(_,i)=>C.topic('故事'+(i+1)));p.topicIds=topics.map(t=>t.id);
  for(const[k]of C.SESSION)p.fields[k]='长篇方案'.repeat(200)+'原稿结尾';
  p.report={confirmed:'初瑞雪，账号：初瑞雪（辛选818）',alternatives:'备选方向待讨论'};
  const plan=P.planDeck(p,'project',topics,'decision');assert.ok(plan.slides.length<=15);assert.ok(plan.slides.find(s=>s.type==='matrix').rows.length===6);assert.ok(plan.slides.find(s=>s.title==='创意概念与寓意').sections[0].body.endsWith('原稿结尾'));
});
test('旧确认稿缺少封面素材时列出缺项，不借用未确认新稿',()=>{
  const t=C.topic('历史脚本');t.quick.approved={fields:{script:'确认稿'}};
  const s=P.reportStatus(t,'topic',[],'execution');assert.equal(s.ready,false);assert.ok(s.missing.some(s=>s.includes('确认版本：封面')));assert.doesNotThrow(()=>P.planDeck(t,'topic',[],'execution'));
});
test('导出文件名区分模式，并兼容旧成果',()=>{
  assert.equal(P.filename({title:'冠军篇',mode:'decision',draft:true}),'冠军篇_老板决策版_方向讨论稿.pptx');assert.equal(P.filename({title:'旧成果'}),'旧成果.pptx');
  assert.equal(P.reportStatus(C.project('专场'),'project',[],'execution').ready,false);
});
test('过往封面参考是可选PPT建议，不影响完整交付状态',()=>{
  const t=C.topic('参考测试');const c=C.ensureCover(t);c.referenceAdvice='借鉴人物近景与短标题，不照搬具体文案';
  C.putVersion(c.references[0],{kind:'image',localId:'history.jpg',verified:true,source:'uploaded'});
  const plan=P.planDeck(t,'topic',[],'decision'),slide=plan.slides.find(s=>s.type==='cover-reference');
  assert.ok(slide);assert.equal(slide.entries.length,1);assert.match(slide.advice,/人物近景/);assert.ok(!C.quickStatus(t).missing.some(x=>x.includes('过往封面')));
  const blank=C.topic('空白参考');C.ensureCover(blank).referenceAdvice='只有文字不应增加PPT页';assert.ok(!P.planDeck(blank,'topic',[],'decision').slides.some(s=>s.type==='cover-reference'));
});
