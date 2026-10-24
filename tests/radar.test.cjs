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

test('手机雷达按上海时区判断新的一天',()=>{
  assert.equal(Radar.dayKey(new Date('2026-09-27T15:59:59Z')),'2026-09-27');
  assert.equal(Radar.dayKey(new Date('2026-09-27T16:00:01Z')),'2026-09-28');
});

test('用户偏好的类别会在新一组中优先出现',()=>{
  const category=Radar.CASES.find(item=>item.visualFocus)?.category;
  const batch=Radar.mobileBatch(Radar.CASES,[],12345,3,[category]);
  assert.ok(batch.items.some(item=>item.category===category));
  assert.equal(new Set(batch.items.map(item=>item.id)).size,3);
});

// ── 智能推荐 ──────────────────────────────────────────────────
const caseById=id=>Radar.CASES.find(item=>item.id===id);

test('信号：收藏、选题与偏好会聚合成口味，重复来源不重复计分',()=>{
  const store=Radar.deriveSignals({
    cases:Radar.CASES,
    events:[{kind:'like',id:'hans-zimmer-live-next-level-tour'}],
    assets:[{radarSourceId:'hans-zimmer-live-next-level-tour'}],
    savedIds:['hans-zimmer-live-next-level-tour'],
    topics:[{radarSource:{id:'the-killers-imploding-the-mirage-tour'}}]
  });
  assert.equal(store.events.filter(event=>event.kind==='save').length,1,'同一条案例的多次收藏只算一次');
  assert.equal(store.events.filter(event=>event.id==='hans-zimmer-live-next-level-tour').length,2,'喜欢+收藏是两种信号，可叠加');
  assert.equal(store.events.filter(event=>event.id==='the-killers-imploding-the-mirage-tour').length,1);
  const summary=Radar.signalSummary(store,new Date());
  assert.equal(summary.counts.save,1);
  assert.equal(summary.counts.like,1);
  assert.equal(summary.counts.topic,1);
  assert.ok(Radar.signalStrength(summary.focus['舞台声光'])>0.4);
});

test('信号：未知类型被忽略，超量只保留最近一批',()=>{
  const base=Radar.emptySignals();
  assert.equal(Radar.appendSignal(base,{kind:'unknown',id:'x'}).events.length,0);
  assert.equal(Radar.appendSignal(base,{}).events.length,0);
  let store=base;
  for(let index=0;index<450;index++)store=Radar.appendSignal(store,{kind:'save',id:'case-'+index,category:'直播预热'});
  assert.equal(store.events.length,400);
  assert.equal(store.events.at(-1).id,'case-449');
});

test('信号：负反馈会压低对应方向，时间越久权重越低',()=>{
  const now=new Date('2026-10-25T00:00:00Z');
  const fresh=Radar.signalSummary({events:[{kind:'save',id:'a',category:'直播预热',at:'2026-10-24T00:00:00Z'}]},now);
  const old=Radar.signalSummary({events:[{kind:'save',id:'a',category:'直播预热',at:'2026-08-01T00:00:00Z'}]},now);
  assert.ok(Radar.signalStrength(fresh.category['直播预热'])>Radar.signalStrength(old.category['直播预热']));
  const muted=Radar.signalSummary({events:[{kind:'less',id:'a',category:'直播预热',at:'2026-10-24T00:00:00Z'}]},now);
  assert.ok(Radar.signalStrength(muted.category['直播预热'])<0);
});

test('智能推荐：冷启动也给 3 条不同方向，并说明理由',()=>{
  const batch=Radar.planSmart(Radar.CASES,{count:3});
  assert.equal(batch.items.length,3);
  assert.equal(new Set(batch.items.map(item=>item.id)).size,3);
  assert.equal(new Set(batch.items.map(item=>item.category)).size,3);
  assert.equal(batch.picks.length,3);
  for(const pick of batch.picks){assert.ok(Array.isArray(pick.why)&&pick.why.length>=1,'每条都要有推荐理由');assert.match(pick.why.join(''),/口味|新出现/);}
});

test('智能推荐：收藏「舞台声光」后会更偏向同画面方向的案例',()=>{
  let store=Radar.emptySignals();
  for(const id of ['hans-zimmer-live-next-level-tour','the-killers-imploding-the-mirage-tour','alimama-elva-ai-stage'])
    store=Radar.appendSignal(store,{kind:'save',item:caseById(id)});
  const batch=Radar.planSmart(Radar.CASES,{count:3,profile:store});
  assert.ok(batch.items.some(item=>item.visualFocus==='舞台声光'),'应至少推一条舞台声光');
  assert.ok(batch.picks.some(pick=>pick.why.join('').includes('舞台声光')));
});

test('智能推荐：项目上下文会提升同方向案例',()=>{
  const context=Radar.projectContext({title:'双十一初瑞雪专场',idea:'直播预热，舞台声光，主播登场仪式',fields:{}});
  assert.ok(context.categories.includes('直播预热'));
  const live=caseById('tmall-erdos-outdoor-livestream'),unrelated=caseById('krea-runway-gen45-character-lock');
  assert.ok(Radar.projectAffinity(live,context).score>0);
  assert.ok(Radar.projectAffinity(live,context).score>Radar.projectAffinity(unrelated,context).score);
  const withContext=Radar.planSmart(Radar.CASES,{count:3,context}).picks;
  assert.ok(withContext.some(pick=>pick.why.join('').includes('双十一初瑞雪专场')),'理由要能说出被哪个项目带动');
});

test('智能推荐：「少来这类」的那条立刻消失，且不会出现在本轮后续',()=>{
  const first=Radar.planSmart(Radar.CASES,{count:3});
  const dropped=first.items[0];
  const next=Radar.planSmart(Radar.CASES,{count:3,seenIds:first.seen,exclude:[dropped.id]});
  assert.equal(next.items.some(item=>item.id===dropped.id),false);
  assert.equal(next.items.length,3);
});

test('智能推荐：一轮走完之前不重复，走完才重置',()=>{
  let seen=[],previous=[];
  for(let turn=0;turn<12;turn++){
    const batch=Radar.planSmart(Radar.CASES,{seenIds:seen,count:3});
    const ids=batch.items.map(item=>item.id);
    assert.equal(ids.length,3);
    assert.equal(new Set(ids).size,3);
    assert.equal(ids.some(id=>previous.includes(id)),false,'相邻两组不能撞车');
    previous=ids;seen=batch.seen;
  }
  assert.ok(seen.length>=36);
  const exhausted=Radar.planSmart(Radar.CASES,{seenIds:Radar.CASES.map(item=>item.id),count:3});
  assert.equal(exhausted.reset,true);
  assert.equal(exhausted.items.length,3);
});

test('智能推荐：口味摘要能说清学到了什么',()=>{
  let store=Radar.emptySignals();
  for(const id of ['hans-zimmer-live-next-level-tour','xiaohongshu-starlight-night-market-live'])
    store=Radar.appendSignal(store,{kind:'save',item:caseById(id)});
  const line=Radar.profileLine(Radar.signalSummary(store,new Date()),null);
  assert.equal(line.cold,false);
  assert.match(line.text,/已学 2 个信号/);
  assert.equal(Radar.profileLine(Radar.emptySignals(),null).cold,true);
});

test('网站更新收进参考库时只保存标题、链接和封面',()=>{
  const item={id:'digitaling:abc123',title:'百事可乐穿娃衣，简直太可爱了',url:'https://www.digitaling.com/projects/1.html',poster:'https://file.digitaling.com/a.png',site:'数英',publishedAt:'Sat, 24 Oct 2026 10:46:00 +0800'};
  const record=Radar.feedToAesthetic(item,()=> 'id-feed');
  assert.equal(record.id,'id-feed');
  assert.equal(record.category,'网站更新');
  assert.equal(record.sourceUsage,'link-only');
  assert.deepEqual(record.files,[]);
  assert.equal(record.link,item.url);
  assert.equal(record.externalPreview,item.poster);
  assert.equal(record.radarKind,'feed');
  assert.equal(record.sourceSite,'数英');
  assert.match(record.notes,/网站更新/);
  assert.match(record.notes,/不复制正文/);
});

test('滚动窗口：连点 40 组也不重复近期看过的案例',()=>{
  let seen=[],previous=[];
  const shownIds=[];
  for(let turn=0;turn<40;turn++){
    const batch=Radar.planSmart(Radar.CASES,{seenIds:seen,count:3});
    const ids=batch.items.map(item=>item.id);
    assert.equal(ids.length,3);
    assert.equal(ids.some(id=>previous.includes(id)),false,'相邻两组不能撞车');
    previous=ids;seen=batch.seen;shownIds.push(...ids);
  }
  const repeated=shownIds.filter((id,index)=>shownIds.indexOf(id)!==index);
  const firstGap=(()=>{
    const last=new Map();let smallest=Infinity;
    shownIds.forEach((id,index)=>{if(last.has(id))smallest=Math.min(smallest,index-last.get(id));last.set(id,index);});
    return smallest;
  })();
  assert.ok(repeated.length>0,'跑完 92 条后必然开始复用');
  assert.ok(firstGap>=60,`同一条至少要隔 60 条才会再出现，实际 ${firstGap}`);
  assert.equal(new Set(shownIds).size,Radar.CASES.length,'40 组应覆盖整个案例池');
});

test('语义文本稳定且包含拆解字段，向量才能命中缓存',()=>{
  const item=caseById('hans-zimmer-live-next-level-tour');
  const text=Radar.caseEmbeddingText(item);
  assert.match(text,/Hans Zimmer/);
  assert.match(text,/舞台声光/);
  assert.equal(Radar.caseEmbeddingText(item),text,'同一案例必须得到同一段文本');
  assert.equal(Radar.caseEmbeddingText(null),'');
  assert.ok(text.length<=1200);
});

test('语义分只奖励「比当天平均更贴近」的案例',()=>{
  const context=Radar.projectContext({title:'双十一初瑞雪专场',idea:'直播预热，舞台声光',fields:{}});
  const flat=Object.fromEntries(Radar.CASES.map(item=>[item.id,0.5]));
  const boosted={...flat,'jd-newyear-live-firstlight':0.95,'hard-dreams':0.05};
  const plain=Radar.planSmart(Radar.CASES,{count:3,context});
  const semantic=Radar.planSmart(Radar.CASES,{count:3,context,semantic:boosted});
  assert.ok(semantic.items.some(item=>item.id==='jd-newyear-live-firstlight'),'语义分最高的案例应该进前三');
  const pick=semantic.picks.find(entry=>entry.id==='jd-newyear-live-firstlight');
  assert.ok(pick.semantic>0.1);
  assert.match(pick.why.join(''),/语义/);
  assert.equal(new Set(semantic.items.map(item=>item.id)).size,3);
  assert.equal(new Set(semantic.items.map(item=>item.category)).size,3,'语义再高也不能三条同方向');
  assert.equal(plain.items.length,3);
  assert.equal(semantic.items.some(item=>item.id==='hard-dreams')&&semantic.picks.find(p=>p.id==='hard-dreams').semantic>0,false,'语义分低的案例不该被抬高');
});



