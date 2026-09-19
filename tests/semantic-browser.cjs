const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8787/');await page.locator('nav [data-view="aesthetic"]').click();
 for(const name of ['舞台暖光','冷色长廊']){await page.locator('[data-action="aesthetic-new"]').click();await page.locator('#aes-name').fill(name);await page.locator('#aes-notes').fill('测试用光线参考');await page.locator('[data-action="aesthetic-save"]').click();await page.locator('[data-action="close"]').click();}
 await page.getByRole('button',{name:'收藏 舞台暖光',exact:true}).click();await page.locator('[data-action="aesthetic-favorite-filter"]').click();
 let expectedId;
 await page.route('**/api/reference/search',async r=>{const body=r.request().postDataJSON();assert.equal(body.scope,'xinxuan');assert.equal(body.items.length,1);assert.match(body.items[0].text,/舞台暖光/);assert.equal(body.query,'温暖、坚定的光');expectedId=body.items[0].id;await r.fulfill({json:{jobId:'semantic-test'}});});
 await page.route('**/api/jobs/semantic-test',r=>r.fulfill({json:{status:'succeeded',result:{scope:'xinxuan',model:'mock-embedding',matches:[{id:expectedId,score:.9}]}}}));
 await page.locator('[data-action="aesthetic-semantic"]').click();assert.match(await page.getByRole('dialog').innerText(),/1 条参考/);await page.locator('#semantic-query').fill('温暖、坚定的光');await page.locator('[data-action="aesthetic-semantic-run"]').click();await page.getByRole('heading',{name:'语义检索结果',exact:true}).waitFor();assert.match(await page.getByRole('dialog').innerText(),/舞台暖光/);assert.ok(!(await page.getByRole('dialog').innerText()).includes('冷色长廊'));await page.getByRole('button',{name:'打开参考',exact:true}).click();assert.equal(await page.locator('#aes-name').inputValue(),'舞台暖光');await page.locator('[data-action="close"]').click();
 await page.locator('#scope').selectOption('personal');await page.locator('nav [data-view="aesthetic"]').click();await page.locator('[data-action="aesthetic-semantic"]').click();assert.match(await page.locator('#notification').innerText(),/没有参考/);assert.deepEqual(errors,[]);
 // The legacy page is read-only with respect to cloud services, but still loads local UI.
 await page.goto('http://127.0.0.1:8787/legacy.html');assert.equal(await page.locator('#apiKey').isDisabled(),true);assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'),/connect-src 'none'/);
 console.log('PASS: semantic search respects workspace and filters, opens source, no cross-space result; legacy credential entry disabled');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
