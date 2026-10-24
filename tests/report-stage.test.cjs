const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const O=require('../studio-origin'),A=require('../studio-audit'),V=require('../studio-venue'),CR=require('../studio-creative'),P=require('../studio-ppt');

function harness(reply){
  const C=require('../studio-core');
  const topic=C.topic('人生站台·我的版本');   /* 用真实工厂，字段结构才和线上一致 */
  Object.assign(topic.quick.fields,{outline:'妈妈把没寄出的信读给女儿听',meaning:'',description:'她读出信里的名字不是自己',dialogue:'妈：这封信我写了三年，没敢寄。',atmosphere:'旧屋冬日侧光',camera:'35mm 固定中景',script:'【建立】读信\n【推进】名字不是自己\n【转折】明白写信的人\n【落点】把信折好'});
  topic.report={decisions:'确认是否只拍妈妈一人',pending:''};
  topic.acts={建立:'读信',推进:'名字不是自己',转折:'明白写信的人',落点:'把信折好'};
  let calls=0;
  const db={topics:[topic],projects:[]};
  const core={slot:l=>({id:'s-'+l,label:l,prompt:'',versions:[],selectedId:null,locked:false,task:null,error:''}),
    putVersion:(s,a)=>{s.versions.push({...a,id:'v'+(s.versions.length+1)});s.selectedId='v'+s.versions.length;},
    selected:s=>s&&s.selectedId?s.versions.find(v=>v.id===s.selectedId)||null:null,
    assetOK:(a,k)=>!!(a&&a.kind===k&&a.localId),parseJSON:t=>JSON.parse(String(t).replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''))};
  const context=vm.createContext({
    StudioOrigin:O,StudioAudit:A,StudioVenue:V,StudioCore:core,CR,StudioPpt:P,
    esc:v=>String(v??''),btn:(l,a,attrs,primary)=>`<button data-action="${a}" ${attrs||''} class="${primary?'primary':''}">${l}</button>`,
    field:(l,p,v)=>`<label>${l}<textarea data-field="${p}">${v??''}</textarea></label>`,
    mediaURL:()=>'',upload:()=>'',creativePath:()=>'topics.0',creativeReportItem:t=>t,currentTopic:()=>topic,
    showReportOptions(){context.__exported=(context.__exported||0)+1;},
    creativeAction:async()=>{},notify(){},progress(){},dialog(){},close(){},db,save(){},render(){},
    withJob:async(n,t,fn)=>fn(),
    api:async()=>({text:JSON.stringify(reply||{})}),
    get:p=>{try{return p.split('.').reduce((v,k)=>v[k],db);}catch{return undefined;}},
    document:{addEventListener(){},querySelector:()=>null},route:{creativeTab:'report4'},stop:false,job:null
  });
  const src=['studio-origin-ui','studio-venue-ui','studio-wizard','studio-flow','studio-report'].map(f=>fs.readFileSync(require.resolve('../'+f),'utf8')).join('\n')+
    '\n;globalThis.__rpanel=pitchPanel;globalThis.__raction=reportStageAction;globalThis.__pitch=pitchOf;globalThis.__sec=pitchSeconds;globalThis.__pages=pitchPages;globalThis.__axprompt=appendixPrompt;globalThis.__wpanel=creativeFlowPanel;globalThis.__faction=creativeFlowAction;';
  vm.runInContext(src,context);
  return {topic,context,calls:()=>calls};
}

test('④ 汇报：三块都在，页序来自真实 PPT 计划',()=>{
  const h=harness();
  const html=h.context.__rpanel(h.topic);
  assert.match(html,/④ 汇报：这场会怎么讲完/);
  assert.match(html,/逐页讲稿/);
  assert.match(html,/导演执行八页/);
  for(const k of ['选角','编舞与调度','摄影','灯光与影调','美术与造型','声音','剪辑与交付','制片执行'])assert.match(html,new RegExp(k),'执行八页缺：'+k);
  assert.match(html,/待核实项/);assert.match(html,/风险与伦理/);
  assert.ok(h.context.__pages(h.topic).length>=5,'页序要来自 planDeck');
  assert.match(html,/<button data-action="creative-flow-export"/,'导出要常驻');
});

test('讲稿写到真实字段路径，并按页序对齐；秒数能合计',()=>{
  const h=harness();
  const html=h.context.__rpanel(h.topic);
  assert.match(html,/data-field="topics\.0\.pitch\.notes\.0"/,'讲稿要绑到可保存的字段路径');
  h.topic.pitch={notes:['第1页 约30秒：先说要什么','第2页 约45秒：再说怎么拍'],exec:{}};
  assert.equal(h.context.__sec(h.topic),75);
  assert.match(h.context.__rpanel(h.topic),/合计约 1 分 15 秒/);
});

test('真实模型返回的讲稿会被按页写入，长度不足也不越界',async()=>{
  const h=harness({notes:['第一页讲稿','第二页讲稿','第三页讲稿']});
  const pages=h.context.__pages(h.topic).length;
  await h.context.__raction('creative-report-notes',{dataset:{id:'t1'}},h.topic);
  const p=h.context.__pitch(h.topic);
  assert.equal(p.notes.length,pages,'数组长度要补到页数，不能短于页序');
  assert.equal(p.notes[0],'第一页讲稿');
  assert.ok(p.at,'要记时间戳');
});

test('改讲稿必须先写反馈；执行八页一次写满十项',async()=>{
  const h=harness({casting:'看面孔与关系感',camera:'景别各有用途',verifying:'运镜 · 剪辑 · 核对母带',risk:'特殊人群以本人舒适为准'});
  await assert.rejects(()=>h.context.__raction('creative-report-notes-revise',{dataset:{id:'t1'}},h.topic),/先写一句讲稿想怎么改/);
  await h.context.__raction('creative-report-exec',{dataset:{id:'t1'}},h.topic);
  const p=h.context.__pitch(h.topic);
  assert.equal(p.exec.casting,'看面孔与关系感');
  assert.equal(p.exec.camera,'景别各有用途');
  assert.match(p.verifying,/责任方|剪辑/);
  assert.match(p.risk,/舒适|待确认/);
  assert.ok(!p.exec.sound,'没返回的项保持空白，不编内容');
});

test('逐页讲稿会跟着 PPT 走：planDeck 的每页都带上备注',()=>{
  const h=harness();
  CR.fields(h.topic).outline='妈妈把没寄出的信读给女儿听';
  h.topic.pitch={notes:['第1页 约30秒：先说这一句','第2页 约40秒：再说怎么拍'],exec:{}};
  const plan=P.planDeck(h.topic,'topic',[],'decision');
  assert.equal(plan.slides[0].notes,'第1页 约30秒：先说这一句','第1页要带备注');
  assert.equal(plan.slides[1].notes,'第2页 约40秒：再说怎么拍');
  assert.equal(plan.slides.some(s=>s.notes===undefined),true,'没写讲稿的页不要硬塞备注');
});

test('主题句：有独立字段与 5 句候选，点一句就写进寓意',async()=>{
  const h=harness({lines:['痛也进庆祝','爱要过得去','把经历带上台'],tension:'两种经历都能被请进来'});
  h.topic.acts={建立:'读信',推进:'名字不是自己',转折:'明白写信的人',落点:'把信折好'};
  await h.context.__faction('creative-flow-theme',{dataset:{id:'t1'}},h.topic);   /* 主题句属于 flow，不是 report 段 */
  assert.deepEqual(Array.from(h.topic.themeLines),['痛也进庆祝','爱要过得去','把经历带上台']);
  assert.equal(h.topic.themeTension,'两种经历都能被请进来');
  await h.context.__faction('creative-flow-theme-pick',{dataset:{id:'t1',line:'痛也进庆祝'}},h.topic);
  assert.equal(CR.fields(h.topic).meaning,'痛也进庆祝','点候选就写进寓意字段');
});

test('讲稿要进最终 PPT 的备注页（buildDeck 不能把备注覆盖掉）',async()=>{
  const PptxGenJS=require('pptxgenjs'),JSZip=require('jszip');
  const C=require('../studio-core');
  const t=C.topic('备注落盘测试');
  Object.assign(t.quick.fields,{outline:'把放焰火拆成握拳—张开—仰头',meaning:'握紧是经历，松开是庆祝',description:'不同职业的人重复同一动作',dialogue:'你的手，就是你的焰火',atmosphere:'黑白高反差',camera:'顶光为主',script:'【建立】握拳\n【推进】张开五指\n【转折】仰头\n【落点】群体同步'});
  t.report={decisions:'确认是否采用黑白影调',pending:'投放平台待确认'};
  const notes=Array.from({length:12},(_,i)=>`第${i+1}页 约40秒：这是第${i+1}页的讲稿`);
  t.pitch={notes,exec:{}};
  const ppt=await P.buildDeck(PptxGenJS,t,'topic',[],()=>null,'decision');
  const zip=await JSZip.loadAsync(await ppt.write({outputType:'nodebuffer'}));
  const names=Object.keys(zip.files).filter(n=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
  const xml=(await Promise.all(names.map(n=>zip.file(n).async('string')))).join('\n');
  for(let i=0;i<12;i++)assert.ok(xml.includes(notes[i]),`第 ${i+1} 页备注丢了：${notes[i]}`);
});

test('没有讲稿时不许塞假备注',async()=>{
  const PptxGenJS=require('pptxgenjs'),JSZip=require('jszip');
  const C=require('../studio-core');
  const t=C.topic('无讲稿测试');
  Object.assign(t.quick.fields,{outline:'x',meaning:'y',description:'z',dialogue:'d'});
  t.report={decisions:'a',pending:'b'};
  const ppt=await P.buildDeck(PptxGenJS,t,'topic',[],()=>null,'decision');
  const zip=await JSZip.loadAsync(await ppt.write({outputType:'nodebuffer'}));
  const names=Object.keys(zip.files).filter(n=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n));
  const xml=names.length?(await Promise.all(names.map(n=>zip.file(n).async('string')))).join('\n'):'';
  assert.ok(!/约\d+秒/.test(xml),'没生成讲稿时不该出现讲稿样式的备注');
});

test('附录三件：讲述顺序＋拍摄清单＋答疑口径，都能就地改',async()=>{
  const h=harness({runway:[{block:'开场',pages:'封面',minutes:1,what:'先说这一句'},{block:'创意与结构',pages:'01–06 页',minutes:3,what:'讲主张与四幕'},{block:'制作与确认',pages:'18–20 页',minutes:3,what:'定确认项'}],
    shotlist:[{code:'F01',purpose:'手部细节',note:'留动作前后余量'},{code:'F02',purpose:'完整动作',note:'别切碎'}],
    qa:[{q:'为什么用黑白？',a:'让轮廓与表情承担重点，灰阶要联测'},{q:'没有情节观众怎么进入？',a:'靠意象与情绪递进'},{q:'预算减半怎么办？',a:'先减组合数量，保住排练与联调'}]});
  h.context.route.creativeTab='report4';
  let html=h.context.__rpanel(h.topic);
  assert.match(html,/生成附录三件（1 次文字调用）/);
  await h.context.__raction('creative-report-appendix',{dataset:{id:'t1'}},h.topic);
  const ax=h.context.__pitch(h.topic).appendix;
  assert.equal(ax.runway.length,3);assert.equal(ax.shotlist.length,2);assert.equal(ax.qa.length,3);
  html=h.context.__rpanel(h.topic);
  assert.match(html,/汇报方式（讲述顺序 · 合计约 7 分钟）/);
  assert.match(html,/拟定拍摄清单/);assert.match(html,/现场答疑口径/);
  assert.match(html,/topics\.0\.pitch\.appendix\.runway\.0\.what/,'讲述顺序要就地可改');
  assert.match(html,/为什么用黑白？/);
});

test('附录不完整时报错并保留原内容',async()=>{
  const h=harness({runway:[{block:'开场',minutes:1}],shotlist:[],qa:[{q:'问',a:'答'}]});
  h.topic.pitch={notes:[],exec:{},appendix:{runway:[{block:'旧顺序',pages:'旧',minutes:2,what:'旧'}],shotlist:[],qa:[]}};
  await h.context.__raction('creative-report-appendix',{dataset:{id:'t1'}},h.topic);
  assert.equal(h.context.__pitch(h.topic).appendix.runway[0].block,'旧顺序','不合格结果不许覆盖');
  assert.match(String(h.topic.error||''),/不完整/);
});

test('附录提示词要求给页范围与分钟数，并禁空话词',()=>{
  const h=harness();
  const p=h.context.__axprompt(h.topic);
  assert.match(p,/runway：把这场汇报排成 \d+ 分钟左右/);
  assert.match(p,/minutes（整数分钟）/);
  assert.match(p,/qa：现场最可能被追问的 5–6 个问题/);
  assert.match(p,/闭环、赋能、打造/);
});
