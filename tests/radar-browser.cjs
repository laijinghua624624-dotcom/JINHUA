const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8787/');
  await page.getByRole('button',{name:'案例雷达'}).click();
  await page.getByRole('heading',{name:'案例雷达'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'今天先看 3 个'}).count(),1);
  assert.equal(await page.locator('.radar-start .radar-case').count(),3);

  await page.locator('.radar-start').getByRole('button',{name:'收藏到审美库'}).first().click();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_xinxuan')));
  assert.equal(stored.length,1);assert.equal(stored[0].radarKind,'case');assert.equal(stored[0].files.length,0);assert.equal(stored[0].sourceUsage,'link-only');
  assert.equal(await page.locator('.radar-start').getByRole('button',{name:/已收藏/}).count()>0,true);

  await page.locator('.radar-start').getByRole('button',{name:'转为我的选题'}).first().click();
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('lance_studio_v2_xinxuan')));
  const refs=await page.evaluate(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_xinxuan')));
  assert.equal(data.topics.length,1);assert.equal(refs.length,1);assert.ok(data.topics[0].inspirationSource);assert.equal(data.topics[0].quick.images.every(x=>x.versions.length===0),true);
  assert.equal(await page.getByText('案例雷达线索',{exact:false}).count(),0);
  assert.deepEqual(errors,[]);
  await browser.close();
  console.log('PASS: case radar opens, saves into aesthetic library, prevents duplicates, and creates an incomplete topic safely.');
})().catch(error=>{console.error(error);process.exit(1);});
