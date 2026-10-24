const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const O=require('../studio-origin'),A=require('../studio-audit'),V=require('../studio-venue'),CR=require('../studio-creative');

/* 用真实的 origin / audit / venue 引擎，外加最少的手写桩，把向导跑起来 */
function harness(opts={}){
  const topic={id:'t1',title:'人生站台·我的版本',quick:{stage:'direction',fields:{}},idea:opts.idea||''};
  const inputs={};let calls=0,lastPrompt='',saved=0,rendered=0;
  const db={topics:[topic],projects:[]};
  /* 只把「是否已确认」这两个判断换成可控开关，其余仍用真实引擎 */
  const CRstub=Object.assign({},CR,{directionCurrent:t=>!!t.__dir,visualCurrent:t=>!!t.__vis});
  const core={
    slot:(label)=>({id:'slot-1',label,prompt:'',versions:[],selectedId:null,locked:false,task:null,error:''}),
    putVersion:(s,a)=>{s.versions.push({...a,id:'v'+(s.versions.length+1)});s.selectedId='v'+s.versions.length;},
    selected:(s)=>s&&s.selectedId?s.versions.find(v=>v.id===s.selectedId)||null:null
  };
  const context=vm.createContext({
    StudioOrigin:O,StudioAudit:A,StudioVenue:V,StudioCore:core,CR:CRstub,
    creativeReportItem:t=>t,creativeAction:async()=>{context.__explored=(context.__explored||0)+1;},StudioPpt:{ensureReport:(t)=>(t.report=t.report||{decisions:'',pending:''})},
    esc:v=>String(v??''),btn:(l,a,attrs,primary)=>`<button data-action="${a}" ${attrs||''} class="${primary?'primary':''}">${l}</button>`,
    field:(l,p,v)=>`<textarea data-field="${p}">${v??''}</textarea>`,
    mediaURL:()=>'/media/x.png',upload:(l,a,extra)=>`<label class="upload">${l}<input type="file" data-upload="${a}" ${extra||''}></label>`,
    creativePath:()=>'topics.0',showReportOptions(){context.__exported=(context.__exported||0)+1;},
    db,save(){saved++;},render(){rendered++;},notify(){},progress(){},dialog(){},close(){},
    withJob:async(n,t,fn)=>fn(),
    api:async(path,body)=>{calls++;lastPrompt=body&&body.prompt||'';return {text:JSON.stringify({tension:{sideA:'观众想被感动',sideB:'老板看不出与专场的关联',whyBoth:'两个都成立',basis:['m1']},proposition:'用一扇朝东的窗，拍妈妈把没寄出的信读给女儿听',basis:['m1'],objections:[{question:'还是文艺片吗',response:'片尾收件人指向专场主角'},{question:'一个房间够吗',response:'用光变化替代场景量'}],fallback:'砍掉女儿只留妈妈和窗',frames:[{name:'写信',stage:'建立',venue:'书桌靠窗约2米',camera:'固定中景',light:'东窗侧逆光',people:'妈妈1人',props:['信纸'],seconds:8,basis:['m1']},{name:'读信',stage:'推进',venue:'窗边',camera:'近景缓推',light:'正面柔光',people:'妈妈1人',props:['信纸'],seconds:8,basis:['m1']},{name:'收信',stage:'落点',venue:'窗边过曝',camera:'过肩特写',light:'正对窗',people:'妈妈1人',props:['信封'],seconds:8,basis:['m1']}],cost:{days:'1天',crew:'4人',budget:'低',rights:'已签'},assumptionRisk:'进深不足时改手持'})};},
    get:path=>{try{return path.split('.').reduce((v,k)=>v[k],db);}catch{return undefined;}},
    document:{addEventListener(){}},stop:false,route:{},job:null
  });
  const src=['studio-origin-ui','studio-venue-ui','studio-wizard'].map(f=>fs.readFileSync(require.resolve('../'+f),'utf8')).join('\n')+
    '\n;globalThis.__wpanel=creativeWizardPanel;globalThis.__waction=creativeWizardAction;globalThis.__wsync=wizardSyncMaterials;globalThis.__wgate=wizardGate;globalThis.__wstate=wizardState;globalThis.__unit=originUnit;globalThis.__venue=venueOf;';
  vm.runInContext(src,context);
  return {topic,context,inputs,calls:()=>calls,lastPrompt:()=>lastPrompt,saved:()=>saved,rendered:()=>rendered};
}

test('一页到底：五段都在同一页，顺序就是导演的顺序',()=>{
  const h=harness({idea:'老板要一条能记住的预热片'});
  const html=h.context.__wpanel(h.topic);
  const order=['① 一句话','② 三个画面','③ 汇报脚本','④ 拿去讲'];
  let last=-1;
  for(const key of order){const at=html.indexOf(key);assert.ok(at>last,'顺序不对或缺段：'+key);last=at;}
  assert.match(html,/素材与依据/);
  assert.match(html,/生成一句话与三个画面（1 次文字调用）/,'首屏要露出主力按钮，不能藏在折叠里');
  assert.match(html,/<details class="panel" id="wz-source" open>/,'新选题要默认展开那三句话的输入框');
  assert.match(html,/➕ 加场景与机位分镜（可选 · 现在不做也可以汇报）/,'场景机位要降为可选');
  assert.match(html,/➕ 代价与资源[^<]*（可选 · 第一次汇报可以先不填）/,'代价要往后放且可选');
  assert.ok(!/○ 代价|✓ 代价/.test(html),'代价不该再计入"还差什么"');
  const costAt=html.indexOf('id="wz-cost"'),talkAt=html.indexOf('id="wz-report"');
  assert.ok(costAt>talkAt,'代价要排在"拿去讲"之后');
  assert.ok(!/上一步|下一步 →|第 \d 步/.test(html),'不要翻页，一页看完');
  assert.match(html,new RegExp('老板要一条能记住的预热片'),'建选题时写的想法自动带过来');
});

test('状态条一眼看出缺什么，并能跳到那一段',()=>{
  const h=harness();
  const html=h.context.__wpanel(h.topic);
  for(const id of ['wz-line','wz-frames','wz-script','wz-report','wz-cost','wz-extra'])
    assert.match(html,new RegExp('href="#'+id+'"'),'状态条缺少跳转：'+id);
  assert.match(html,/○ 一句话/,'还没写主张时应该是未完成');
  assert.match(html,/导出老板决策版 PPT（不花钱）/);
});

test('有主张之后，素材区自动收起',async()=>{
  const h=harness();
  h.topic.wizard={fact:'双十一前两周发'};
  await h.context.__waction('creative-wizard-generate',{dataset:{id:'t1'}},h.topic);
  assert.match(h.context.__wpanel(h.topic),/<details class="panel" id="wz-source" >/,'有主张后不该继续占屏');
});

test('三句话同步成素材，且不重复累积',()=>{
  const h=harness();
  h.topic.wizard={fact:'双十一前两周发，为主体专场预热',history:'上次被否：太文艺',venue:'老式居民楼房间，约 4×6 米'};
  h.context.__wsync(h.topic);
  assert.deepEqual(h.context.__unit(h.topic).materials.map(m=>m.kind),['fact','history','venue']);
  h.context.__wsync(h.topic);
  assert.equal(h.context.__unit(h.topic).materials.length,3,'重复同步不该越积越多');
});

test('没有业务要求就不许生成；拦住了不花钱',async()=>{
  const h=harness();
  await assert.rejects(()=>h.context.__waction('creative-wizard-generate',{dataset:{id:'t1'}},h.topic),/老板／业务要求/);
  assert.equal(h.calls(),0);
});

test('生成后同一页长出：主张、三个画面、代价、可改字段',async()=>{
  const h=harness();
  h.topic.wizard={fact:'双十一前两周发，为主体专场预热'};
  await h.context.__waction('creative-wizard-generate',{dataset:{id:'t1'}},h.topic);
  assert.equal(h.calls(),1,'一次生成只调用一次模型');
  const html=h.context.__wpanel(h.topic);
  assert.match(html,/画面 1 · 建立|建立/);
  assert.match(html,/全身|中景|近景/);
  for(const path of ['topics.0.origin.proposition','topics.0.origin.tension.sideA','topics.0.origin.frames.0.stage','topics.0.origin.cost.days','topics.0.origin.assumptionRisk'])
    assert.ok(html.includes(path),'缺少可改字段 '+path);
  assert.match(html,/✓ 一句话/,'生成后状态条要变完成');
});

test('场地段：没画面时说清原因；有画面且填了尺寸就出机位与俯视图',async()=>{
  const h=harness();
  assert.match(h.context.__wpanel(h.topic),/先在①写出主张并生成三个画面/,'没画面的时候不该是一片空白');
  h.topic.wizard={fact:'双十一前两周发'};
  await h.context.__waction('creative-wizard-generate',{dataset:{id:'t1'}},h.topic);
  let html=h.context.__wpanel(h.topic);
  assert.match(html,/还缺：缺净宽（米，可以是约数）/);
  Object.assign(h.context.__venue(h.topic),{width:4,depth:6,height:2.8,windowWall:'east'});
  html=h.context.__wpanel(h.topic);
  assert.match(html,/画面 1 · 全身/);
  assert.match(html,/35mm · 退 3\.37 米/);
  assert.match(html,/可拍/);
  assert.match(html,/<svg/,'俯视机位图要在同一页里');
});

test('汇报脚本段：七段都在同一页，能生成、能按反馈改、能采用',()=>{
  const h=harness();
  h.topic.wizard={fact:'双十一前两周发'};
  const html=h.context.__wpanel(h.topic);
  assert.match(html,/③ 汇报脚本：拿去讲的话/);
  for(const k of ['创意大纲','创意寓意','创意描述','台词','影像氛围参考','摄影调性参考','完整故事脚本'])
    assert.match(html,new RegExp(k),'脚本缺少章节：'+k);
  assert.match(html,/生成汇报脚本（7 段空白 · 1 次文字调用）/);
  assert.match(html,/③ 汇报脚本：拿去讲的话/);
  assert.match(html,/按下面的反馈再改（1 次文字调用）/);
  assert.equal((html.match(/name="creative-section"/g)||[]).length,7,'要把七个章节作为默认修改范围传下去');
  assert.match(html,/topics\.0\.quick\.fields\.outline/,'正文要就地可改');
});

test('没写一句话就不给生成脚本；没写反馈就不给改',async()=>{
  const h=harness();
  await assert.rejects(()=>h.context.__waction('creative-wizard-script',{dataset:{id:'t1'}},h.topic),/先在①写出那一句话/);
  assert.equal(h.calls(),0);
  h.topic.wizard={fact:'x'};
  await h.context.__waction('creative-wizard-generate',{dataset:{id:'t1'}},h.topic);
  await assert.rejects(()=>h.context.__waction('creative-wizard-revise',{dataset:{id:'t1'}},h.topic),/先写一句这一轮想怎么改/);
  CR.ensure(h.topic).feedback='结尾不要出现产品';
  await assert.doesNotReject(()=>h.context.__waction('creative-wizard-revise',{dataset:{id:'t1'}},h.topic),'写了反馈就该放行');
});

test('场地机位不再是必经步骤，放开着也能导出',async()=>{
  const h=harness();
  h.topic.wizard={fact:'双十一前两周发'};
  await h.context.__waction('creative-wizard-generate',{dataset:{id:'t1'}},h.topic);
  h.topic.report={decisions:'确认是否只拍妈妈一人',pending:''};
  const html=h.context.__wpanel(h.topic);
  assert.match(html,/<details class="panel" id="wz-extra">/,'场景与机位要折叠起来');
  assert.ok(!/✓ 场地机位|○ 场地机位/.test(html),'状态条不该再拿场地机位计分');
  assert.match(html,/✓ 要拍板的事|○ 要拍板的事/);
});

test('拿去讲：门禁用大白话说清能不能导完整版',async()=>{
  const h=harness();
  h.topic.wizard={fact:'双十一前两周发'};
  await h.context.__waction('creative-wizard-generate',{dataset:{id:'t1'}},h.topic);
  h.topic.report={decisions:'确认是否只拍妈妈一人',pending:''};
  const before=h.context.__wgate(h.topic);
  assert.equal(before.bad,false,'素材不齐不该当成拦截');
  assert.match(before.text,/还没有确认这一版/);
  assert.match(h.context.__wpanel(h.topic),/确认这一版（不花钱）/,'一页之内要能定稿');
  h.topic.__dir=true;
  const half=h.context.__wgate(h.topic);
  assert.equal(half.dirOk,true);assert.equal(half.visOk,false);
  assert.match(half.text,/关键视觉还没定/);
  assert.equal(half.action.tab,'visual','要能一键跳去定关键视觉');
  h.topic.__vis=true;
  const after=h.context.__wgate(h.topic);
  assert.equal(after.dirOk,true);assert.equal(after.visOk,true);
  assert.match(after.text,/可以导出完整版/);
  h.topic.originAudit={findings:[{level:'block',page:'summary',why:'摘要页没说明与专场的关系'}],verdict:{level:'需修改'}};
  assert.equal(h.context.__wgate(h.topic).bad,true);
  assert.match(h.context.__wpanel(h.topic),/只能导出「方向讨论稿」：体检还有 1 项必须改/);
});

test('没有决策项不许导出；写了才打开导出弹窗',async()=>{
  const h=harness();
  h.topic.report={decisions:'',pending:''};
  await assert.rejects(()=>h.context.__waction('creative-wizard-export',{dataset:{id:'t1'}},h.topic),/先.*写一条要老板拍板的事/);
  assert.equal(h.context.__exported||0,0);
  h.topic.report.decisions='确认是否只拍妈妈一人';
  await h.context.__waction('creative-wizard-export',{dataset:{id:'t1'}},h.topic);
  assert.equal(h.context.__exported,1);
});
