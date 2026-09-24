const {test}=require('node:test');
const assert=require('node:assert/strict');
const Radar=require('../studio-radar');
const Core=require('../studio-core');

test('案例雷达固定覆盖八类工作来源',()=>{
  assert.deepEqual(Radar.CATEGORIES,['直播预热','演唱会预热','活动预热','AI商业成片','AI短片叙事','AI镜头实验','AI舞台预演','AI制作方法']);
  assert.ok(Radar.SOURCES.length>=15);assert.ok(Radar.CASES.length>=8);
  for(const item of [...Radar.SOURCES,...Radar.CASES])assert.match(item.url,/^https:\/\//);
  assert.equal(new Set(Radar.SOURCES.map(x=>x.id)).size,Radar.SOURCES.length);
  assert.equal(new Set(Radar.CASES.map(x=>x.id)).size,Radar.CASES.length);
  for(const item of Radar.CASES)assert.match(item.poster,/^https:\/\//,'每条案例必须有可判断价值的预览图片');
});

test('中文运镜词典可独立进入参考库，不复制第三方媒体',()=>{
  assert.ok(Radar.SOURCES.some(item=>item.id==='frameset'));
  assert.ok(Radar.MOTIONS.length>=18);
  for(const item of Radar.MOTIONS){assert.ok(item.name&&item.en&&item.description&&item.effect&&item.execution&&item.use&&item.avoid);}
  const record=Radar.motionToAesthetic(Radar.MOTIONS[0],()=> 'motion-1');
  assert.equal(record.category,'分镜参考');assert.equal(record.radarKind,'motion-guide');assert.equal(record.files.length,0);assert.equal(record.link,'');assert.match(record.notes,/中文运镜参考卡/);
});

test('案例收藏进入现有审美库，不伪造网页图片或授权',()=>{
  const a=Radar.caseToAesthetic(Radar.CASES[0],()=> 'id-1','xinxuan');
  assert.equal(a.id,'id-1');assert.equal(a.sourceUsage,'link-only');assert.deepEqual(a.files,[]);assert.equal(a.favorite,true);
  assert.equal(a.externalPreview,Radar.CASES[0].poster);
  assert.match(a.notes,/打开来源看片后请核对/);assert.match(a.notes,/辛选工作/);assert.equal(a.radarKind,'case');
});

test('同一链接的跟踪参数不会造成重复收藏',()=>{
  const item=Radar.CASES[0],saved=Radar.caseToAesthetic(item,()=> 'saved','personal');
  assert.equal(Radar.duplicate([saved],{id:'other',url:item.url+'?utm_source=test'}).id,'saved');
  assert.equal(Radar.duplicate([],item),null);
});

test('转为选题只带入方法和来源，不伪装成已完成汇报',()=>{
  const item=Radar.CASES[1],topic=Radar.caseToTopic(item,Core.topic,'personal');
  assert.equal(topic.inspirationSource,item.url);assert.equal(topic.quick.fields.outline,item.mechanism);assert.equal(topic.quick.fields.meaning,'');assert.equal(Core.quickStatus(topic).ready,false);assert.deepEqual(topic.quick.images.map(x=>x.versions.length),[0,0,0]);
});

test('每日推荐稳定给3条且无重复',()=>{
  const picks=Radar.daily(Radar.CASES,new Date('2026-09-19T00:00:00Z'));
  assert.equal(picks.length,3);assert.equal(new Set(picks.map(x=>x.id)).size,3);assert.deepEqual(Radar.daily(Radar.CASES,new Date('2026-09-19T18:00:00Z')),picks);
});

test('手机视觉雷达每天至少两条拍摄或审美参考',()=>{
  const picks=Radar.mobileDaily(Radar.CASES,new Date('2026-09-22T00:00:00Z'));
  assert.equal(picks.length,3);assert.equal(new Set(picks.map(x=>x.id)).size,3);assert.ok(picks.filter(x=>x.visualFocus).length>=2);
  assert.deepEqual(Radar.mobileDaily(Radar.CASES,new Date('2026-09-22T18:00:00Z')),picks);
});

test('手机点换一组时在当前一轮内不重复',()=>{
  let seen=[],previous=[];
  for(let turn=0;turn<5;turn++){
    const batch=Radar.mobileBatch(Radar.CASES,seen,100+turn,3),ids=batch.items.map(item=>item.id);
    assert.equal(ids.length,3);assert.equal(new Set(ids).size,3);assert.equal(ids.some(id=>previous.includes(id)),false);
    assert.ok(ids.filter(id=>Radar.CASES.find(item=>item.id===id).visualFocus).length>=Math.min(2,Radar.CASES.filter(item=>item.visualFocus&&!seen.includes(item.id)).length));
    previous=ids;seen=batch.seen;
  }
});

test('手机雷达看完一轮才重置，且不立即重复上一组',()=>{
  const all=Radar.CASES.map(item=>item.id),previous=all.slice(-3),batch=Radar.mobileBatch(Radar.CASES,all,999,3);
  assert.equal(batch.reset,true);assert.equal(batch.items.some(item=>previous.includes(item.id)),false);assert.equal(batch.seen.length,3);
});
