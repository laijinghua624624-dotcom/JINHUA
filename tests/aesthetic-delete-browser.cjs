const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8787/');await page.getByRole('button',{name:'审美参考'}).click();await page.getByRole('button',{name:'添加参考／链接'}).click();
  await page.locator('#aes-name').fill('防误触删除测试');await page.locator('#aes-notes').fill('这条必须可恢复');await page.getByRole('button',{name:'保存参考'}).click();
  await page.getByRole('button',{name:'移入回收站'}).click();assert.equal(await page.getByRole('heading',{name:'确认移入回收站？'}).count(),1);
  await page.getByRole('button',{name:'取消，返回编辑'}).click();assert.equal(await page.locator('#aes-name').inputValue(),'防误触删除测试');
  await page.getByRole('button',{name:'移入回收站'}).click();await page.getByRole('button',{name:'确认移入回收站'}).click();
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_xinxuan')))).length,0);assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_trash_xinxuan')))).length,1);
  await page.getByRole('button',{name:/回收站 · 1/}).click();await page.getByRole('button',{name:'恢复到审美库'}).click();
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_xinxuan')))).length,1);assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_trash_xinxuan')))).length,0);assert.deepEqual(errors,[]);
  await browser.close();console.log('PASS: aesthetic references require confirmation, move to a recoverable trash bin, and restore safely.');
})().catch(error=>{console.error(error);process.exit(1);});
