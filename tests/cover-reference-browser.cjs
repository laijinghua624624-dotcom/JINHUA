// A cover generation request must include the user's explicit reference photos.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),C=require('../studio-core');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let imageBody=null;
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8787/');
  await page.evaluate(()=>{
    const t=StudioCore.topic('封面参考链路测试'),cover=StudioCore.ensureCover(t);
    t.directionApproved={time:new Date().toISOString(),fields:{}};t.quick.stage='full';
    cover.referenceAdvice='保留低饱和青绿色调与人物侧逆光';cover.options[0].image.prompt='电影感人物封面';
    StudioCore.putVersion(cover.references[0],{id:'ref-asset',kind:'image',localId:'reference-person.jpg',verified:true,source:'upload',createdAt:new Date().toISOString()});
    localStorage.setItem('lance_studio_scope','xinxuan');localStorage.setItem('lance_studio_v2_xinxuan',JSON.stringify({version:2,topics:[t],projects:[],assets:[],exports:[],preferences:'',imported:false}));
  });
  await page.reload();
  await page.route('**/api/health',route=>route.fulfill({json:{ok:true,ffmpeg:true,routes:{},keyConfigured:true}}));
  await page.route('**/api/image',async route=>{imageBody=route.request().postDataJSON();await route.fulfill({json:{id:'generated-cover',kind:'image',localId:'generated-cover.jpg',verified:true,source:'ai',createdAt:new Date().toISOString()}});});
  await page.route('**/media/**',route=>route.fulfill({status:404,body:''}));
  await page.getByRole('button',{name:'项目',exact:true}).click();
  await page.getByRole('button',{name:/独立内容 · 1/}).click();
  await page.getByRole('button',{name:'打开编辑',exact:true}).click();
  await page.locator('#quick-covers > summary').click();
  await page.locator('[data-action="generate-slot"][data-path="topics.0.quick.cover.options.0.image"]').click();
  await page.waitForFunction(()=>!document.querySelector('.job'));
  assert.ok(imageBody,'image request was sent');
  assert.deepEqual(imageBody.references,['reference-person.jpg']);
  assert.match(imageBody.prompt,/用户上传的封面参考/);
  assert.match(imageBody.prompt,/低饱和青绿色调/);
  assert.deepEqual(errors,[]);
  console.log('PASS: uploaded cover references and style rules reach the image model');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1);});
