// Isolated browser storage: verifies that a linked story can be exported on its own.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8787/');
  await page.evaluate(()=>{
    const topic=StudioCore.topic('秀前预告·从春夏的布瀑边出发');
    topic.idea='从春夏的布瀑视觉延续到秋冬服装大秀。';
    topic.quick.fields.outline='一块贯穿四季的布，带领观众进入秋冬大秀。';
    topic.quick.fields.meaning='用材质变化表达季节与品牌审美的延续。';
    const project=StudioCore.project('秋冬服装大秀专场');
    project.targetCount=1;project.topicIds=[topic.id];topic.projectId=project.id;
    localStorage.setItem('lance_studio_scope','xinxuan');
    localStorage.setItem('lance_studio_v2_xinxuan',JSON.stringify({version:2,topics:[topic],projects:[project],assets:[],exports:[],preferences:'',imported:false}));
  });
  await page.reload();
  await page.getByRole('button',{name:'项目',exact:true}).click();
  await page.getByRole('button',{name:'继续项目',exact:true}).click();
  await page.getByRole('button',{name:/02 单条内容/}).click();
  const card=page.locator('.project-story-list .work-card').filter({hasText:'秀前预告·从春夏的布瀑边出发'});
  assert.equal(await card.getByRole('button',{name:'导出本条PPT',exact:true}).count(),1);
  await card.getByRole('button',{name:'导出本条PPT',exact:true}).click();
  assert.match(await page.getByRole('dialog').innerText(),/秀前预告·从春夏的布瀑边出发/);
  assert.equal(await page.getByRole('button',{name:'下载老板决策版',exact:true}).isEnabled(),true);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'下载老板决策版',exact:true}).click();
  assert.match((await download).suggestedFilename(),/秀前预告·从春夏的布瀑边出发/);
  await page.waitForFunction(()=>!document.querySelector('.job'));
  await card.getByRole('button',{name:'打开编辑',exact:true}).click();
  await page.getByRole('button',{name:'预览',exact:true}).click();
  const preview=page.getByRole('dialog');
  assert.equal(await preview.getByRole('button',{name:'导出本条PPT',exact:true}).count(),1);
  await preview.getByRole('button',{name:'导出本条PPT',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'下载老板决策版',exact:true}).isEnabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: a project story exports independently from its card and preview');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
