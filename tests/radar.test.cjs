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
});

test('案例收藏进入现有审美库，不伪造网页图片或授权',()=>{
  const a=Radar.caseToAesthetic(Radar.CASES[0],()=> 'id-1','xinxuan');
  assert.equal(a.id,'id-1');assert.equal(a.sourceUsage,'link-only');assert.deepEqual(a.files,[]);assert.equal(a.favorite,true);
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
