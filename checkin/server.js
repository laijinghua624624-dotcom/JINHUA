#!/usr/bin/env node
/* 现场打卡服务：手机拍照上传 + 电脑端查看，零依赖 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PHOTOS = path.join(DATA, 'photos');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const PORT = Number(process.env.PORT) || Number(CONFIG.port) || 8137;
const APP_DIR = process.env.APP_DIR ? path.resolve(process.env.APP_DIR) : '';
const OCR_BIN = path.join(ROOT, 'bin', 'ocr');
function parseOCRText(text) {
    const amounts = [];
    let m;
    const rx = /[¥￥]\s*(\d+(?:\.\d{1,2})?)/g;
    while ((m = rx.exec(text))) amounts.push(Number(m[1]));
    let guess = null;
    const lab = /(实付|实付款|合计|总计|支付金额|订单金额|金额)[^\d¥￥]{0,8}[¥￥]?\s*(\d+(?:\.\d{1,2})?)/g;
    while ((m = lab.exec(text))) { if (/实付|合计|总计|支付/.test(m[1])) guess = Number(m[2]); }
    if (guess === null && amounts.length) guess = Math.max.apply(null, amounts);
    return { text: text.slice(0, 1500), amounts: amounts.slice(0, 12), guess: guess };
}
function runOCR(file, cb) {
  function viaTesseract() {
    execFile('tesseract', [file, 'stdout', '-l', 'chi_sim+eng'], { timeout: 15000 }, (err2, out2) => {
      if (err2) return cb(null);
      cb(parseOCRText(String(out2 || '')));
    });
  }
  if (!fs.existsSync(OCR_BIN)) return viaTesseract();
  execFile(OCR_BIN, [file], { timeout: 8000 }, (err, stdout) => {
    if (err) return viaTesseract();
    cb(parseOCRText(String(stdout || '')));
  });
}
function oldRunOCR(file, cb) {
  if (!fs.existsSync(OCR_BIN)) return cb(null);
  execFile(OCR_BIN, [file], { timeout: 8000 }, (err, stdout) => {
    if (err) return cb(null);
    const text = String(stdout || '');
    const amounts = [];
    let m;
    const rx = /[¥￥]\s*(\d+(?:\.\d{1,2})?)/g;
    while ((m = rx.exec(text))) amounts.push(Number(m[1]));
    let guess = null;
    const lab = /(实付|实付款|合计|总计|支付金额|订单金额|金额)[^\d¥￥]{0,8}[¥￥]?\s*(\d+(?:\.\d{1,2})?)/g;
    while ((m = lab.exec(text))) { if (/实付|合计|总计|支付/.test(m[1])) guess = Number(m[2]); }
    if (guess === null && amounts.length) guess = Math.max.apply(null, amounts);
    cb({ text: text.slice(0, 1500), amounts: amounts.slice(0, 12), guess: guess });
  });
}
const SUBS_FILE = path.join(DATA, 'submissions.json');
const EXP_FILE = path.join(DATA, 'expenses.json');
const SUP_FILE = path.join(DATA, 'suppliers.json');

fs.mkdirSync(PHOTOS, { recursive: true });
let subs = [], exps = [], sups = [];
try { subs = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); } catch (e) { subs = []; }
try { exps = JSON.parse(fs.readFileSync(EXP_FILE, 'utf8')); } catch (e) { exps = []; }
try { sups = JSON.parse(fs.readFileSync(SUP_FILE, 'utf8')); } catch (e) { sups = []; }
function saveSubs() {
  const tmp = SUBS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(subs, null, 1));
  fs.renameSync(tmp, SUBS_FILE);
}
function saveExps() {
  const tmp = EXP_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(exps, null, 1));
  fs.renameSync(tmp, EXP_FILE);
}
function saveSups() {
  const tmp = SUP_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(sups, null, 1));
  fs.renameSync(tmp, SUP_FILE);
}
function lanUrls() {
  const out = [];
  const ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(k => {
    (ifs[k] || []).forEach(a => {
      if (a.family === 'IPv4' && !a.internal) out.push('http://' + a.address + ':' + PORT);
    });
  });
  out.push('http://127.0.0.1:' + PORT);
  return out;
}
function send(res, code, type, body, extra) {
  const h = Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store' }, extra || {});
  res.writeHead(code, h);
  res.end(body);
}
function json(res, obj, code) {
  send(res, code || 200, 'application/json; charset=utf-8', JSON.stringify(obj), { 'Access-Control-Allow-Origin': '*' });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
function staticFile(res, base, rel) {
  const p = path.normalize(path.join(base, rel));
  if (!p.startsWith(base)) return send(res, 403, 'text/plain', 'forbidden');
  fs.readFile(p, (e, buf) => {
    if (e) return send(res, 404, 'text/plain; charset=utf-8', 'not found');
    send(res, 200, MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', buf);
  });
}
function readBody(req, limit, cb) {
  let size = 0, chunks = [];
  req.on('data', c => {
    size += c.length;
    if (size > limit) { req.destroy(); return cb(new Error('too large')); }
    chunks.push(c);
  });
  req.on('end', () => cb(null, Buffer.concat(chunks)));
  req.on('error', e => cb(e));
}
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
function isPublicPath(p) {
  return (p === '/' && !APP_DIR) || p === '/m' || p === '/form' || p === '/expense' || p === '/supplier' ||
    p === '/style.css' || p === '/form.js' || p === '/expense.js' || p === '/supplier.js' || p === '/supplier.css' ||
    p.startsWith('/photos/') || p === '/api/meta' || p === '/api/submit' || p === '/api/expense/submit' || p === '/api/supplier/submit';
}
function authOK(req) {
  if (!ADMIN_USER || !ADMIN_PASS) return true;
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Basic ')) return false;
  const buf = Buffer.from(h.slice(6), 'base64').toString('utf8');
  const i = buf.indexOf(':');
  return i >= 0 && buf.slice(0, i) === ADMIN_USER && buf.slice(i + 1) === ADMIN_PASS;
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '', { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
  if (!isPublicPath(p) && !authOK(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="quote"', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('需要登录');
  }
  if (p === '/m' || p === '/form') return staticFile(res, PUB, 'form.html');
  if (p === '/' && APP_DIR) return staticFile(res, APP_DIR, 'index.html');
  if (p === '/') return staticFile(res, PUB, 'form.html');
  if (p === '/expense') return staticFile(res, PUB, 'expense.html');
  if (p === '/supplier') return staticFile(res, PUB, 'supplier.html');
  if (p === '/admin') return staticFile(res, PUB, 'admin.html');
  if (p === '/style.css' || p === '/form.js' || p === '/expense.js' || p === '/admin.js' || p === '/supplier.js' || p === '/supplier.css') return staticFile(res, PUB, p.slice(1));
  if (p.startsWith('/photos/')) return staticFile(res, PHOTOS, p.slice('/photos/'.length));
  if (p === '/api/meta') {
    const urls = lanUrls();
    return json(res, { project: CONFIG.project, depts: CONFIG.depts, port: PORT, lanUrls: urls, formUrl: urls[0] + '/m', expenseUrl: urls[0] + '/expense', adminUrl: urls[0] + '/admin', count: subs.length, expenseCount: exps.length });
  }
  if (p === '/api/submissions') {
    const job = u.searchParams.get('job');
    return json(res, (job ? subs.filter(s => s.job === job) : subs).slice().reverse());
  }
  if (p === '/api/expenses') {
    const job = u.searchParams.get('job');
    return json(res, (job ? exps.filter(e => e.job === job) : exps).slice().reverse());
  }
  if (p === '/api/submission/delete' && req.method === 'POST') {
    return readBody(req, 64 * 1024, (err, buf) => {
      if (err) return json(res, { ok: false }, 400);
      let body; try { body = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { ok: false }, 400); }
      const ids = body.ids || (body.id ? [body.id] : []);
      subs = subs.filter(function (s) {
        if (ids.indexOf(s.id) >= 0) { try { fs.unlinkSync(path.join(DATA, s.photo)); } catch (e) {} return false; }
        return true;
      });
      saveSubs(); json(res, { ok: true });
    });
  }
  if (p === '/api/expense/delete' && req.method === 'POST') {
    return readBody(req, 64 * 1024, (err, buf) => {
      if (err) return json(res, { ok: false }, 400);
      let body; try { body = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { ok: false }, 400); }
      exps = exps.filter(function (e) {
        if (e.id === body.id) { try { fs.unlinkSync(path.join(DATA, e.photo)); } catch (er) {} return false; }
        return true;
      });
      saveExps(); json(res, { ok: true });
    });
  }
  if (p === '/api/expense/update' && req.method === 'POST') {
    return readBody(req, 200 * 1024, (err, buf) => {
      if (err) return json(res, { ok: false }, 400);
      let body;
      try { body = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { ok: false }, 400); }
      const rec = exps.filter(e => e.id === body.id)[0];
      if (!rec) return json(res, { ok: false, error: 'not found' }, 404);
      const allow = ['goCost', 'leaveCost', 'parking', 'toll', 'type', 'passengers', 'note'];
      allow.forEach(function (k) { if (body.patch && body.patch[k] !== undefined) rec[k] = ['goCost', 'leaveCost', 'parking', 'toll'].indexOf(k) >= 0 ? Number(body.patch[k]) || 0 : body.patch[k]; });
      saveExps();
      json(res, { ok: true, record: rec });
    });
  }
  if (p === '/api/expenses/export.csv') {
    const urls = lanUrls(); const base = urls[0];
    const head = ['项目', '日期', '部门', '职位', '姓名', '费用类型', '同乘人', '前往费用', '停车费', '过路费', '离开费用', '小计', '备注', '票据'];
    const lines = [head.join(',')].concat(exps.map(e => [(e.jobName || ''), e.date, e.dept, e.role, e.name, e.type === 'equipment' ? '器材运输' : '网约车', (e.passengers || '').replace(/[\r\n,]/g, ' '), e.goCost, e.parking, e.toll, e.leaveCost, (Number(e.goCost) + Number(e.parking) + Number(e.toll) + Number(e.leaveCost)).toFixed(2), (e.note || '').replace(/[\r\n,]/g, ' '), base + '/' + e.photo].map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')));
    return send(res, 200, 'text/csv; charset=utf-8', '\ufeff' + lines.join('\r\n'), { 'Content-Disposition': 'attachment; filename="expenses.csv"' });
  }
  if (p === '/api/supplier/submissions') {
    return json(res, sups.slice().reverse());
  }
  if (p === '/api/supplier/delete' && req.method === 'POST') {
    return readBody(req, 64 * 1024, (err, buf) => {
      if (err) return json(res, { ok: false }, 400);
      let body; try { body = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { ok: false }, 400); }
      const ids = body.ids || (body.id ? [body.id] : []);
      sups = sups.filter(function (x) { return ids.indexOf(x.id) < 0; });
      saveSups(); json(res, { ok: true });
    });
  }
  if (p === '/api/supplier/imported' && req.method === 'POST') {
    return readBody(req, 64 * 1024, (err, buf) => {
      if (err) return json(res, { ok: false }, 400);
      let body; try { body = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { ok: false }, 400); }
      const ids = body.ids || (body.id ? [body.id] : []);
      sups.forEach(function (x) { if (ids.indexOf(x.id) >= 0) x.imported = true; });
      saveSups(); json(res, { ok: true });
    });
  }
  if (p === '/api/supplier/submit' && req.method === 'POST') {
    return readBody(req, 1024 * 1024, (err, buf) => {
      if (err) return json(res, { ok: false, error: '内容太大' }, 413);
      let body; try { body = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { ok: false, error: '数据格式错误' }, 400); }
      const supplier = String(body.supplier || '').trim().slice(0, 80) || '未命名供应商';
      const sid = String(body.sid || '').trim().slice(0, 60);
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 100) : [];
      const clean = rows.map(function (r) {
        return {
          major: r.major === '灯光器材' ? '灯光器材' : '摄影器材',
          name: String(r.name || '').trim().slice(0, 120),
          model: String(r.model || '').trim().slice(0, 80),
          unit: String(r.unit || '个').trim().slice(0, 10) || '个',
          bottom: Number(r.bottom) || 0,
          stock: r.stock === '' || r.stock === null || r.stock === undefined ? null : Number(r.stock) || 0,
          note: String(r.note || '').trim().slice(0, 200)
        };
      }).filter(function (r) { return r.name; });
      if (!clean.length) return json(res, { ok: false, error: '请至少填写一项器材' }, 400);
      if (clean.some(function (r) { return !(r.bottom > 0); })) return json(res, { ok: false, error: '每项器材都要填底价' }, 400);
      const now = new Date();
      const rec = {
        id: now.getTime().toString(36) + crypto.randomBytes(2).toString('hex'),
        sid: sid, supplier: supplier, rows: clean,
        submittedAt: now.toLocaleString('zh-CN', { hour12: false }),
        imported: false
      };
      sups.push(rec); saveSups();
      json(res, { ok: true, record: rec });
    });
  }
  if (p === '/api/expense/submit' && req.method === 'POST') {
    return readBody(req, 15 * 1024 * 1024, (err, buf) => {
      if (err) return json(res, { ok: false, error: '图片太大，请重拍（单张不超过 8MB）' }, 413);
      let body;
      try { body = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { ok: false, error: '数据格式错误' }, 400); }
      const name = String(body.name || '').trim();
      const dept = String(body.dept || '').trim();
      const role = String(body.role || '').trim();
      const photo = String(body.photo || '');
      if (!name || !dept || !role) return json(res, { ok: false, error: '请填写部门、职位和姓名' }, 400);
      if (!/^data:image\/(jpeg|jpg|png);base64,/.test(photo)) return json(res, { ok: false, error: '请先拍票据照片' }, 400);
      const img = Buffer.from(photo.split(',')[1], 'base64');
      if (img.length > 8 * 1024 * 1024) return json(res, { ok: false, error: '图片太大，请重拍' }, 413);
      const fname = 'exp_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex') + '.jpg';
      fs.writeFileSync(path.join(PHOTOS, fname), img);
      const now = new Date();
      const rec = {
        id: now.getTime().toString(36) + crypto.randomBytes(2).toString('hex'),
        job: String(body.job || ''), jobName: String(body.jobName || ''),
        date: String(body.date || now.toISOString().slice(0, 10)),
        dept: dept, role: role, name: name,
        type: body.type === 'equipment' ? 'equipment' : 'ride',
        passengers: String(body.passengers || '').slice(0, 200),
        goCost: Number(body.goCost) || 0, parking: Number(body.parking) || 0,
        toll: Number(body.toll) || 0, leaveCost: Number(body.leaveCost) || 0,
        note: String(body.note || '').slice(0, 200),
        photo: 'photos/' + fname,
        receivedAt: now.toLocaleString('zh-CN', { hour12: false })
      };
      const reported = (Number(body.goCost) || 0) + (Number(body.leaveCost) || 0) + (Number(body.parking) || 0) + (Number(body.toll) || 0);
      runOCR(path.join(PHOTOS, fname), (ocr) => {
        if (ocr) {
          rec.ocr = ocr;
          if (ocr.guess && reported === 0) {
            rec.goCost = ocr.guess;
            rec.note = (rec.note ? rec.note + '；' : '') + 'OCR自动识别金额 ¥' + ocr.guess.toFixed(2) + '，请核对';
          }
        }
        exps.push(rec); saveExps();
        json(res, { ok: true, record: rec });
      });
    });
  }
  if (p === '/api/export.csv') {
    const head = ['项目', '日期', '部门', '职位', '姓名', '类型', '打卡时间', '备注', '照片'];
    const lines = [head.join(',')].concat(subs.map(s => [(s.jobName || ''), s.date, s.dept, s.role, s.name, s.type === 'out' ? '离场' : '到场', s.receivedAt, (s.note || '').replace(/[\r\n,]/g, ' '), s.photo].map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')));
    const urls = lanUrls(); const base = urls[0];
    const body = '\ufeff' + lines.map(l => l.replace(/"(photos\/[^"]+)"/g, '"' + base + '/$1"')).join('\r\n');
    return send(res, 200, 'text/csv; charset=utf-8', body, { 'Content-Disposition': 'attachment; filename="checkin.csv"' });
  }
  if (p === '/api/submit' && req.method === 'POST') {
    return readBody(req, 15 * 1024 * 1024, (err, buf) => {
      if (err) return json(res, { ok: false, error: '图片太大，请重拍（单张不超过 8MB）' }, 413);
      let body;
      try { body = JSON.parse(buf.toString('utf8')); } catch (e) { return json(res, { ok: false, error: '数据格式错误' }, 400); }
      const name = String(body.name || '').trim();
      const dept = String(body.dept || '').trim();
      const role = String(body.role || '').trim();
      const photo = String(body.photo || '');
      if (!name || !dept || !role) return json(res, { ok: false, error: '请填写部门、职位和姓名' }, 400);
      if (!/^data:image\/(jpeg|jpg|png);base64,/.test(photo)) return json(res, { ok: false, error: '请先拍照' }, 400);
      const b64 = photo.split(',')[1];
      const img = Buffer.from(b64, 'base64');
      if (img.length > 8 * 1024 * 1024) return json(res, { ok: false, error: '图片太大，请重拍' }, 413);
      const fname = Date.now() + '_' + crypto.randomBytes(3).toString('hex') + '.jpg';
      fs.writeFileSync(path.join(PHOTOS, fname), img);
      const now = new Date();
      const rec = {
        id: now.getTime().toString(36) + crypto.randomBytes(2).toString('hex'),
        job: String(body.job || ''), jobName: String(body.jobName || ''),
        date: String(body.date || now.toISOString().slice(0, 10)),
        dept: dept, role: role, name: name,
        type: body.type === 'out' ? 'out' : 'in',
        note: String(body.note || '').slice(0, 200),
        lat: body.lat ? Number(body.lat) : null, lng: body.lng ? Number(body.lng) : null, accuracy: body.accuracy ? Number(body.accuracy) : null,
        photo: 'photos/' + fname,
        receivedAt: now.toLocaleString('zh-CN', { hour12: false })
      };
      subs.push(rec); saveSubs();
      json(res, { ok: true, record: rec });
    });
  }
  // 单域名部署：可选托管报价系统静态文件
  if (APP_DIR && req.method === 'GET' && !p.startsWith('/api/') && !p.startsWith('/photos/')) {
    var rel = p === '/' ? 'index.html' : p.replace(/^\//, '');
    if (/\.(html|js|css|png|jpg|jpeg|svg|json|xlsx|woff2?|ico)$/i.test(rel) || rel === 'index.html') {
      return staticFile(res, APP_DIR, rel);
    }
  }
  send(res, 404, 'text/plain; charset=utf-8', 'not found');
});
server.listen(PORT, '0.0.0.0', () => {
  const urls = lanUrls();
  console.log('=========================================');
  console.log('  现场打卡服务已启动：' + CONFIG.project);
  console.log('  手机上传链接（同一 Wi-Fi，打卡/报销可切换）：');
  urls.filter(u => !u.includes('127.0.0.1')).forEach(u => console.log('    ' + u + '/m'));
  console.log('  电脑端查看：');
  console.log('    ' + urls[0] + '/admin');
  console.log('  数据目录：' + DATA);
  console.log('=========================================');
});
