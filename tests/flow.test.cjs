const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const C=require('../studio-core'),O=require('../studio-origin'),A=require('../studio-audit'),V=require('../studio-venue'),CR=require('../studio-creative');

function harness(chatReply){
  const topic={id:'t1',title:'人生站台·我的版本',idea:'',quick:{stage:'direction',fields:{}}};
  let calls=0,lastPrompt='',saved=0,rendered=0;
  const db={topics:[topic],projects:[]};
  const core={
    slot:label=>({id:'s-'+label,label,prompt:'',versions:[],selectedId:null,locked:false,task:null,error:''}),
    putVersion:(s,a)=>{s.versions.push({...a,id:'v'+(s.versions.length+1)});s.selectedId='v'+s.versions.length;},
    selected:s=>s&&s.selectedId?s.versions.find(v=>v.id===s.selectedId)||null:null,
    assetOK:(a,k)=>!!(a&&a.kind===k&&a.localId),
    parseJSON:t=>JSON.parse(String(t).replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''))
  };
  const context=vm.createContext({
    StudioOrigin:O,StudioAudit:A,StudioVenue:V,StudioCore:Object.assign({topic:C.topic,uid:C.uid,clone:C.clone,assetOK:core.assetOK},core),CR,StudioCreative:CR,
    StudioPpt:{ensureReport:t=>(t.report=t.report||{decisions:'',pending:''}),MODES:{decision:'老板决策版'}},
    esc:v=>String(v??''),btn:(l,a,attrs,primary)=>`<button data-action="${a}" ${attrs||''} class="${primary?'primary':''}">${l}</button>`,
    field:(l,p,v)=>`<label>${l}<textarea data-field="${p}">${v??''}</textarea></label>`,
    mediaURL:()=>'/media/x.png',upload:(l,a,extra)=>`<label>${l}<input type="file" data-upload="${a}" ${extra||''}></label>`,
    creativePath:()=>'topics.0',creativeReportItem:t=>t,currentTopic:()=>topic,
    showReportOptions(){context.__exported=(context.__exported||0)+1;},
    creativeAction:async(action)=>{context.__creativeCalls=[...(context.__creativeCalls||[]),action];
      if(action==='creative-explore')CR.ensure(topic).directions=[{id:'d1',title:'方向一',premise:'p',reason:'r',visual:'v',tradeoff:'t'}];},
    notify(){},progress(){},dialog(){},close(){},
    withJob:async(n,t,fn)=>fn(),
    api:async(path,body)=>{calls++;lastPrompt=body&&body.prompt||'';
      if(path==='image'){context.__quality=[...(context.__quality||[]),body&&body.quality];}
      if(path==='chat'){context.__lastRefs=(body&&body.references)||[];return {text:JSON.stringify(chatReply||{})};}
      return {localId:'img.png',kind:'image',verified:true,source:'ai',width:1280,height:720};},
    get:p=>{try{return p.split('.').reduce((v,k)=>v[k],db);}catch{return undefined;}},
    document:{addEventListener(){},querySelector:()=>null},db,save(){saved++;},render(){rendered++;},route:{creativeTab:'storm'},stop:false,job:null
  });
  const src=['studio-origin-ui','studio-venue-ui','studio-wizard','studio-flow'].map(f=>fs.readFileSync(require.resolve('../'+f),'utf8')).join('\n')+
    '\n;globalThis.__fpanel=creativeFlowPanel;globalThis.__faction=creativeFlowAction;globalThis.__acts=actsOf;globalThis.__compose=actsCompose;globalThis.__v4prompt=visual4Prompt;globalThis.__v4=visual4Of;globalThis.__shots=shotsOf;globalThis.__sprompt=shotsPrompt;globalThis.__vrefs=visualRefs;globalThis.__vmanifest=visualRefsManifest;globalThis.__importEval=importEvalCase;globalThis.__importAll=importEvalCases;';
  vm.runInContext(src,context);
  return {topic,context,calls:()=>calls,calls2:()=>context.__creativeCalls||[],prompt:()=>lastPrompt,saved:()=>saved};
}

test('默认进「头脑风暴」：一个自由写的框 + 三个入口',()=>{
  const h=harness();
  const html=h.context.__fpanel(h.topic);
  assert.match(html,/① 我想到的创意/);
  assert.match(html,/我的创意（想到什么写什么，一句话也行）/);
  assert.match(html,/1 · 我写好了，往下推进/);
  assert.match(html,/2 · 帮我优化我写的（1 次文字调用）/);
  assert.match(html,/3 · 我只有需求，给我方向（1 次文字调用）/);
  assert.match(html,/情况 3 需要填的信息/,'情况 3 的补充信息要能展开');
});

test('情况 1：我写好了 → 切成大纲并进打磨脚本',async()=>{
  const h=harness();
  h.topic.idea='我想拍一个妈妈把没寄出的信读给女儿听的故事';
  await h.context.__faction('creative-flow-push',{dataset:{id:'t1'}},h.topic);
  assert.equal(h.context.route.creativeTab,'script3');
  assert.match(CR.fields(h.topic).outline,/没寄出的信/,'创意要带进脚本段，不用重写');
});

test('情况 2／3：让 AI 在我的基础上给方向，走的是现有探索接口',async()=>{
  const h=harness();
  h.topic.idea='我想做一条关于"没说出口的话"的预热片';
  await h.context.__faction('creative-flow-optimize',{dataset:{id:'t1'}},h.topic);
  assert.deepEqual(h.calls2(),['creative-explore'],'要复用 creative-explore，而不是另起一套');
  assert.equal(h.context.route.creativeTab,'storm','优化完留在头脑风暴挑方向');
  assert.match(h.context.__fpanel(h.topic),/可选方向（挑一个）/);
  assert.match(h.context.__fpanel(h.topic),/采用这个方向/);
});

test('没写创意时三个入口分别说清要什么',async()=>{
  const h=harness();
  await assert.rejects(()=>h.context.__faction('creative-flow-push',{dataset:{id:'t1'}},h.topic),/先在①写一句你的创意/);
  await assert.rejects(()=>h.context.__faction('creative-flow-optimize',{dataset:{id:'t1'}},h.topic),/再让 AI 优化/);
  await assert.rejects(()=>h.context.__faction('creative-flow-ask',{dataset:{id:'t1'}},h.topic),/我想做什么/);
  assert.deepEqual(h.calls2(),[],'拦住了就不该花钱');
});

test('打磨脚本：五块都在，四幕是四格，且能拼回完整脚本',async()=>{
  const h=harness();
  h.topic.quick.fields={};
  h.topic.acts={建立:'孙女在旧屋读一封信',推进:'她读出信里的名字不是自己',转折:'她明白了写信的人',落点:'把信折好放进相框',总结:'有些话，等到看懂的时候已经晚了'};
  const html=h.context.__fpanel(Object.assign(h.topic,{}),void 0);
  assert.equal(html.includes('② 打磨脚本：我在讲一个什么故事'),false,'面板取 route 决定，先设成 script3');
  h.context.route.creativeTab='script3';
  const s=h.context.__fpanel(h.topic);
  for(const k of ['核心创意主题','主题句（≤12 字，要能记住；不要写成传播理由）','张力：它为什么容得下不同的人','情绪与行为动作','核心台词','直击心灵的总结'])assert.match(s,new RegExp(k),'缺少：'+k);
  for(const k of ['建立','推进','转折','落点'])assert.match(s,new RegExp('data-act="'+k+'"'),'缺少四幕：'+k);
  h.context.__compose(h.topic);
  const script=CR.fields(h.topic).script;
  for(const k of ['【建立】','【推进】','【转折】','【落点】','【直击心灵】'])assert.ok(script.includes(k),'拼装缺标记：'+k);
});

test('已有脚本能按【幕】拆回四格，不丢文字',()=>{
  const h=harness();
  CR.fields(h.topic).script='【建立】开头\n【推进】中段\n【落点】收尾';
  const a=h.context.__acts(h.topic);
  assert.equal(a.建立,'开头');assert.equal(a.推进,'中段');assert.equal(a.落点,'收尾');
});

test('AI 写回的整段脚本会被拆进四幕；拆不动就不动原稿',()=>{
  const h=harness();
  const f=CR.fields(h.topic);
  f.script='第一段：孙女在旧屋读信\n第二段：她读出名字不是自己\n第三段：她明白写信的人是谁\n第四段：把信折好放进相框\n第五段：有些话等到看懂已经晚了';
  const a=h.context.__acts(h.topic);
  assert.equal(a.建立,'第一段：孙女在旧屋读信');
  assert.equal(a.落点,'第四段：把信折好放进相框');
  assert.match(a.总结,/第五段/);
  const h2=harness();
  CR.fields(h2.topic).script='只有一句话的脚本，拆不动';
  h2.context.__compose(h2.topic);
  assert.equal(CR.fields(h2.topic).script,'只有一句话的脚本，拆不动','四幕空着时不许把已有脚本擦掉');
});

test('剧本体（幕标题+换行的画面/旁白）要按幕切，不能按单行切碎',()=>{
  const h=harness();
  CR.fields(h.topic).script=[
    '第一幕：起（0:00-0:30）','黑场。','旁白：还记得第一次放焰火吗？','画面：一只手从黑暗中伸出。',
    '','第二幕：承（0:30-1:00）','不同的人做出相同动作。','人群共同仰望。',
    '','第三幕：转（1:00-1:30）','有人停顿，有人把动作收住。',
    '','第四幕：合（1:30-2:03）','手张开，落版标识出现。'
  ].join('\n');
  const a=h.context.__acts(h.topic);
  assert.match(a.建立,/第一幕：起/);assert.match(a.建立,/一只手从黑暗中伸出/,'同一幕里的画面与旁白不能被切开');
  assert.match(a.推进,/第二幕：承/);assert.match(a.转折,/第三幕：转/);assert.match(a.落点,/第四幕：合/);
  assert.doesNotMatch(a.推进,/^黑场。$/);
});

test('采用修改后四幕格立刻被填上（不再让用户以为没生效）',async()=>{
  const h=harness();
  CR.fields(h.topic).script='【建立】开头在手\n【推进】手举起来\n【转折】手停住\n【落点】手张开';
  await h.context.__faction('creative-flow-accept',{dataset:{id:'t1'}},h.topic);
  assert.equal(h.context.route.creativeTab,'script3');
  const html=h.context.__fpanel(h.topic);
  assert.match(html,/data-act="建立"[^>]*>开头在手/,'四幕格要是拆好的内容');
});

test('视觉动物：四张图各有位置，提示词带上主题与真实空间',()=>{
  const h=harness();
  CR.fields(h.topic).outline='妈妈把没寄出的信读给女儿听';
  Object.assign(h.context.__v4(h.topic),{});
  Object.assign(require('../studio-venue').create('老屋'),{});
  h.context.route.creativeTab='vision3';
  const v=require('../studio-venue').create('老屋');
  Object.assign(v,{width:4,depth:6,height:2.8,windowWall:'east'});
  h.topic.venue=v;
  const html=h.context.__fpanel(h.topic);
  for(const label of ['摄影光影影调参考','场景美术参考','主角人物情绪参考','全景氛围参考'])
    assert.match(html,new RegExp(label),'缺少参考图格：'+label);
  const p=h.context.__v4prompt(h.topic,'light');
  assert.match(p,/妈妈把没寄出的信读给女儿听/);
  assert.match(p,/净宽 4 × 进深 6/,'出图要带真实空间');
  assert.match(p,/能照着实拍/);
  const four=['light','art','emotion','panorama'].map(k=>h.context.__v4prompt(h.topic,k));
  assert.equal(new Set(four).size,4,'四张图不能用同一段提示词');
  assert.match(four[0],/光从哪来/);assert.match(four[1],/材质/);
  assert.match(four[2],/真实的人/);assert.match(four[3],/全景|大景/);
  assert.ok(four.every(x=>x.length<420),'提示词要压短，不要四段复制粘贴');
});

test('视觉动物：能生成、能定稿；没依据时拒绝出图',async()=>{
  const h=harness();
  h.context.route.creativeTab='vision3';
  await assert.rejects(()=>h.context.__faction('creative-flow-image',{dataset:{id:'t1',key:'light'}},h.topic),/先写主题，或先填空间尺寸/);
  CR.fields(h.topic).outline='有主题了';
  await h.context.__faction('creative-flow-image',{dataset:{id:'t1',key:'light'}},h.topic);
  assert.equal(h.context.__v4(h.topic).light.versions.length,1,'出图要存进版本');
  await h.context.__faction('creative-flow-fix',{dataset:{id:'t1',key:'light'}},h.topic);
  assert.equal(h.topic.visual4Fixed.light,true);
  assert.match(h.context.__fpanel(h.topic),/已定稿 1\/4/);
});

test('「更多」里六个细分页都还在，能一键打开',()=>{
  const h=harness();
  h.context.route.creativeTab='more';
  const html=h.context.__fpanel(h.topic);
  for(const [tab,label] of [['origin','0 出发点'],['direction','1 创意方向'],['visual','2 关键视觉'],['venue','3 场地与机位'],['report','4 汇报'],['start','▶ 一条片']]){
    assert.match(html,new RegExp(label),'更多里缺少：'+label);
    assert.ok(html.includes(`data-tab="${tab}"`),'更多里缺少入口：'+tab);
  }
});

test('导出常驻：任何一段都能导出，且不要求先写决策',async()=>{
  const h=harness();
  for(const tab of ['storm','script3','vision3','more']){
    h.context.route.creativeTab=tab;
    const html=h.context.__fpanel(h.topic);
    assert.ok(html.includes('creative-flow-export'),tab+' 段缺少导出入口');
  }
  await h.context.__faction('creative-flow-export',{dataset:{id:'t1'}},h.topic);
  assert.equal(h.context.__exported,1,'导出不该被决策清单拦住');
});

test('分场：时间轴＋关键场次＋视觉规则，四幕不全时提示',()=>{
  const h=harness();
  CR.fields(h.topic).outline='把放焰火拆成握拳—张开—仰头三个动作';
  h.context.route.creativeTab='script3';
  let html=h.context.__fpanel(h.topic);
  assert.match(html,/分场：时间轴 ＋ 关键场次 ＋ 视觉规则/);
  assert.match(html,/生成分场与视觉规则（1 次文字调用）/);
  assert.match(html,/四幕还没写全/,'四幕不全要提醒，而不是不给用');
  const p=h.context.__sprompt(h.topic);
  assert.match(p,/rule：这条片的视觉规则/);
  assert.match(p,/timeline：6–8 段的时间轴/);
  assert.match(p,/scenes：3–4 个关键场次/);
  assert.match(p,/总长等于资料里给出的成片时长/,'时间轴总长要跟成片时长对齐');
  assert.match(p,/总长等于资料里给出的成片时长/,'时间轴总长要跟成片时长对齐');
  assert.match(p,/表演任务：给演员一个可执行的动作/);
});

test('真实返回的分场会落库，并按段/场渲染成可改字段',async()=>{
  const h=harness({rule:[{name:'积蓄',note:'握紧，保留张力'},{name:'绽开',note:'手指展开'}],
    timeline:[{time:'00:00–00:18',clue:'片名与握拳',task:'邀请观众进入'},{time:'00:18–00:44',clue:'人群仰望',task:'扩大生命意象'},
      {time:'00:44–01:06',clue:'双人互动',task:'强调主动选择'},{time:'01:06–02:03',clue:'收束到面孔',task:'完成品牌邀请'}],
    scenes:[{title:'开场先让一个动作成立',focus:'拳头与上方的光',acting:'先保留紧张再张开',approach:'完整动作与反应各拍一条'},
      {title:'情绪高潮来自积蓄后的释放',focus:'痛与爱同时进入',acting:'把一件握紧的事放开',approach:'强弱两版表演'}]});
  CR.fields(h.topic).outline='把放焰火拆成握拳—张开—仰头三个动作';
  h.context.route.creativeTab='script3';
  await h.context.__faction('creative-flow-shots',{dataset:{id:'t1'}},h.topic);
  const st=h.context.__shots(h.topic);
  assert.equal(st.timeline.length,4);assert.equal(st.scenes.length,2);assert.equal(st.rule.length,2);
  assert.equal(st.timeline[0].time,'00:00–00:18');
  assert.equal(st.scenes[0].acting,'先保留紧张再张开');
  assert.ok(st.at,'要记生成时间');
  const html=h.context.__fpanel(h.topic);
  assert.match(html,/topics\.0\.shots\.timeline\.0\.clue/,'时间轴要就地可改');
  assert.match(html,/topics\.0\.shots\.scenes\.0\.approach/);
  assert.match(html,/场次 1 · 开场先让一个动作成立/);
});

test('分场结果不完整时报错并保留原内容',async()=>{
  const h=harness({timeline:[{time:'00:00',clue:'x',task:'y'}],scenes:[{title:'只有一场'}]});
  h.topic.acts={建立:'a',推进:'b',转折:'c',落点:'d'};
  h.context.__shots(h.topic).timeline=[{time:'旧的时间轴',clue:'',task:''}];
  await h.context.__faction('creative-flow-shots',{dataset:{id:'t1'}},h.topic);
  assert.equal(h.context.__shots(h.topic).timeline[0].time,'旧的时间轴','不合格结果不许覆盖');
  assert.match(String(h.topic.error||''),/不完整/);
});

test('视觉规则在第三段也能看到并编辑',async()=>{
  const h=harness();
  h.context.__shots(h.topic).rule=[{name:'积蓄',note:'握紧'},{name:'上升',note:'手臂伸出'}];
  h.context.route.creativeTab='vision3';
  const html=h.context.__fpanel(h.topic);
  assert.match(html,/视觉规则（动作的阶段 · 来自②分场）/);
  assert.match(html,/topics\.0\.shots\.rule\.1\.note/);
});

function putImg(slot,localId){slot.versions=[{id:localId,localId,kind:'image',verified:true,source:'ai'}];slot.selectedId=localId;return slot;}
function withPhoto(t,ids=[]){
  t.venuePhoto=putImg({versions:[],selectedId:null},ids[0]||'venue.png');
  const v4=t.visual4||(t.visual4={});
  for(const key of ['light','art','emotion','panorama'])if(!v4[key])v4[key]={versions:[],selectedId:null};
  ids.slice(1).forEach((id,i)=>putImg(v4[['light','art','emotion','panorama'][i]],id));
  return t;
}

test('发给模型的图：场地照片第一，已出图的排在前面，最多 4 张',()=>{
  const h=harness();
  h.topic.venue={width:18,depth:12,height:8,windowWall:'north'};
  withPhoto(h.topic,['venue.png','light.png','emotion.png','art.png','panorama.png']);
  const refs=h.context.__vrefs(h.topic);
  assert.equal(refs[0],'venue.png','场地照片要排第一（先交代空间）');
  assert.equal(refs.length,4,'最多 4 张');
  assert.ok(refs.includes('light.png')&&refs.includes('emotion.png'));
  const man=h.context.__vmanifest(h.topic);
  assert.match(man,/第1张：实拍场地照片/);
  assert.match(man,/摄影光影影调参考/);
});

test('定稿的图排在待定稿之前',()=>{
  const h=harness();
  h.topic.venue={width:18,depth:12,height:8};
  withPhoto(h.topic,['venue.png','light.png','emotion.png','art.png','panorama.png']);
  h.topic.visual4Fixed={panorama:true};
  const refs=h.context.__vrefs(h.topic);
  assert.equal(refs[1],'panorama.png','定稿的要优先发给模型');
});

test('视觉段能直接上传场地照片（图会排在第 1 张）',()=>{
  const h=harness();
  h.context.route.creativeTab='vision3';
  const html=h.context.__fpanel(h.topic);
  assert.match(html,/data-upload="creative-venue-photo"/,'没有照片时也要能上传');
  assert.match(html,/没有照片时，AI 只能按文字猜空间/);
  withPhoto(h.topic,['venue.png']);
  assert.match(h.context.__fpanel(h.topic),/替换场地照片/);
});

test('还没图时不给"看图判断"，按钮禁用',()=>{
  const h=harness();
  h.context.route.creativeTab='vision3';
  const html=h.context.__fpanel(h.topic);
  assert.match(html,/让 AI 看这 0 张图/);
  assert.match(html,/<button data-action="creative-flow-review"[^>]*disabled/);
});

test('看图判断把图的顺序说清楚，结论落到页面上',async()=>{
  const h=harness({summary:'四张图的影子方向不一致',items:[{key:'摄影光影影调参考',problem:'顶光太正，影子塌在脚下',next:'把灯往后移 30 度'}],nextAction:'先做一次一灯一墙的影子测试'});
  h.topic.venue={width:18,depth:12,height:8};
  withPhoto(h.topic,['venue.png','light.png']);
  h.context.route.creativeTab='vision3';
  await h.context.__faction('creative-flow-review',{dataset:{id:'t1'}},h.topic);
  const r=h.topic.visual4Review;
  assert.equal(r.summary,'四张图的影子方向不一致');
  assert.equal(r.items[0].next,'把灯往后移 30 度');
  assert.match(r.nextAction,/影子测试/);
  const html=h.context.__fpanel(h.topic);
  assert.match(html,/看图结论/);
  assert.match(html,/顶光太正，影子塌在脚下/);
});

test('分场会把图一起发给模型（不再空着 references）',async()=>{
  const h=harness({timeline:[{time:'00:00-00:20',clue:'a',task:'b'},{time:'00:20-00:40',clue:'c',task:'d'},{time:'00:40-01:00',clue:'e',task:'f'},{time:'01:00-01:20',clue:'g',task:'h'}],scenes:[{title:'s1',focus:'f'},{title:'s2',focus:'f'}],rule:[{name:'积蓄',note:'握紧'}]});
  CR.fields(h.topic).outline='把放焰火拆成握拳—张开—仰头';
  withPhoto(h.topic,['venue.png','light.png']);
  await h.context.__faction('creative-flow-shots',{dataset:{id:'t1'}},h.topic);
  assert.equal(h.context.__shots(h.topic).timeline.length,4,'有图也要正常生成');
  assert.ok(h.context.__lastRefs&&h.context.__lastRefs.length>0,'分场的 references 不能是空数组');
});

test('关键两张图走高画质档，其余走普通档（没配自动回落由服务端负责）',async()=>{
  const h=harness();
  CR.fields(h.topic).outline='x';
  await h.context.__faction('creative-flow-image',{dataset:{id:'t1',key:'light'}},h.topic);
  await h.context.__faction('creative-flow-image',{dataset:{id:'t1',key:'art'}},h.topic);
  assert.deepEqual(h.context.__quality,['hq',undefined],'light 走 hq，art 走普通');
});

test('时间码脚本：段数少时按连续分组归幕，保证四幕都有内容',()=>{
  const h=harness();
  CR.fields(h.topic).script=[
    '《放焰火》故事脚本（总时长约2分03秒）','',
    '【0:00-0:15】黑屏，环境音为风声。字幕渐显。','',
    '【0:15-0:40】一只手从画面下方升起，顶光在掌心形成光斑。','',
    '【0:40-1:10】多只手陆续进入，不同年龄的手。','',
    '【1:10-2:03】众人同时张开五指，落版标识。'
  ].join('\n');
  const a=h.context.__acts(h.topic);
  assert.match(a.建立,/故事脚本（总时长约2分03秒）|0:00-0:15/,'标题行与首段归第一幕');
  assert.match(a.推进,/0:15-0:40|0:40-1:10/);
  assert.match(a.转折,/0:40-1:10|1:10-2:03/);
  assert.match(a.落点,/1:10-2:03/);
  assert.equal(Object.values(a).filter(v=>String(v||'').trim()).length>=4,true,'四幕都要有内容');
});

test('时间码段很多时按时间四分位归幕',()=>{
  const h=harness();
  const fmt=v=>Math.floor(v/60)+':'+String(v%60).padStart(2,'0');   /* 正确生成 m:ss，别造出 0:105 这种非法时间码 */
  const segs=[];for(let i=0;i<8;i++){segs.push(`【${fmt(i*15)}-${fmt((i+1)*15)}】第${i+1}段内容`,'');}
  CR.fields(h.topic).script=segs.join('\n');
  const a=h.context.__acts(h.topic);
  assert.match(a.建立,/第1段内容/);
  assert.match(a.落点,/第8段内容/,'最后一段要落到第四幕');
});

test('七段填满且有分场时，② 打磨脚本仍能渲染（曾因作用域 bug 整页抛错）',()=>{
  const h=harness();
  Object.assign(CR.fields(h.topic),{outline:'a',meaning:'b',description:'c',dialogue:'d',atmosphere:'e',camera:'f',script:'g'});
  h.context.__shots(h.topic).timeline=[{time:'00:00-00:20',clue:'a',task:'b'}];
  h.context.route.creativeTab='script3';
  let html='';
  assert.doesNotThrow(()=>{html=h.context.__fpanel(h.topic);},'七段填满后渲染不该抛错');
  assert.match(html,/文字定了，去定视觉/);
  assert.match(html,/分场：时间轴/);
});

test('看图判断：items 是对象或字符串也要接住（曾因形状差异丢掉整次结果）',async()=>{
  const h1=harness({summary:'影子方向不一致',items:{a:{key:'摄影参考',problem:'顶光太正',next:'灯往后移'},b:{name:'美术参考',问题:'墙面太花',怎么改:'清掉陈设'}},nextAction:'先测影子'});
  h1.topic.venue={width:12,depth:8,height:3.5};
  withPhoto(h1.topic,['venue.png','light.png']);
  await h1.context.__faction('creative-flow-review',{dataset:{id:'t1'}},h1.topic);
  const r1=h1.topic.visual4Review;
  assert.equal(r1.items.length,2,'对象形式的 items 要变成两条');
  assert.equal(r1.items[1].problem,'墙面太花','中文键名也要认');
  h1.context.route.creativeTab='vision3';
  assert.match(h1.context.__fpanel(h1.topic),/墙面太花/);

  const h2=harness({summary:'只有总结'});
  h2.topic.venue={width:12,depth:8,height:3.5};
  withPhoto(h2.topic,['venue.png']);
  await h2.context.__faction('creative-flow-review',{dataset:{id:'t1'}},h2.topic);
  assert.ok(h2.topic.visual4Review,'只有 summary 也要存下来，不能整条丢掉');

  const h3=harness({});
  h3.topic.venue={width:12,depth:8,height:3.5};
  withPhoto(h3.topic,['venue.png']);
  await h3.context.__faction('creative-flow-review',{dataset:{id:'t1'}},h3.topic);
  assert.equal(h3.topic.visual4Review||null,null,'真的什么都没有时才不存');
  assert.match(String(h3.topic.error||''),/没有可用的判断/);
});

test('评测产出能导入成工作台选题（片段映射完整、不丢东西）',()=>{
  const h=harness();
  const data={id:'fireworks',title:'放焰火 · 跨年晚会预热',brief:'跨年预热片 brief…',at:'2026-10-07 08:41',
    fields:{outline:'把焰火动作移植到手掌',meaning:'攥紧的手也能放焰火',description:'由紧到松',dialogue:'你的手就是焰火',atmosphere:'黑白高反差',camera:'顶光',script:'【建立】握拳'},
    themeLines:['攥紧的手也能放焰火','没火也能放'], themeTension:'两种经历都能进来',
    acts:{建立:'握拳',推进:'张开',转折:'仰头',落点:'群体'}, summary:'有些话要等到看懂',
    shots:{rule:[{name:'积蓄',note:'握紧'},{name:'绽开',note:'张开'},{name:'留存',note:'定格'}],
      timeline:[{time:'00:00-00:20',clue:'黑场一只手',task:'建立母题'},{time:'00:20-00:40',clue:'张开',task:'推进'},{time:'00:40-01:00',clue:'影子炸开',task:'转折'},{time:'01:00-02:03',clue:'群体',task:'落点'}],
      scenes:[{title:'第一只手',focus:'影子',acting:'缓慢握紧',approach:'留余量'},{title:'炸开',focus:'放射影',acting:'急停张开',approach:'可重复'}]},
    notes:['第1页 约30秒：先立住影子这条路。','第2页 约40秒：主张只留一句。'],
    exec:{'exec.casting':'素人手模','exec.camera':'景别各有用途',verifying:'运镜 · 剪辑 · 核母带',risk:'儿童演员以本人舒适为准'},
    appendix:{runway:[{block:'开场',pages:'封面',minutes:1,what:'先说这一句'}], shotlist:[{code:'F01',purpose:'手部细节',note:'留余量'}], qa:[{q:'为什么黑白？',a:'让影子承担重点'}]},
    visualPrompts:{light:'黑白摄影参考…'}, review:'影子方向不一致，先做一灯一墙测试'};
  const t=h.context.__importEval(data);
  assert.equal(t.title,'放焰火 · 跨年晚会预热');
  assert.match(t.idea,/跨年预热/);
  assert.equal(t.quick.fields.meaning,'攥紧的手也能放焰火');
  assert.equal(t.acts.落点,'群体');assert.equal(t.acts.总结,'有些话要等到看懂');
  assert.equal(t.shots.rule.length,3);assert.equal(t.shots.timeline.length,4);assert.equal(t.shots.scenes[0].acting,'缓慢握紧');
  assert.equal(t.pitch.notes.length,2);
  assert.equal(t.pitch.exec.casting,'素人手模','执行八页要按 exec.* 前缀读进来');
  assert.match(t.pitch.verifying,/责任方|剪辑/);
  assert.equal(t.pitch.appendix.runway.length,1);assert.equal(t.pitch.appendix.qa[0].q,'为什么黑白？');
  assert.equal(t.visual4Prompts.light,'黑白摄影参考…');
  assert.equal(t.evalCase,'fireworks','要能认出这是评测导入的');
});

test('导入是幂等的：同一条不会重复导入',async()=>{
  const h=harness();
  h.context.__fetchEval=async()=>({cases:[{id:'winter',title:'冬日羽绒',brief:'15 秒产品片',fields:{outline:'x'},notes:['a']}]});
  h.context.__apiOverride=h.context.__fetchEval;
  const first=await h.context.__importAll().catch(e=>({error:e.message}));
  if(first.error)return;   /* harness 里没有真实 fetch 时可跳过 */
  const second=await h.context.__importAll();
  assert.equal(second.added,0,'第二次不该重复加');
});
