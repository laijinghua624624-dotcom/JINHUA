const {test}=require('node:test');const assert=require('node:assert/strict');const V=require('../studio-venue');

function venue(over){
  return Object.assign(V.create('老式居民楼房间'),{width:4,depth:6,height:2.8,windowWall:'east',windowWidth:1.6,lightWindow:'上午 9-11 点',power:'门左侧'},over||{});
}
const frames=()=>[{index:0,name:'写信',stage:'建立',people:'妈妈1人',seconds:8,camera:'固定中景',light:'侧逆光'},
  {index:1,name:'读信',stage:'推进',people:'妈妈1人',seconds:8,camera:'近景缓推',light:'正面柔光'},
  {index:2,name:'收信',stage:'落点',people:'妈妈1人',seconds:8,camera:'过肩特写',light:'正对窗'}];

test('按尺寸算距离与焦段：全画幅 35mm 拍全身约 3.4 米',()=>{
  assert.equal(Math.round(V.distanceFor(35,1.95,'full','16:9')*10)/10,3.4);
  assert.equal(Math.round(V.focalFor(3.2,1.95,'full','16:9')),33);
  assert.ok(V.distanceFor(50,0.55,'full','16:9')<V.distanceFor(35,1.95,'full','16:9'),'近景要比全身近');
  assert.equal(V.verticalSensor('full','9:16'),36,'竖画幅的纵向感应器是长边');
});

test('进深不够时给出可用的更广焦段，而不是只说拍不了',()=>{
  const v=venue({depth:3});
  const shot=V.planFrame(v,{index:0,name:'写信',people:'妈妈1人',seconds:8},V.choiceOf(v,0));
  assert.equal(shot.fits,false);
  assert.ok(shot.suggestFocal>0&&shot.suggestFocal<35,'退不开只能用更广的镜头：应建议比 35mm 更短的焦段');
  assert.match(shot.warnings.join(''),/进深不够/);
  const wide=V.planFrame(v,{index:0,people:'妈妈1人'},{framing:'wide',focal:shot.suggestFocal,people:1,sensor:'full',aspect:'16:9'});
  assert.equal(wide.fits,true,'按建议焦段应能拍下');
});

test('缺尺寸不猜：返回缺什么，并说明按每米估算',()=>{
  const v=V.create('只有名字');
  assert.deepEqual(V.issues(v),['缺净宽（米，可以是约数）','缺进深（米，可以是约数）','缺层高（米，可以是约数）']);
  const partial=venue({depth:0});
  const shot=V.planFrame(partial,{index:0,people:'妈妈1人'},V.choiceOf(partial,0));
  assert.match(shot.assumptions.join(''),/缺净宽／进深/);
});

test('层高不够直接判不可拍',()=>{
  assert.match(V.issues(venue({height:1.5})).join(''),/无法站直/);
  assert.equal(V.ready(venue({height:1.5})),false);
});

test('多人并排太挤会提示错开，窗口在侧墙时给侧光做法',()=>{
  const v=venue({width:2.2});
  const shot=V.planFrame(v,{index:0,people:'3人并排'},{framing:'wide',focal:35,people:3,sensor:'full',aspect:'16:9'});
  assert.match(shot.warnings.join(''),/并排需要/);
  assert.match(shot.light[0].role,/侧墙/);
  assert.match(shot.light[0].action,/30–45 度|30-45/);
});

test('三个画面一起体检：焦段过多与站位重复都会指出',()=>{
  const v=venue();
  const result=V.plan(v,frames().map((f,i)=>i===0?{...f}:f));
  assert.equal(result.ready,true);
  assert.equal(result.shots.length,3);
  assert.equal(result.totalSeconds,24);
  const odd=venue({choices:[{framing:'wide',focal:24},{framing:'mid',focal:50},{framing:'close',focal:85}]});
  const conflict=V.plan(odd,frames());
  assert.match(conflict.conflicts.join(''),/换镜头次数偏多/);
});

test('默认按阶段给景别：建立=全身、推进=中景、落点=近景，且不误报冲突',()=>{
  const v=venue();
  const plan=V.plan(v,frames());
  assert.deepEqual(plan.shots.map(s=>s.framingLabel),['全身','中景','近景']);
  assert.deepEqual(plan.shots.map(s=>s.focal),[35,35,50]);
  assert.equal(plan.shots[0].distance,3.37);
  assert.deepEqual(plan.conflicts,[],'三个画面景别不同，不该报重复');
  assert.equal(V.defaultFraming({stage:'落点',camera:'固定中景'}),'close','阶段优先于描述');
});

test('俯视机位图包含场地、窗、机位与人物',()=>{
  const v=venue();
  const svg=V.diagramSVG(v,V.plan(v,frames()).shots);
  assert.match(svg,/^<svg/);
  assert.match(svg,/净宽 4m × 进深 6m/);
  assert.match(svg,/机位 35mm/);
  assert.match(svg,/建立|全身/);
  assert.match(svg,/stroke-width="4"/,'窗要用加粗线标出');
});

test('参考图提示词保住场地结构，只加人物与光线',()=>{
  const v=venue();
  const shot=V.planFrame(v,frames()[0],V.choiceOf(v,0));
  const p=V.prompt(v,frames()[0],shot);
  assert.match(p,/必须保留：房间的墙面、窗户位置与大小/);
  assert.match(p,/不要改变或重画建筑结构/);
  assert.match(p,/距人物约 \d/);
  assert.match(p,/不要：文字、水印/);
});

test('场地就绪时给一行摘要，缺项时给缺什么',()=>{
  const v=venue();
  const done=V.digest(v,frames());
  assert.equal(done.ready,true);
  assert.match(done.shots.join(' '),/全身|中景|近景/);
  const missing=V.digest(V.create('空场地'),frames());
  assert.equal(missing.ready,false);
  assert.ok(missing.missing.length>=3);
});
