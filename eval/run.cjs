#!/usr/bin/env node
/* 用真实模型跑完整链路，把产出落到 eval/out/<case>.json。
   用法：node eval/run.cjs [caseId ...]      （不带参数=跑全部）
   零 mock：文字走真实模型、图片默认不生成（--images 才生成，省钱）。 */
const { chromium } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');
const { CASES } = require('./cases.cjs');

const BASE = process.env.JINHUA_URL || 'http://127.0.0.1:8787';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wanted = process.argv.slice(2).filter(x => !x.startsWith('--'));
const skipImages = process.argv.includes('--no-images');   /* 出图、看图、附录现在都是常规项 */
const picked = wanted.length ? CASES.filter(c => wanted.includes(c.id)) : CASES;

async function runCase(browser, kase) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [], api = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
  page.on('dialog', d => d.accept());
  page.on('response', async r => {
    if (!/\/api\/chat$/.test(r.url())) return;
    try {
      const body = JSON.parse(r.request().postData() || '{}');
      const data = await r.json();
      api.push({ task: body.task || '', thinking: !!body.thinking, references: (body.references || []).length,
        model: data.model, temperature: data.temperature, thinking_used: data.thinking, retried: !!data.retried,
        imagesRead: data.imagesRead, tokens: (data.usage || {}).total_tokens || 0 });
    } catch { /* 记不到就算了 */ }
  });
  const text = () => page.locator('#view').innerText();
  const wait = async (fn, max = 300) => { for (let i = 0; i < max; i++) { if (await fn()) return true; await sleep(1000); } return false; };
  /* 生成动作可能因为"上一个任务还没结束"被拒绝（此时既不报错，也不发生任何事）。
     withJob 一开始就渲染 .job 横幅、结束时移除 —— 这是唯一可靠的完成信号。
     旧版等固定秒数：遇到分钟级长尾就白丢分，还会再点一次造成二次付费。 */
  const jobCount = () => page.locator('.job, .dock-job').count();
  const attempt = async (label, clickFn, doneFn, { startMs = 30000, capMs = 900000 } = {}) => {
    const t0 = Date.now();
    for (let round = 0; round < 3; round++) {
      await waitIdle(1800);                        /* 先等上一个任务结束，否则点击会被静默拒绝 */
      await clickFn().catch(() => {});
      const t1 = Date.now();
      let started = false;
      while (Date.now() - t1 < startMs) {
        if (await doneFn()) return true;           /* 很快的步骤来不及出横幅 */
        if ((await jobCount()) > 0) { started = true; break; }
        await sleep(400);
      }
      if (!started) { console.log('   ↻ ' + label + ' 点击没有启动任务，重试'); await sleep(3000); continue; }
      let finished = false;
      while (Date.now() - t1 < capMs) { if ((await jobCount()) === 0) { finished = true; break; } await sleep(1000); }
      /* withJob 结束时若焦点还在输入框，只会移除横幅、把重绘推迟到 blur。
         跑测填过场地尺寸，焦点就停在输入框里——不主动 blur，结果永远不出现。 */
      await page.evaluate(() => { try { document.activeElement?.blur?.(); } catch {} }).catch(() => {});
      await sleep(600);
      if (await wait(doneFn, 60)) return true;     /* 渲染可能晚一拍 */
      console.log('   ✗ ' + label + ' 任务' + (finished ? '已结束' : '等待超时') + '但没出现预期结果（' + Math.round((Date.now() - t0) / 1000) + 's）；不重复点击，避免二次付费');
      return false;
    }
    console.log('   ✗ ' + label + ' 三次都没能启动任务');
    return false;
  };
  /* 真实生成要 30–60 秒：上一步没结束就切标签/填表会点不动，必须等任务锁释放 */
  const waitIdle = async (max = 120) => {
    let warned = false;
    for (let i = 0; i < max; i++) { if (!(await page.locator('.job, .dock-job').count())) return true; if (i === 45 && !warned) { warned = true; console.log('   （任务已跑 45s，继续等）'); } await sleep(1000); }
    console.log('（任务超过 ' + max + 's 未结束，尝试停止）');
    await page.locator('[data-action="stop"]').first().click().catch(() => {});
    await page.waitForTimeout(2000);
    return false;
  };
  const step = {};
  const mark = (name) => console.log('   · ' + name + ' @' + new Date().toISOString().slice(11, 19));
  const result = { id: kase.id, title: kase.title, brief: kase.brief, durationSeconds: kase.durationSeconds, at: new Date().toISOString() };

  /* 工作台每 30 秒自动同步，networkidle 可能永远不触发；改为等外壳渲染出来 */
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('.side').first().waitFor({ state: 'visible', timeout: 45000 });
  await page.getByRole('button', { name: /新建单条内容/ }).first().click();
  await page.locator('#new-title').fill(kase.title);
  await page.locator('#new-idea').fill(kase.brief);
  await page.locator('dialog').getByRole('button', { name: /创建|开始|保存|确定/ }).first().click();
  await page.waitForTimeout(1500);

  /* ① 方向候选（diverge 0.9 + 思考） */
  let t = Date.now();
  result.gotDirections = await attempt('① 方向候选',
    () => page.getByRole('button', { name: /2 · 帮我优化我写的/ }).click(),
    async () => (await text()).includes('可选方向（挑一个）'));
  step.directions = Date.now() - t;
  result.directions = await text();
  if (result.gotDirections) { await waitIdle(); await page.getByRole('button', { name: /采用这个方向/ }).first().click(); await page.waitForTimeout(1500); }

  /* ② 脚本起草 → 采用 */
  await waitIdle(); await page.locator('.creative-nav [data-action="creative-tab"][data-tab="script3"]').first().click();
  await page.waitForTimeout(900);
  t = Date.now();
  result.gotScript = await attempt('② 脚本起草',
    () => page.getByRole('button', { name: /让 AI 起草空白部分|重新起草空白段/ }).click(),
    async () => (await text()).includes('待确认的修改'));
  step.script = Date.now() - t;
  if (result.gotScript) { await waitIdle(); await page.getByRole('button', { name: /采用这些修改/ }).first().click(); await page.waitForTimeout(2500); }

  /* ② 主题句 */
  t = Date.now();
  mark('② 主题句');
  result.gotTheme = await attempt('② 主题句',
    () => page.getByRole('button', { name: /让 AI 拟 5 句主题句/ }).click(),
    async () => (await text()).includes('主题句候选'));
  step.theme = Date.now() - t;
  result.themeLines = result.gotTheme ? await page.locator('[data-action="creative-flow-theme-pick"]').allInnerTexts() : [];
  if (result.gotTheme) { await page.locator('[data-action="creative-flow-theme-pick"]').first().click(); await page.waitForTimeout(1000); }

  /* ② 分场与视觉规则 */
  t = Date.now();
  mark('② 分场');
  result.gotShots = await attempt('② 分场',
    () => page.getByRole('button', { name: /生成分场与视觉规则|重新拆一次分场/ }).click(),
    async () => (await page.locator('[data-field^="topics.0.shots.timeline."]').count()) > 0);
  step.shots = Date.now() - t;
  result.shots = await page.evaluate(() => {
    const o = { timeline: [], scenes: [], rule: [] };
    const grab = (kind, key) => document.querySelectorAll(`[data-field^="topics.0.shots.${kind}."]`).forEach(e => {
      const m = e.dataset.field.match(new RegExp(kind + '\\.(\\d+)\\.(\\w+)')); if (!m) return;
      o[kind][+m[1]] = o[kind][+m[1]] || {}; o[kind][+m[1]][m[2]] = e.value;
    });
    grab('timeline'); grab('scenes'); grab('rule'); return o;
  });

  /* ② 正文七段 */
  result.fields = await page.evaluate(() => {
    const o = {}; document.querySelectorAll('[data-field^="topics.0.quick.fields."]').forEach(e => { o[e.dataset.field.split('.').pop()] = e.value; }); return o;
  });
  result.acts = await page.evaluate(() => { const o = {}; document.querySelectorAll('[data-act]').forEach(e => { o[e.dataset.act] = e.value; }); return o; });
  const summary = await page.locator('[data-field="topics.0.acts.总结"]').first().inputValue().catch(() => '');
  result.summary = summary;
  result.scriptText = await page.locator('#wz-script-preview').evaluate(el => el.textContent).catch(() => '');
  result.actsUnparsed = await page.locator('#view .missing').allInnerTexts().then(xs => xs.find(x => /没能自动拆成四幕/.test(x)) || '').catch(() => '');

  /* ③ 视觉：可选出图 */
  await waitIdle(); await page.locator('.creative-nav [data-action="creative-tab"][data-tab="vision3"]').first().click();
  await page.waitForTimeout(900);
  result.visualPrompts = await page.evaluate(() => { const o = {}; document.querySelectorAll('[data-v4prompt]').forEach(e => { o[e.dataset.v4prompt] = e.value; }); return o; });
  if (!skipImages) {
    t = Date.now();
    await waitIdle();
    await page.locator('[data-field="topics.0.venue.width"]').fill('12');
    await page.locator('[data-field="topics.0.venue.depth"]').fill('8');
    await page.locator('[data-field="topics.0.venue.height"]').fill('3.5');
    await page.evaluate(() => { try { document.activeElement?.blur?.(); } catch {} });   /* 别把焦点带进后面的生成步骤 */
    await page.waitForTimeout(600);
    for (const key of ['light', 'emotion']) {
      await attempt('出图 ' + key,
        () => page.locator(`[data-action="creative-flow-image"][data-key="${key}"]`).first().click(),
        async () => (await page.locator(`[data-action="creative-flow-fix"][data-key="${key}"]`).count()) > 0);
    }
    step.images = Date.now() - t;
    /* 看图判断：把场地照片与已出图一起发给视觉模型 */
    t = Date.now();
    await page.locator('input[data-upload="creative-venue-photo"]').setInputFiles(path.join(__dirname, 'fixture.png'));
    await page.waitForTimeout(1500);
    result.gotUpload = (await text()).includes('已上传');
    result.gotReview = await attempt('看图判断',
      () => page.getByRole('button', { name: /让 AI 看这 \d+ 张图/ }).click(),
      async () => (await text()).includes('看图结论'));
    step.review = Date.now() - t;
    result.review = await page.evaluate(() => {
      const box = [...document.querySelectorAll('#view .panel')].find(p => /看图结论/.test(p.innerText));
      return box ? box.innerText.slice(0, 1200) : '';
    });
    result.reviewImagesRead = !/图片没有被读取/.test(result.review);
  }

  /* ④ 讲稿 + 执行八页 */
  await waitIdle(); await page.locator('.creative-nav [data-action="creative-tab"][data-tab="report4"]').first().click();
  await page.waitForTimeout(1200);
  result.pageCount = await page.locator('[data-field^="topics.0.pitch.notes."]').count();
  t = Date.now();
  mark('④ 讲稿');
  result.gotNotes = await attempt('④ 逐页讲稿',
    () => page.getByRole('button', { name: /生成逐页讲稿|补齐还没写的那几页/ }).click(),
    async () => (await page.locator('[data-field^="topics.0.pitch.notes."]').evaluateAll(e => e.filter(x => x.value.trim()).length)) >= Math.ceil(result.pageCount * 0.8));
  step.notes = Date.now() - t;
  result.notes = await page.locator('[data-field^="topics.0.pitch.notes."]').evaluateAll(e => e.map(x => x.value));

  t = Date.now();
  mark('④ 执行八页');
  result.gotExec = await attempt('④ 执行八页',
    () => page.getByRole('button', { name: /生成执行八页/ }).click(),
    async () => (await page.locator('[data-field$=".exec.casting"]').first().inputValue().catch(() => '')).length > 5);
  step.exec = Date.now() - t;
  result.exec = await page.evaluate(() => { const o = {}; document.querySelectorAll('[data-field^="topics.0.pitch."]').forEach(e => { o[e.dataset.field.replace('topics.0.pitch.', '')] = e.value; }); return o; });

  /* 附录三件 */
  t = Date.now();
  mark('附录');
  result.gotAppendix = await attempt('附录三件',
    () => page.getByRole('button', { name: /生成附录三件|重新生成附录/ }).click(),
    async () => (await page.locator('[data-field^="topics.0.pitch.appendix.runway."]').count()) > 0);
  step.appendix = Date.now() - t;
  result.appendix = await page.evaluate(() => {
    const o = { runway: [], shotlist: [], qa: [] };
    const grab = (kind) => document.querySelectorAll(`[data-field^="topics.0.pitch.appendix.${kind}."]`).forEach(e => {
      const m = e.dataset.field.match(new RegExp(kind + '\\.(\\d+)\\.(\\w+)')); if (!m) return;
      o[kind][+m[1]] = o[kind][+m[1]] || {}; o[kind][+m[1]][m[2]] = e.value;
    });
    grab('runway'); grab('shotlist'); grab('qa'); return o;
  });

  result.stepMs = step;
  result.apiCalls = api;
  result.errors = errors;
  await ctx.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const kase of picked) {
      process.stdout.write(`▶ ${kase.id} ${kase.title} … `);
      const t = Date.now();
      try {
        const r = await runCase(browser, kase);
        r.wallMs = Date.now() - t;
        fs.writeFileSync(path.join(OUT, kase.id + '.json'), JSON.stringify(r, null, 2));
        console.log(`完成 ${Math.round(r.wallMs / 1000)}s · 讲稿 ${(r.notes || []).filter(Boolean).length}/${r.pageCount} · 场次 ${(r.shots.scenes || []).length} · 看图 ${r.reviewImagesRead ? '已读图' : '未读图'} · 附录 ${(r.appendix?.runway || []).length}段/${(r.appendix?.qa || []).length}问 · 调用 ${r.apiCalls.length}${r.errors.length ? ' · 页面错误 ' + r.errors.length : ''}`);
      } catch (error) {
        console.log('失败：' + error.message.slice(0, 120));
        fs.writeFileSync(path.join(OUT, kase.id + '.json'), JSON.stringify({ id: kase.id, fatal: error.message }, null, 2));
      }
    }
  } finally { await browser.close(); }
  console.log('\n产出目录：eval/out/');
})();
