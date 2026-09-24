const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');

(async()=>{
  const base=process.env.LANCE_TEST_URL||'http://127.0.0.1:8787/';
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://example.com/poster.jpg',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAFAgI/6tW2GQAAAABJRU5ErkJggg==','base64')}));
  await page.route('**/api/link/import',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({url:'https://example.com/case',finalUrl:'https://example.com/case',title:'走廊尽头的一束光',description:'A cinematic lighting study',siteName:'Example Film',previewImage:'https://example.com/cover.jpg',mediaKind:'image',asset:null,notice:'已读取'})}));
  await page.route('**/api/chat',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:JSON.stringify({title:'AI不应覆盖正式片名',category:'灯光设计',tags:['逆光','长廊'],summary:'用尽头强光制造人物前进的决心。',mediaType:'image'}),usage:{}})}));
  await page.goto(base);await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.getByRole('button',{name:/更多工具/}).click();await page.getByRole('button',{name:/案例雷达/}).click();await page.getByRole('button',{name:'快速收藏案例'}).click();
  const dialog=page.getByRole('dialog');assert.equal(await dialog.locator('textarea').count(),2);assert.equal(await dialog.locator('#radar-title,#radar-category,#radar-goal,#radar-mechanism').count(),0);
  await dialog.locator('#capture-link').fill('https://example.com/case');await dialog.locator('#capture-note').fill('喜欢走廊尽头的逆光和缓慢推进');await dialog.getByRole('button',{name:'保存到参考库'}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_xinxuan')||'[]')[0]?.captureStatus==='已读取并分类');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_xinxuan'))[0]);assert.equal(stored.category,'灯光设计');assert.equal(stored.name,'走廊尽头的一束光');assert.match(stored.downloadAdvice,/AI识图/);
  await page.goto(base+'?capture='+encodeURIComponent('https://example.com/another')+'&captureTitle='+encodeURIComponent('官方片名')+'&capturePreview='+encodeURIComponent('https://example.com/poster.jpg')+'&captureMedia=video&captureNote='+encodeURIComponent('喜欢这个构图'));
  await page.getByRole('heading',{name:'快速收藏案例'}).waitFor();assert.equal(await page.locator('#capture-link').inputValue(),'https://example.com/another');assert.equal(await page.locator('#capture-note').inputValue(),'喜欢这个构图');assert.equal(await page.locator('.capture-preview img').getAttribute('src'),'https://example.com/poster.jpg');assert.equal(await page.locator('.capture-recognized-title strong').textContent(),'官方片名');
  await page.getByRole('button',{name:'保存到参考库'}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_xinxuan')||'[]').some(item=>item.link==='https://example.com/another'));
  const captured=await page.evaluate(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_xinxuan')).find(item=>item.link==='https://example.com/another'));assert.equal(captured.name,'官方片名');assert.equal(captured.externalPreview,'https://example.com/poster.jpg');assert.equal(captured.mediaKind,'video');
  assert.deepEqual(errors,[]);await browser.close();console.log('PASS: two-field capture saves first, enriches in background, and bookmarklet query opens prefilled.');
})().catch(error=>{console.error(error);process.exit(1);});
