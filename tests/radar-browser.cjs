const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8787/');
  await page.getByRole('button',{name:/更多工具/}).click();
  await page.getByRole('button',{name:/案例雷达/}).click();
  await page.getByRole('heading',{name:'案例雷达'}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'今天先看 3 个'}).count(),1);
  assert.equal(await page.locator('.radar-start .radar-case').count(),3);
  assert.equal(await page.locator('.radar-start .radar-case-visual img').count(),3);
  assert.equal(await page.locator('.radar-start .radar-cn-guide').count(),3);
  assert.equal(await page.getByText('英文网站不用硬读',{exact:true}).count(),1);
  assert.equal(await page.locator('.radar-motion-card').count(),19);
  assert.equal(await page.getByRole('button',{name:'全部加入参考库'}).count(),1);

  await page.locator('.radar-start').getByRole('button',{name:'收藏到审美库'}).first().click();
  // 封面是异步抓取的：等它落地或明确失败，再校验记录本身仍然成立。
  await page.waitForFunction(()=>{
    const items=JSON.parse(localStorage.getItem('lance_studio_aesthetic_xinxuan')||'[]');
    const record=items[0];if(!record)return false;
    if((record.files||[]).length>0)return true;
    return String(document.querySelector('#notification')?.textContent||'').includes('没抓到');
  },{timeout:30000}).catch(()=>{});
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_xinxuan')));
  assert.equal(stored.length,1);assert.equal(stored[0].radarKind,'case');
  assert.ok(['link-only','internal-reference'].includes(stored[0].sourceUsage),'来源标记只能是链接或内部参考');
  assert.ok(stored[0].files.length<=1,'最多保存一张封面');
  if(stored[0].files.length===1){assert.equal(stored[0].files[0].kind,'image');assert.equal(stored[0].coverId,stored[0].files[0].localId);}
  // 封面落地后卡片会重渲染成「已收藏」；等这个状态出现再断言，避免抢在渲染之前。
  await page.waitForFunction(()=>[...document.querySelectorAll('.radar-start .radar-case')].some(card=>/已收藏/.test(card.textContent)),{timeout:20000}).catch(()=>{});
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
