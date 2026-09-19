// Isolated profile. Real local uploads/extraction; AI outputs explicitly mocked.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // Do not read private runtime profile seeds into test output.
 await page.route('**/api/profile-seed?*',r=>r.fulfill({json:{fields:{}}}));
 await page.addInitScript(()=>{if(localStorage.getItem('library-test-seeded'))return;localStorage.setItem('library-test-seeded','1');localStorage.setItem('xuan_ti_ku_visual',JSON.stringify([{id:99,title:'测试历史舞台参考',type:'舞台声光电',tags:['追光'],note:'模拟参考，保留原始来源',url:'https://example.com/reference'}]));});
 const click=label=>page.getByRole('button',{name:label,exact:true}).click();
 const nav=view=>page.locator(`nav [data-view="${view}"]`).click();
 const idle=()=>page.waitForFunction(()=>!document.querySelector('.job'));
 const read=space=>page.evaluate(s=>JSON.parse(localStorage.getItem('lance_studio_v2_'+s)),space);
 const global=space=>page.evaluate(s=>JSON.parse(localStorage.getItem('lance_studio_aesthetic_'+s)||'[]'),space);
 await page.goto('http://127.0.0.1:8787/');await nav('aesthetic');assert.equal((await global('xinxuan')).length,0);
 await page.reload();await nav('aesthetic');assert.equal((await global('xinxuan')).length,0);
 await click('添加参考／链接');await page.locator('#aes-name').fill('测试摄影收藏');await page.locator('#aes-category').fill('自定义摄影');await page.locator('#aes-tags').fill('低饱和，追光');await page.locator('#aes-link').fill('分享：https://example.com/shot，看看摄影');await page.locator('#aes-notes').fill('用于验收的备注');await click('保存参考');await click('关闭');assert.equal((await global('xinxuan')).length,1);
 await click('批量上传');await page.locator('#aes-batch-category').fill('AI参考');await page.locator('[data-upload="aesthetic-batch"]').setInputFiles([{name:'first.png',mimeType:'image/png',buffer:require('node:fs').readFileSync(path.resolve(__dirname,'../test-output/fixture.png'))},{name:'second.png',mimeType:'image/png',buffer:require('node:fs').readFileSync(path.resolve(__dirname,'../test-output/fixture.png'))}]);await idle();assert.equal((await global('xinxuan')).length,3);
 await page.getByRole('button',{name:'收藏 测试摄影收藏',exact:true}).click();await click('☆ 只看收藏');assert.equal(await page.locator('.aesthetic-card').count(),1);await click('查看／编辑');await page.locator('#aes-notes').fill('追加附件前尚未保存的备注');await page.locator('[data-upload="aesthetic-files"]').setInputFiles(path.resolve(__dirname,'../test-output/fixture.png'));await idle();assert.equal((await global('personal')).length,0);await click('复制到 My·个人');assert.equal((await global('xinxuan')).find(a=>a.name==='测试摄影收藏').notes,'追加附件前尚未保存的备注');
 await click('★ 只看收藏');await page.screenshot({path:path.resolve(__dirname,'../test-output/审美库_桌面.png'),fullPage:true});
 await page.locator('#scope').selectOption('personal');await nav('aesthetic');assert.equal((await global('personal')).length,2);
 await nav('home');await click('新建个人项目');await page.locator('#new-title').fill('验收个人纪录片');await click('创建并开始');assert.equal((await read('personal')).projects[0].kind,'personal');assert.equal(await page.getByRole('heading',{name:'6条故事脚本',exact:true}).count(),0);
 for(let i=0;i<7;i++){if(i){await nav('projects');await click('进入项目');}await click('为此项目新建脚本');}
 assert.equal((await read('personal')).projects[0].topicIds.length,7);
 await nav('topics');await page.getByRole('button',{name:'打开选题',exact:true}).first().click();await page.locator('[data-field="topics.0.form"]').fill('AI纪录实验');await page.locator('[data-field="topics.0.form"]').blur();assert.equal((await read('personal')).topics[0].form,'AI纪录实验');
 await nav('profile');await page.locator('[data-field="profile.fields.background"]').fill('仅My使用的测试经历');await page.locator('[data-field="profile.fields.background"]').blur();await page.locator('[data-upload="profile-files"]').setInputFiles({name:'synthetic-profile.txt',mimeType:'text/plain',buffer:Buffer.from('只用于验收的个人文档正文')});await idle();let p=(await read('personal')).profile;assert.equal(p.files[0].extractedText,'只用于验收的个人文档正文');assert.equal(p.enabled,false);assert.equal(p.files[0].includeInAI,false);
 await click('预览AI会使用的资料');assert.ok(!(await page.locator('#dialog-content').innerText()).includes('只用于验收的个人文档正文'));await click('关闭');await page.locator('[data-field="profile.enabled"]').check();await page.locator('[data-field="profile.files.0.includeInAI"]').check();await click('预览AI会使用的资料');assert.ok((await page.locator('#dialog-content').innerText()).includes('只用于验收的个人文档正文'));await click('关闭');
 await nav('projects');await click('进入项目');await click('新建项目参考文件夹');await page.locator('#folder-name').fill('个人纪录片参考');await page.locator('.folder-picker-card').filter({hasText:'测试摄影收藏（来自My·工作）'}).locator('[name="folder-member"]').check();await click('保存文件夹');
 await page.route('**/api/chat',async r=>{const b=r.request().postDataJSON();assert.ok(b.prompt.includes('仅My使用的测试经历'));assert.ok(b.prompt.includes('只用于验收的个人文档正文'));assert.equal(b.references.length,1);await r.fulfill({status:400,json:{error:'模拟模型失败，原稿应保留'}});});
 await nav('topics');await page.getByRole('button',{name:'进入汇报制作',exact:true}).first().click();await click('AI补全缺项');await idle();assert.equal((await read('personal')).topics[0].quick.fields.outline,'');await page.unroute('**/api/chat');
 await nav('home');await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.resolve(__dirname,'../test-output/My个人_移动端.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
 await page.setViewportSize({width:1440,height:1000});await page.locator('#scope').selectOption('xinxuan');await nav('profile');assert.ok(!(await page.locator('#view').innerText()).includes('synthetic-profile.txt'));await nav('home');await click('AI创意补给');await page.locator('[data-field="inspirationBrief.theme"]').fill('测试工作主题');await page.locator('[data-field="inspirationBrief.theme"]').blur();
 await page.route('**/api/chat',async r=>{const b=r.request().postDataJSON();assert.ok(!b.prompt.includes('仅My使用的测试经历'));assert.ok(!b.prompt.includes('只用于验收的个人文档正文'));await r.fulfill({json:{text:JSON.stringify({ideas:Array.from({length:6},(_,i)=>({title:'模拟创意'+i,angle:'模拟角度',hook:'模拟切入',insight:'模拟洞察',visual:'模拟画面',purpose:'模拟作用',risks:'所有事实待核实'}))})}});});await click('生成一批新方向');await idle();assert.equal((await read('xinxuan')).inspirations.length,6);await page.getByRole('button',{name:'转入选题库',exact:true}).first().click();assert.equal((await read('xinxuan')).topics[0].quick.fields.outline,'');
 await page.unroute('**/api/chat');await page.route('**/api/chat',r=>r.fulfill({json:{text:'{"ideas":[]}'}}));await nav('home');await click('AI创意补给');await click('生成一批新方向');await idle();assert.equal((await read('xinxuan')).inspirations.length,6);
 await page.reload();await nav('home');await click('AI创意补给');assert.equal(await page.locator('.grid .card').count(),6);assert.deepEqual(errors,[]);
 console.log('PASS: scoped library and explicit copy, links/categories/favorites, real bulk/append uploads, unsaved metadata, My 7 scripts, profile extraction+consent+scope isolation, selected project image context, TMD mocked supply+error preservation, reload, mobile.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
