// Isolated browser profile; verifies the unconfigured/offline-safe mobile companion and desktop handoff.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8000/mobile.html');
  await page.getByRole('button',{name:/视频/}).click();assert.equal(await page.locator('#capture-file').getAttribute('accept'),'video/*');
  await page.getByRole('button',{name:/文字/}).click();await page.locator('#capture-title').fill('离线测试灵感');await page.locator('#capture-body').fill('一束光从走廊尽头进入。');await page.getByRole('button',{name:'保存到随身收件箱'}).click();await page.waitForFunction(()=>document.body.innerText.includes('已保存在此设备'));
  assert.match(await page.locator('#sync-state').textContent(),/1条本机草稿/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.goto('http://127.0.0.1:8000/');await page.getByRole('button',{name:'随身收件箱'}).click();assert.equal(await page.getByText('代码已就绪，云同步尚未启用。').count(),1);assert.equal(await page.getByRole('link',{name:'打开随身版 ↗'}).count()>0,true);
  assert.deepEqual(errors,[]);await browser.close();console.log('PASS: mobile offline capture, responsive layout, and desktop inbox setup state.');
})().catch(error=>{console.error(error);process.exit(1);});
