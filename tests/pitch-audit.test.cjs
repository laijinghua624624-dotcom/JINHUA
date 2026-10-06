const {test}=require('node:test');const assert=require('node:assert/strict');const O=require('../studio-origin');const A=require('../studio-audit');

/* 一份“像真的”的单条汇报：提纲取自现有模板的任务定义 */
const chapters=[
  {id:'cover',title:'封面',section:'story',group:'main',enabled:true,task:'让人一眼知道这是什么片'},
  {id:'summary',title:'一页摘要',section:'story',group:'main',enabled:true,task:'先让老板在一分钟内理解这条片'},
  {id:'camera',title:'影像与摄影',section:'execution',group:'main',enabled:true,task:'美术氛围和镜头方法必须能指导拍摄'},
  {id:'production',title:'拍摄落地',section:'execution',group:'main',enabled:true,task:'回答谁来做、何时做、哪里可能失败'},
  {id:'decisions',title:'决策清单',section:'decisions',group:'main',enabled:true,task:'只留需要拍板的事项'}
];

function originUnit(){
  const u=O.create('秋天的第一封信','单条');
  O.addMaterial(u,'fact','老板要求：双十一前两周发，为主体专场预热','需求会');
  O.addMaterial(u,'venue','老式居民楼房间，约 4×6 米，一扇朝东窗','勘景记录（约数）');
  O.accept(u,{tension:{sideA:'最想说的话最难开口',sideB:'记住的不是产品而是一次对话',whyBoth:'要情绪也要看出与业务关系',basis:['m1']},
    proposition:'用一扇朝东的窗，拍妈妈把没寄出的信读给女儿听',basis:['m1'],
    objections:[{question:'还是文艺片吗',response:'片尾收件人指向专场主角'},{question:'一个房间够吗',response:'用光变化替代场景量'}],
    fallback:'砍掉女儿只留妈妈和窗',
    frames:[{name:'写信',venue:'书桌靠窗约2米',camera:'固定中景',light:'东窗侧逆光',people:'妈妈1人',props:['信纸'],seconds:8,basis:['m1']},
      {name:'读信',venue:'窗边',camera:'近景缓推',light:'正面柔光',people:'妈妈1人',props:['信纸'],seconds:8,basis:['m1']},
      {name:'收信',venue:'窗边过曝',camera:'过肩特写',light:'正对窗',people:'妈妈1人',props:['信封'],seconds:8,basis:['m1']}],
    cost:{days:'1天',crew:'4人',budget:'低',rights:'已签'},assumptionRisk:'进深不足时改手持',notes:''});
  return u;
}

function deck(over){
  const base={title:'秋天的第一封信',audience:'老板',purpose:'单条',origin:originUnit(),chapters,
    facts:{confirmed:['双十一前两周发布'],assumed:['老式居民楼可借用']},
    pages:[
      {slotId:'cover',title:'封面',section:'story',basis:'proposal',points:['用一扇朝东的窗，拍妈妈把没寄出的信读给女儿听'],notes:'一句话讲完这条片',evidence:''},
      {slotId:'summary',title:'一页摘要',section:'story',basis:'proposal',points:['用一扇朝东的窗，拍妈妈把没寄出的信读给女儿听','张力：最想说的话最难开口'],notes:'先让老板一分钟理解',evidence:''},
      {slotId:'camera',title:'影像与摄影',section:'execution',basis:'proposal',points:['写信：固定中景，东窗侧逆光','读信：近景缓推'],notes:'三个画面都靠同一扇窗的光变化',evidence:''},
      {slotId:'production',title:'拍摄落地',section:'execution',basis:'assumption',points:['1天4人，低预算','风险：进深不足时第三人机位改手持'],notes:'约 4×6 米房间，需提前核对电源位置',evidence:''},
      {slotId:'decisions',title:'决策清单',section:'decisions',basis:'proposal',points:['确认是否接受“只有妈妈一人”的极简版本','决定片尾是否出现专场主角'],notes:'今天只需拍板这两件事',evidence:''}
    ]};
  return Object.assign(base,over||{});
}
function ids(audit){return audit.findings.map(f=>f.id);}

test('缺页、空页、依据缺失、真假事实都会被规则拦下',()=>{
  const d=deck();
  d.pages=d.pages.filter(p=>p.slotId!=='summary');
  d.pages.find(p=>p.slotId==='camera').points=[];
  d.pages.find(p=>p.slotId==='cover').basis='';
  d.pages.find(p=>p.slotId==='production').basis='fact';
  const rules=A.scan(d);
  assert.ok(rules.some(r=>r.id==='R01'&&/一页摘要/.test(r.why)));
  assert.ok(rules.some(r=>r.id==='R02'&&r.page==='camera'));
  assert.ok(rules.some(r=>r.id==='R03'&&r.page==='cover'));
  assert.ok(rules.some(r=>r.id==='R03b'&&r.page==='production'));
});

test('代价与落地方案天数冲突时判必须改',()=>{
  const d=deck();
  d.pages.find(p=>p.slotId==='production').points=['需要3天完成，含一天联测'];
  const rules=A.scan(d);
  const hit=rules.find(r=>r.id==='R05');
  assert.ok(hit&&hit.level==='block');
  assert.match(hit.why,/3天.*1天/);
});

test('摘要页主张与已确认主张不一致会被指出',()=>{
  const d=deck();
  d.pages.find(p=>p.slotId==='summary').points=['讲一个女孩在雨天等公交的故事'];
  d.pages.find(p=>p.slotId==='summary').notes='另一套说法';
  assert.ok(A.scan(d).some(r=>r.id==='R04'));
});

test('假设被写成事实、空话词过多、缺风险页都会被指出',()=>{
  const d=deck();
  d.pages.find(p=>p.slotId==='production').points=['老式居民楼已经确定可以借用','赋能品牌，打造沉浸式体验，引爆传播，形成矩阵闭环'];
  const rules=A.scan(d);
  assert.ok(rules.some(r=>r.id==='R06b'&&r.level==='block'));
  assert.ok(rules.some(r=>r.id==='R07'&&r.level==='block'));
  assert.ok(rules.some(r=>r.id==='R09'));
});

test('结尾不是决策清单、或决策项过多都会被指出',()=>{
  const d=deck();
  d.chapters=chapters;
  d.pages=d.pages.map(p=>p.slotId==='decisions'?{...p,section:'execution',points:Array.from({length:9},(_,i)=>'确认事项'+i)}:p);
  const rules=A.scan(d);
  assert.ok(rules.some(r=>r.id==='R08'&&r.level==='block'));
});

test('模型条目引用对不上原文就被丢弃，引用得到才保留',()=>{
  const d=deck(),audit=A.run(d);
  A.accept(audit,{findings:[
    {page:'camera',level:'warn',quote:'写信：固定中景，东窗侧逆光',why:'这一页没有说清画面怎样支撑主张',fix:'补一句每个画面支撑什么'},
    {page:'camera',level:'block',quote:'这句话原文里根本没有出现过',why:'编造的引用',fix:'x'},
    {page:'summary',level:'warn',quote:'很短',why:'引用长度不足',fix:'y'}
  ]},d);
  assert.equal(audit.ai.findings.length,1);
  assert.equal(audit.ai.dropped.length,2);
  assert.equal(audit.ai.findings[0].source,'ai');
});

test('规则与模型结果合并去重，结论分必须改与建议改',()=>{
  const d=deck();
  const audit=A.run(d,[{findings:[{page:'camera',level:'warn',quote:'写信：固定中景，东窗侧逆光',why:'这一页没有说清画面怎样支撑主张',fix:'补一句'}]}]);
  assert.equal(audit.verdict.level,'可汇报（有建议）');
  const merged=A.merge([...audit.rules,...audit.ai.findings],[]);
  assert.equal(new Set(merged.map(f=>f.why)).size,merged.length);
  d.pages.find(p=>p.slotId==='cover').points=[];
  assert.equal(A.run(d).verdict.level,'需修改');
  assert.match(A.report(A.run(d).findings),/必须改/);
});

test('提示词只让模型judge规则外的问题，并要求原样摘抄',()=>{
  const d=deck(),rules=A.scan(d),p=A.prompt(d,rules);
  assert.match(p,/只回答规则查不出的判断问题/);
  assert.match(p,/原样摘抄/);
  assert.match(p,/摘抄不出来的条目会被系统丢弃/);
  assert.match(p,/最多 8 条/);
  assert.match(p,/不要重复/);
  assert.doesNotMatch(p,/重新生成整份汇报/);
});

test('没有提纲或没有正文时不允许开始体检',()=>{
  assert.deepEqual(A.deckIssues({pages:[]}),['汇报还没有正文页','缺少提纲定义，无法逐页检查']);
  assert.equal(A.scan({pages:[]})[0].level,'block');
});
