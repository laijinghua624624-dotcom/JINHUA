const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../studio-core');const P=require('../studio-ppt');
test('专场按计划片数校验，7条方向无需任何媒体',()=>{
 const p=C.project('中秋');C.setSessionTarget(p,7);p.fields.outline='先团圆再相见';p.fields.meaning='陪伴';
 const topics=Array.from({length:7},(_,i)=>{const t=C.topic('故事'+i,p.id);t.idea='第'+i+'条的差异化分工';return t;});p.topicIds=topics.map(t=>t.id);
 assert.equal(C.directionStatus(p,'project',topics).ready,true);assert.equal(C.sessionStatus(p,topics).ready,false);
 assert.equal(P.reportStatus(p,'project',topics,'decision').ready,true);
 const plan=P.planDeck(p,'project',topics,'decision');assert.equal(plan.slides.filter(s=>s.type==='matrix').flatMap(s=>s.rows).length,7);assert.equal(plan.slides.some(s=>s.type==='video'),false);
 assert.throws(()=>C.setSessionTarget(p,6),/不能少于/);assert.equal(p.topicIds.length,7);
 p.topicIds[6]=p.topicIds[0];assert.equal(C.directionStatus(p,'project',topics).ready,false);
});
test('片数不能被输入小数、NaN或无限值破坏；旧项目不会丢脚本',()=>{
 const p=C.project('测试');assert.equal(C.sessionTarget(p),0);C.setSessionTarget(p,0);for(const n of [-1,2.5,NaN,Infinity,101,'bad'])assert.throws(()=>C.setSessionTarget(p,n));
 delete p.targetCount;p.topicIds=Array.from({length:9},(_,i)=>'id'+i);assert.equal(C.sessionTarget(p),9);
 C.setSessionTarget(p,12);assert.equal(C.sessionTarget(p),12);
});
test('专场整体汇报不依赖单条脚本',()=>{
 const p=C.project('秋冬服装大秀专场');
 assert.equal(C.projectOverviewStatus(p).ready,false);
 for(const[k]of C.SESSION)p.fields[k]='已完成的'+k;
 assert.equal(C.projectOverviewStatus(p).ready,true);assert.equal(p.topicIds.length,0);assert.equal(C.sessionTarget(p),0);
});
test('少于计划片数、失效关联、空分工不能假装方向已完成',()=>{
 const p=C.project('测试');C.setSessionTarget(p,1);p.fields.outline='方向';p.fields.meaning='依据';const t=C.topic('标题');p.topicIds=[t.id];
 assert.equal(C.directionStatus(p,'project',[t]).ready,false);t.idea='分工';assert.equal(C.directionStatus(p,'project',[t]).ready,true);
 assert.equal(C.directionStatus(p,'project',[]).ready,false);p.topicIds.push('unknown');assert.equal(C.directionStatus(p,'project',[t]).ready,false);
});
