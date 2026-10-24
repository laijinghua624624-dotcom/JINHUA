// 出发点面板的浏览器验收：独立配置、模拟 /api/chat、零付费调用、不碰真实数据。
// 运行：npm i -D playwright（已有 Chrome 时加 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1）后
//       node tests/origin-browser.cjs
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require('playwright-core'));}   /* 装哪个都行 */const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

const BASE=process.env.JINHUA_URL||'http://127.0.0.1:8787';
const SHOTS=process.env.JINHUA_SHOT_DIR||path.join(os.tmpdir(),'jinhua-origin-shots');
const UNIT={tension:{sideA:'想在换季时说出那句话，却总开不了口',sideB:'老板看不出与专场的关联就会否掉',whyBoth:'观众洞察与上次被否的原因同时成立',basis:['m2','m5']},
  proposition:'用一扇朝东的窗，拍妈妈把没寄出的信读给女儿听',basis:['m1','m4'],
  objections:[{question:'这不还是文艺片吗，跟我们专场有什么关系？',response:'片尾用同一封信的收件人指向专场主角'},{question:'一个房间一个演员，能撑起预热片吗？',response:'三段都用同一扇窗的光变化'}],
  fallback:'砍掉女儿角色，只留妈妈和窗，主张仍然成立',
  frames:[{name:'写信',stage:'建立',venue:'房间书桌，靠窗约2米',camera:'固定中景，略低于视线',light:'东窗侧逆光，9:00-10:00',people:'妈妈1人',props:['信纸','钢笔','旧台灯'],seconds:8,basis:['m4']},
    {name:'读信',stage:'推进',venue:'同一房间，窗边站立',camera:'近景，缓慢推近',light:'侧逆光转正面柔光',people:'妈妈1人',props:['信纸'],seconds:8,basis:['m4']},
    {name:'收信',stage:'落点',venue:'窗边，窗外过曝',camera:'过肩特写',light:'正对窗，面部压暗',people:'妈妈1人',props:['信封','邮票'],seconds:8,basis:['m2']}],
  cost:{days:'1天',crew:'4人',budget:'低',rights:'待签'},assumptionRisk:'若房间进深不足，第三人机位改手持',notes:'换季节点'};
const MATERIALS=[
  ['fact','老板要求：双十一前两周发，为主体专场预热，要一条能被记住的片子。','需求会'],
  ['insight','换季时最容易想起没来得及说的话；评论区高频出现想给爸妈打电话但不知道说什么。','评论区抽样'],
  ['mechanism','参考《人生站台》：用交通工具做时间容器，结尾用真实照片把情绪交回观众。','反推库'],
  ['venue','老式居民楼房间，约 4×6 米，一扇朝东窗，上午 9-11 点侧逆光。','勘景（约数）'],
  ['history','上次同类创意被否：老板说太文艺，看不出和专场有什么关系。','10月汇报纪要']
];

(async()=>{
  fs.mkdirSync(SHOTS,{recursive:true});
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'jinhua-origin-profile-'));
  const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:{width:1440,height:1000}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push('pageerror: '+error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push('console: '+message.text().slice(0,160));});
  page.on('dialog',dialog=>dialog.accept());
  await page.route('**/api/upload',route=>route.fulfill({json:{localId:'venue-fixture.png',kind:'image',verified:true,source:'upload',width:1200,height:800,duration:0}}));
  await page.route('**/api/image',route=>route.fulfill({json:{localId:'venue-render.png',kind:'image',verified:true,source:'ai',width:1280,height:720,duration:0}}));
  await page.route('**/api/chat',async route=>{
    const body=JSON.parse(route.request().postData()||'{}');
    const payload=body.purpose==='refine'
      ?{findings:[{page:'summary',level:'block',quote:'用一扇朝东的窗',why:'摘要页没有说明这条创意与专场的关系',fix:'加一句专场关联句'}]}
      :UNIT;
    await route.fulfill({json:{text:JSON.stringify(payload),model:'mock-no-charge',usage:{}}});
  });
  const shot=name=>page.screenshot({path:path.join(SHOTS,name+'.png'),fullPage:true});
  /* 主线只有三段，细分页都在「更多」里 */
  const openFromMore=async(pg,label)=>{
    await pg.locator('.creative-nav button:has-text("更多")').first().click();
    await pg.waitForTimeout(400);
    await pg.locator('tr',{hasText:label}).getByRole('button',{name:'打开',exact:true}).click();
    await pg.waitForTimeout(600);
  };

  await page.goto(BASE,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/新建单条内容/}).first().click();
  await page.locator('#new-title').fill('【自动化验收】秋天的第一封信');
  await page.locator('#new-idea').fill('软件测试用稿，非正式创意：换季节点，用一封信承载没来得及说的话。');
  await page.locator('dialog').getByRole('button',{name:/创建|开始|保存|确定/}).first().click();
  await page.waitForTimeout(1200);

  assert.match(await page.locator('#view').innerText(),/① 我想到的创意/,'打开选题应默认落在「头脑风暴」');
  await page.locator('.creative-nav [data-action="creative-tab"][data-tab="more"]').first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button',{name:'打开',exact:true}).last().click();   /* 更多 → ▶ 一条片 */
  await page.waitForTimeout(600);
  const onePage=page.locator('#wz-status-live');
  assert.equal(await onePage.count(),1,'「更多」里应能打开上一版的单页工作台');
  assert.equal(await page.locator('[data-field="topics.0.wizard.fact"]').count(),1);
  await page.locator('[data-field="topics.0.wizard.fact"]').fill('双十一前两周发，为主体专场预热');
  await page.waitForTimeout(700);
  assert.match(await onePage.innerText(),/✓ 一句话|○ 一句话/,'状态条应能实时刷新');
  await openFromMore(page,'0 出发点');
  assert.match(await page.locator('#view').innerText(),/先立住出发点，再谈创意/,'「更多」里应能打开 0 出发点');
  await shot('01-origin-empty');

  for(const [kind,text,source] of MATERIALS){
    await page.locator('#origin-kind').selectOption(kind);
    await page.locator('#origin-text').fill(text);
    await page.locator('#origin-source').fill(source);
    await page.getByRole('button',{name:'加入素材',exact:true}).click();
    await page.waitForTimeout(220);
  }
  assert.equal(await page.locator('[data-action="creative-origin-remove"]').count(),MATERIALS.length,'五条素材都应写入');
  await shot('02-materials');

  await page.getByRole('button',{name:/生成／更新出发点/}).click();
  await page.waitForTimeout(1500);
  const proposition=page.locator('[data-field$=".origin.proposition"]');
  assert.equal(await proposition.count(),1,'应出现可编辑的主张字段');
  assert.equal(await proposition.first().inputValue(),UNIT.proposition);
  assert.equal(await page.locator('#view [data-action="creative-origin-blocks"]').count(),1);
  const frameSummary=await page.locator('#view details summary').allInnerTexts();
  assert.ok(frameSummary.some(x=>/画面 1 · 建立 · 写信/.test(x)),'画面摘要要带阶段：'+frameSummary.slice(0,3).join(' / '));
  assert.equal(await page.locator('[data-field$=".origin.frames.0.stage"]').count(),1,'阶段应可手动修改');
  assert.match(await page.locator('#view').innerText(),/还挂着待确认：授权/,'代价缺口要提示');
  const height=await page.evaluate(()=>document.body.scrollHeight);
  assert.ok(height<4200,`生成后单页高度应受控，当前 ${height}px（回归门槛 4200）`);
  await shot('03-generated');

  await page.getByRole('button',{name:/骨架体检/}).click();
  await page.waitForTimeout(1200);
  const view=await page.locator('#view').innerText();
  assert.match(view,/骨架体检 · 基于出发点的 5 页映射/,'体检要写清检的是骨架');
  assert.match(view,/提示：决策清单还没写/,'空决策页应给提示而不是必须改');
  assert.ok(!/\[必须改\]（decisions）这一页没有任何正文要点/.test(view),'骨架空页不应判为必须改');
  assert.ok(!/这一页没有讲稿/.test(view),'骨架页不应报“没有讲稿”');
  assert.match(await page.locator('#view').innerHTML(),/class="badge/, '体检级别要用徽标');
  await shot('04-audit');

  await page.getByRole('button',{name:/查看10页映射/}).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.preview-block').count(),10,'10页映射应有十块');
  await shot('05-blocks');
  await page.getByRole('button',{name:'关闭',exact:true}).first().click();

  // 导出门禁：体检有必须改 → 只允许方向讨论稿，完整版/执行版停用
  assert.match(await page.locator('#view').innerText(),/导出门禁：本次导出会自动标为方向讨论稿/,'面板要说明门禁后果');
  await openFromMore(page,'4 汇报');
  await page.getByRole('button',{name:/导出决策版PPT/}).click();
  await page.waitForTimeout(600);
  const dialogOpen=await page.locator('dialog[open]').count();
  const dialogText=await page.locator('dialog').innerText().catch(()=>'（读不到弹窗）');
  if(!dialogOpen){console.error('诊断：弹窗没打开。当前 #notification='+await page.locator('#notification').innerText().catch(()=>'')+' | view 前 120 字='+(await page.locator('#view').innerText()).slice(0,120));}
  assert.match(dialogText,/出发点体检有 \d+ 项必须改/,'导出弹窗要说明门禁原因');
  assert.match(dialogText,/方向讨论稿/,'导出弹窗要标明这次是讨论稿');
  const fullButton=page.locator('dialog button:text-is("完整策划版")');
  assert.equal(await fullButton.isDisabled(),true,'完整策划版应停用');
  const decisionButton=page.locator('dialog button:text-is("老板决策版")');
  assert.equal(await decisionButton.isDisabled(),false,'老板决策版仍可用');
  await shot('07-export-gate');
  await page.getByRole('button',{name:'关闭',exact:true}).first().click().catch(()=>{});

  // 场地与机位：填大概尺寸 → 算机位/焦段 → 俯视图 → 提示词
  await openFromMore(page,'3 场地与机位');
  assert.match(await page.locator('#view').innerText(),/场地信息未齐|缺净宽/,'缺尺寸时要说清缺什么');
  await page.getByRole('button',{name:/按常见住宅填一版/}).click();
  await page.waitForTimeout(500);
  const venueText=await page.locator('#view').innerText();
  assert.match(venueText,/距人物 \d+(\.\d+)? 米/,'要算出机位距离');
  assert.match(venueText,/可拍|需调整/,'每个画面要给可行性结论');
  assert.equal(await page.locator('#view svg').count(),1,'要画出俯视机位图');
  assert.match(await page.locator('#view svg').innerHTML(),/净宽 4m × 进深 6m/);
  assert.match(venueText,/窗（侧墙）|窗（镜头对面）|窗（门口方向）/,'要给出光位做法');
  await shot('08-venue-plan');

  await page.getByRole('button',{name:/看这个画面的提示词/}).first().click();
  await page.waitForTimeout(400);
  const promptText=await page.locator('dialog').innerText();
  assert.match(promptText,/必须保留：房间的墙面、窗户位置与大小/,'提示词要保住场地结构');
  assert.match(promptText,/距人物约 \d/);
  await shot('09-venue-prompt');
  await page.getByRole('button',{name:'关闭',exact:true}).first().click();

  await page.locator('input[data-upload="creative-venue-photo"]').setInputFiles({name:'venue.png',mimeType:'image/png',buffer:Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082','hex')});
  await page.waitForTimeout(700);
  assert.match(await page.locator('#view').innerText(),/已上传 · 当前第 1 版|替换场地照片/,'上传后要能看到已上传状态');
  await page.getByRole('button',{name:/出一张参考图/}).first().click();
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#view a:has-text("打开参考图")').count(),1,'生成后要给可打开的参考图');
  await shot('10-venue-image');

  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(300);
  const mobileHeight=await page.evaluate(()=>document.body.scrollHeight);
  assert.ok(mobileHeight<6000,`手机端高度应受控，当前 ${mobileHeight}px（回归门槛 6000）`);
  await shot('06-mobile');

  assert.deepEqual(errors,[],'页面不应有控制台错误：'+errors.join(' | '));
  await context.close();
  console.log('出发点面板验收通过 · 截图：'+SHOTS);
  console.log('页面高度：桌面 '+height+'px · 手机 '+mobileHeight+'px');
})().catch(error=>{console.error('未通过：'+error.message);process.exit(1);});
