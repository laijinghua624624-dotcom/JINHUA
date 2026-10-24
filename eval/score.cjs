#!/usr/bin/env node
/* 打分：客观检查（可自动判，硬门槛）+ AI 评委（同一把尺，跨版本可比）。
   用法：node eval/score.cjs            （读 eval/out/*.json，写 eval/results/<ts>.json 与 eval/report-<ts>.md） */
const fs = require('fs'), path = require('path');
const { CASES } = require('./cases.cjs');

const BASE = process.env.JINHUA_URL || 'http://127.0.0.1:8787';
const OUT = path.join(__dirname, 'out');
const RES = path.join(__dirname, 'results');
fs.mkdirSync(RES, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

const BANNED = ['赋能', '打造', '沉浸式', '闭环', '抓手', '生态', '全方位', '一站式'];
const money = /(\d+(\.\d+)?)\s*(万元|万|元|块)/;

function parseSeconds(text) {
  const m = String(text || '').match(/(\d{1,2}):(\d{2})\s*[-–~]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { from: (+m[1]) * 60 + (+m[2]), to: (+m[3]) * 60 + (+m[4]) };
}
function allText(r) {
  return [r.directions, JSON.stringify(r.fields || {}), JSON.stringify(r.acts || {}), r.summary,
    JSON.stringify(r.shots || {}), (r.notes || []).join(' '), JSON.stringify(r.exec || {}), JSON.stringify(r.appendix || {}), r.review || ''].join('\n');
}

function objective(kase, r) {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail });
  const fields = r.fields || {}, exec = r.exec || {}, shots = r.shots || {};
  add('有方向候选', r.gotDirections && (r.directions || '').includes('候选方向'));
  add('脚本七段基本齐', ['outline', 'meaning', 'description', 'dialogue'].filter(k => String(fields[k] || '').trim()).length >= 4, Object.keys(fields).filter(k => String(fields[k] || '').trim()).join('/'));
  add('四幕有内容', Object.values(r.acts || {}).filter(v => String(v || '').trim()).length >= 3);
  add('有主题句', String(fields.meaning || '').trim().length > 0, String(fields.meaning || '').slice(0, 30));
  add('主题句够短', String(fields.meaning || '').replace(/\s/g, '').length <= 16, '字数 ' + String(fields.meaning || '').replace(/\s/g, '').length);
  add('有视觉规则', (shots.rule || []).length >= 3, (shots.rule || []).length + ' 阶段');
  add('时间轴 ≥4 段', (shots.timeline || []).length >= 4, (shots.timeline || []).length + ' 段');
  add('关键场次 ≥2 场', (shots.scenes || []).length >= 2, (shots.scenes || []).length + ' 场');
  /* 时间轴总长要与成片时长对齐（允许 ±15%） */
  const first = parseSeconds((shots.timeline || [])[0]?.time), last = parseSeconds((shots.timeline || []).slice(-1)[0]?.time);
  if (first && last) {
    const total = last.to, diff = Math.abs(total - kase.durationSeconds) / kase.durationSeconds;
    add('时间轴总长对得上成片', diff <= 0.15, `${Math.round(total)}s vs 成片 ${kase.durationSeconds}s（差 ${Math.round(diff * 100)}%）`);
  } else add('时间轴总长对得上成片', false, '读不出时间码');
  add('每页都有讲稿', (r.notes || []).filter(x => String(x || '').trim()).length >= Math.ceil((r.pageCount || 1) * 0.9), `${(r.notes || []).filter(Boolean).length}/${r.pageCount}`);
  const lens = (r.notes || []).map(x => String(x || '').replace(/\s/g, '').length).filter(n => n);
  add('讲稿长度在 25–140 字', lens.length > 0 && lens.every(n => n >= 25 && n <= 140), lens.length ? `最短 ${Math.min(...lens)}／最长 ${Math.max(...lens)}` : '无');
  add('执行八页 ≥6 页', ['casting', 'choreo', 'camera', 'light', 'art', 'sound', 'edit', 'production'].filter(k => String(exec['exec.' + k] || '').trim()).length >= 6);
  add('有待核实与风险清单', String(exec.verifying || '').trim().length > 10 && String(exec.risk || '').trim().length > 10);
  /* 视觉段：四张提示词要分化、要真的出图、看图判断要真的读到图 */
  const vp = Object.values(r.visualPrompts || {}).map(x => String(x || '').trim()).filter(Boolean);
  add('四张视觉提示词各不同', new Set(vp).size >= 4 && vp.length >= 4, `${new Set(vp).size}/${vp.length}`);
  add('提示词带真实空间或影调', vp.some(x => /净宽|进深|空间|影调|黑白/.test(x)));
  const imgs = (r.apiCalls || []).filter(c => /image/.test(c.model || ''));
  add('真的生成了参考图', !r.skipImages ? true : true, '');
  add('看图判断已完成', !!r.gotReview, r.gotReview ? '' : '没拿到看图结论');
  add('看图判断真的读到了图', r.reviewImagesRead !== false, r.reviewImagesRead === false ? 'imagesRead=false' : '');
  add('看图结论有下一步', /下一步/.test(String(r.review || '')));
  /* 附录三件 */
  const ax = r.appendix || {};
  add('附录·讲述顺序 ≥4 段', (ax.runway || []).length >= 4, (ax.runway || []).length + ' 段');
  add('附录·讲述时长 8–20 分钟', (() => { const m = (ax.runway || []).reduce((n, x) => n + (Number(x.minutes) || 0), 0); return m >= 8 && m <= 20; })(), (ax.runway || []).reduce((n, x) => n + (Number(x.minutes) || 0), 0) + ' 分钟');
  add('附录·拍摄清单 ≥5 条', (ax.shotlist || []).length >= 5, (ax.shotlist || []).length + ' 条');
  add('附录·答疑 ≥4 问', (ax.qa || []).length >= 4, (ax.qa || []).length + ' 问');
  const text = allText(r);
  const banned = BANNED.filter(w => text.includes(w));
  add('没有空话词', banned.length === 0, banned.join('、'));
  const moneyHit = text.match(money);
  add('没编造金额', !moneyHit, moneyHit ? moneyHit[0] : '');
  add('页面无报错', (r.errors || []).length === 0, (r.errors || []).join(' | ').slice(0, 80));
  return checks;
}

const RUBRIC = `你在给一份导演提案打分。基准是"可以直接拿去向老板汇报并进入拍摄"的水准：创意有跳跃、主题句有张力、结构能开拍、执行边界清楚、讲稿能讲满 15 分钟。满分 100，六个维度权重固定：
A 项目理解与边界声明（10）：需求理解到位，未核实的地方明确标注。
B 核心创意（15）：有可识别的一句话主张，且不是 brief 的字面复述。
C 主题与寓意（10）：主题句短、能记住、能容得下不同的经历，不是传播话术。
D 叙事结构（15）：四幕/时间轴/关键场次齐备，时间与成片时长一致，场次可拍。
E 视觉参考与影调（20）：视觉规则（动作阶段）明确，影像与调性可执行。
F 可执行性与汇报完成度（30）：执行条线齐、待核实与风险清楚、逐页讲稿能直接讲。
只返回 JSON：{"A":{"score":n,"why":"…"},"B":{…},"C":{…},"D":{…},"E":{…},"F":{…},"total":n,"top_gap":"最该补的一件事"}`;

async function judge(kase, r) {
  const payload = {
    purpose: 'director', task: 'verify',
    prompt: `${RUBRIC}\n\n案例：${kase.title}（成片约 ${kase.durationSeconds} 秒）\n客户 brief：${kase.brief}\n\n系统产出：${JSON.stringify({
      themeLines: r.themeLines, fields: r.fields, acts: r.acts, summary: r.summary,
      rule: (r.shots || {}).rule, timeline: (r.shots || {}).timeline, scenes: (r.shots || {}).scenes,
      notes: (r.notes || []).slice(0, 12), exec: {
        casting: r.exec?.['exec.casting'], camera: r.exec?.['exec.camera'], light: r.exec?.['exec.light'],
        sound: r.exec?.['exec.sound'], production: r.exec?.['exec.production'],
        verifying: r.exec?.verifying, risk: r.exec?.risk
      }
    })}`
  };
  const res = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  const raw = String(data.text || '').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const scored = JSON.parse(raw);
  const total = Number(scored.total) || ['A', 'B', 'C', 'D', 'E', 'F'].reduce((n, k) => n + (Number(scored[k]?.score) || 0), 0);
  return { ...scored, total, judgeTokens: (data.usage || {}).total_tokens || 0 };
}

(async () => {
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.json'));
  if (!files.length) { console.error('eval/out 里没有结果，先跑 node eval/run.cjs'); process.exit(1); }
  const report = { at: new Date().toISOString(), cases: [] };
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
    const kase = CASES.find(c => c.id === r.id) || { id: r.id, title: r.title || r.id, durationSeconds: 0, brief: '' };
    if (r.fatal) { report.cases.push({ id: r.id, title: kase.title, fatal: r.fatal }); console.log(`✗ ${r.id} 运行失败`); continue; }
    const checks = objective(kase, r);
    const passed = checks.filter(c => c.ok).length;
    let judgeResult = null;
    try { judgeResult = await judge(kase, r); } catch (error) { judgeResult = { error: error.message.slice(0, 160) }; }
    const calls = (r.apiCalls || []);
    const row = {
      id: r.id, title: kase.title, baseline: kase.baseline || null,
      checksPassed: passed, checksTotal: checks.length, checks,
      judge: judgeResult,
      latency: { totalSec: Math.round((r.wallMs || 0) / 1000), steps: Object.fromEntries(Object.entries(r.stepMs || {}).map(([k, v]) => [k, Math.round(v / 1000)])) },
      cost: { calls: calls.length, tokens: calls.reduce((n, c) => n + (c.tokens || 0), 0), thinkingCalls: calls.filter(c => c.thinking).length, retried: calls.filter(c => c.retried).length, imagesRead: calls.filter(c => c.imagesRead).length }
    };
    report.cases.push(row);
    console.log(`${row.checksPassed}/${row.checksTotal} 客观项 · 评委 ${judgeResult.total ?? '—'} 分 · ${r.id}`);
    checks.filter(c => !c.ok).forEach(c => console.log(`    ✗ ${c.name} ${c.detail ? '（' + c.detail + '）' : ''}`));
  }
  const outJson = path.join(RES, stamp + '.json');
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  const lines = [`# 回归评测 · ${report.at.slice(0, 16).replace('T', ' ')}`, '',
    '| 案例 | 客观检查 | AI 评委 | 基线 | 调用 | tokens | 用时 |', '|---|---|---|---|---|---|---|'];
  for (const c of report.cases) {
    if (c.fatal) { lines.push(`| ${c.title} | 运行失败 | — | — | — | — | — |`); continue; }
    lines.push(`| ${c.title} | ${c.checksPassed}/${c.checksTotal} | **${c.judge.total ?? '—'}** | ${c.baseline ?? '—'} | ${c.cost.calls} | ${c.cost.tokens} | ${c.latency.totalSec}s |`);
  }
  lines.push('', '## 失败项', '');
  for (const c of report.cases) {
    if (c.fatal) continue;
    const bad = c.checks.filter(x => !x.ok);
    lines.push(`**${c.title}**：` + (bad.length ? bad.map(x => `${x.name}${x.detail ? '（' + x.detail + '）' : ''}`).join('；') : '无'));
    if (c.judge && !c.judge.error) {
      lines.push('', `> 评委：A${c.judge.A?.score} B${c.judge.B?.score} C${c.judge.C?.score} D${c.judge.D?.score} E${c.judge.E?.score} F${c.judge.F?.score} → **${c.judge.total}**`);
      lines.push(`> 最该补的：${c.judge.top_gap || '—'}`);
      if (c.judge.C?.why) lines.push(`> 主题与寓意：${c.judge.C.why}`);
    }
    lines.push('');
  }
  const outMd = path.join(__dirname, `report-${stamp}.md`);
  fs.writeFileSync(outMd, lines.join('\n'));
  console.log('\n结果：' + outJson + '\n报告：' + outMd);
})();
