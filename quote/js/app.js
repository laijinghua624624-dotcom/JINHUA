/* app.js — 两个界面：下单报价（对外，只显示报价）/ 利润看板（内部，底价+返点+利润） */
(function () {
  'use strict';
  var M = window.EQModel, APP = window.APP_DATA, EX = window.EQExport;
  var KEY = 'eq_quote_v2';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fatalOverlay(msg) {
    try {
      var d = document.getElementById('fatal-overlay');
      if (!d) { d = document.createElement('div'); d.id = 'fatal-overlay'; document.body.appendChild(d); }
      d.innerHTML = '<div class="fatal-box"><h3>页面出错了</h3><div class="fatal-msg">' + esc(msg) + '</div>' +
        '<div class="fatal-actions"><button id="fatal-reload">刷新页面</button>' +
        '<button id="fatal-reset">清除本地缓存并重载</button>' +
        '<button id="fatal-close">关闭</button></div>' +
        '<p class="fatal-tip">如果反复出现，请把上面这行报错发给开发者。</p></div>';
      document.getElementById('fatal-reload').onclick = function () { location.reload(); };
      document.getElementById('fatal-reset').onclick = function () {
        try { localStorage.removeItem(KEY); localStorage.removeItem('eq_quote_v1'); } catch (e) {}
        location.reload();
      };
      document.getElementById('fatal-close').onclick = function () { d.remove(); };
    } catch (e) {}
  }
  window.addEventListener('error', function (ev) {
    if (!ev) return;
    var where = String(ev.filename || '').split('/').pop();
    fatalOverlay((ev.message || '未知错误') + (where ? ' @ ' + where + ':' + (ev.lineno || '') : ''));
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    fatalOverlay('Promise 错误：' + ((r && (r.stack || r.message)) || r || '未知'));
  });
  function money(n) { return M.money(n); }
  function pct(x) { return M.round2(M.num(x) * 100) + '%'; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nowTime() { var d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); }

  var storageOK = (function () {
    try { localStorage.setItem('__eq_test__', '1'); localStorage.removeItem('__eq_test__'); return true; } catch (e) { return false; }
  })();
  function downloadText(text, filename, mime) {
    var blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
  }
  function defaultSettings() {
    return { company: '广州市灯龙影视器材租赁有限公司', address: '广州市海珠区华洲路170号自编0栋101室之一', preparer: '赖京华', noPrefix: 'BJ', taxRate: 1, markupRate: 30, cutRate: 20, rebateRate: 5, profitPin: '121223lai' };
  }

  /* ---------------- 状态 ---------------- */
  var state = (function () {
    var s = {
      catalog: clone(APP.catalog || []),
      kits: clone(APP.kits || []),
      projects: [],
      project: null,
      settings: defaultSettings(),
      ui: { tab: 'order', mode: 'order', profitUnlocked: false, catalogMajor: '' },
      meta: APP.meta || {}
    };
    s.project = emptyProject();
  ensureCatalogOvertime(s.catalog);
    if (storageOK) {
      try {
        var raw = localStorage.getItem(KEY) || localStorage.getItem('eq_quote_v1');
        if (raw) {
          var saved = JSON.parse(raw);
          if (saved.catalog && saved.catalog.length) {
            // 迁移：已删除供应商「捌零玖零」，旧本地数据里也一并清掉
            s.catalog = saved.catalog.filter(function (e) {
              var sp = e.supplier || e.src || '历史报价';
              return sp !== '捌零玖零';
            });
          }
          if (Array.isArray(saved.kits) && saved.kits.length) s.kits = saved.kits;
          if (saved.projects) s.projects = saved.projects;
          if (saved.project) { s.project = saved.project; ensureIds(s.project); }
          if (saved.settings) s.settings = Object.assign(defaultSettings(), saved.settings);
        }
      } catch (e) { /* ignore */ }
    }
    return s;
  })();

  function ensureProjectRates(p) {
    if (p.markupRate === undefined || p.markupRate === null) p.markupRate = M.num(state ? state.settings.markupRate : 30) / 100;
    if (p.cutRate === undefined || p.cutRate === null) p.cutRate = M.num(state ? state.settings.cutRate : 20) / 100;
    if (p.rebateRate === undefined || p.rebateRate === null) p.rebateRate = M.num(state ? state.settings.rebateRate : 5) / 100;
    return p;
  }
  function ensureProjectExtras(p) {
    if (!p) return p;
    p.overtime = p.overtime || [];
    p.expenses = p.expenses || [];
    return p;
  }
  function ensureIds(project) {
    if (!project) return project;
    ensureProjectExtras(project);
    project.id = project.id || uid('p');
    project.groups = (project.groups || []).map(function (g) {
      g.id = g.id || uid('g');
      g.items = (g.items || []).map(function (it) {
        it.id = it.id || uid('l');
        if (it.bottom === undefined || it.bottom === null) it.bottom = it.quote ? M.round2(M.num(it.quote) / 1.3) : 0;
        if (it.approved === undefined || it.approved === null) it.approved = (it.cost !== undefined && it.cost !== null) ? it.cost : M.round2(M.num(it.quote) * 0.8);
        delete it.cost;
        if (it.type === 'crew' && !it.note) it.note = ruleForCrew(it.name);
        return it;
      });
      return g;
    });
    project.outbound = project.outbound || {};
    if (!project.days) project.days = 1;
    if (project.taxRate === undefined || project.taxRate === null) project.taxRate = 0.01;
    ensureProjectRates(project);
    return project;
  }

  var saveTimer = null;
  function commit() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!storageOK) { setDraftStatus('未启用自动保存'); return; }
      try {
        localStorage.setItem(KEY, JSON.stringify({ catalog: state.catalog, kits: state.kits, projects: state.projects, project: state.project, settings: state.settings }));
        setDraftStatus('草稿已自动保存 ' + nowTime());
      } catch (e) { setDraftStatus('自动保存失败：' + (e && e.name || '存储空间不足')); }
    }, 200);
  }
  function setDraftStatus(t) { var e = $('#draft-status'); if (e) e.textContent = t || ''; }

  /* ---------------- 页签 / 模式 ---------------- */
  var TABS_MAIN = [{ id: 'order', label: '下单报价' }, { id: 'kits', label: '器材组合' }, { id: 'catalog', label: '器材库' },
                   { id: 'outbound', label: '出库单' }, { id: 'history', label: '历史项目' },
                   { id: 'profit', label: '数据统计' }, { id: 'settings', label: '设置' }];
  var PROJ_VIEWS = ['quote', 'overtime', 'expenses', 'stats'];
  var TABS_ORDER = TABS_MAIN;
  var TABS_PROFIT = TABS_MAIN;
  var PROFIT_TABS = { profit: 1, catalog: 1, history: 1, settings: 1 };
  var HASH_TABS = { order: 1, outbound: 1, kits: 1, overtime: 1, expenses: 1, stats: 1, profit: 1, catalog: 1, history: 1, settings: 1 };

  function renderTabs() {
    var tabs = state.ui.mode === 'order' ? TABS_ORDER : TABS_PROFIT;
    $('#tabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab ' + (state.ui.tab === t.id ? 'active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');
    var orderMode = state.ui.mode === 'order';
    var mb = $('#btn-mode');
    if (mb) { mb.style.display = orderMode ? 'none' : ''; mb.textContent = orderMode ? '数据统计 →' : '← 下单报价'; }
    $('#btn-mode').title = orderMode ? '进入内部数据统计（含底价/返点/利润）' : '返回对外下单报价界面';
    var ex = $('#btn-export-main');
    ex.textContent = orderMode ? '导出报价单' : '导出利润测算';
    ex.title = orderMode ? '导出给公司的报价单（不含底价/利润）' : '导出内部利润测算（含底价/返点，勿外发）';
    $('#top-sub').textContent = orderMode ? '下单报价' : '数据统计';
    var ms = $('#mode-status'); if (ms) ms.textContent = orderMode ? '界面：下单报价' : '界面：数据统计';
    document.title = (orderMode ? '下单报价' : '数据统计（内部）') + ' · 拍摄器材报价系统';
  }
  function setTab(tab, skipRender) {
    if ((tab === 'profit' || tab === 'settings') && state.settings.profitPin && !state.ui.profitUnlocked) {
      state.ui.pinTarget = tab;
      openProfitPin();
      return;
    }
    state.ui.tab = tab;
    if (tab === 'order') state.ui.mode = 'order';
    else if (PROFIT_TABS[tab]) state.ui.mode = 'profit';
    try { history.replaceState(null, '', '#' + tab); } catch (e) { location.hash = tab; }
    if (!skipRender) render();
  }
  function setMode(mode) { setTab(mode === 'profit' ? 'profit' : 'order'); }

  var view = $('#view');
  function render() {
    renderTabs();
    var f;
    if (state.ui.tab === 'order') {
      var pv = state.ui.projView || 'quote';
      if (pv === 'overtime') { view.innerHTML = renderOvertime(); updateOtTotals(); return; }
      if (pv === 'expenses') { view.innerHTML = renderExpenses(); updateExTotals(); return; }
      if (pv === 'stats') { view.innerHTML = renderStats(); return; }
      view.innerHTML = renderOrder();
      updateOrderDOM(); updateIssues();
      return;
    }
    if (state.ui.tab === 'profit') { view.innerHTML = renderProfit(); updateProfitDOM(); return; }
    if (state.ui.tab === 'kits') { view.innerHTML = state.ui.editingKit ? renderKitEditor() : renderKits(); return; }
    if (state.ui.tab === 'outbound') { view.innerHTML = renderOutbound(); return; }
    if (state.ui.tab === 'catalog') { view.innerHTML = renderCatalog(); applyCatalogFilter(); return; }
    if (state.ui.tab === 'history') { view.innerHTML = renderHistory(); return; }
    view.innerHTML = renderSettings();
  }

  /* ---------------- 通用 ---------------- */
  function groupById(gid) { return (scopeProject().groups || []).filter(function (g) { return g.id === gid; })[0]; }
  function scopeProject() {
    if (state.ui && state.ui.settleId) {
      var p = (state.projects || []).filter(function (x) { return x.id === state.ui.settleId; })[0];
      if (p) return p;
    }
    return state.project;
  }
  function itemById(g, iid) { return (g.items || []).filter(function (it) { return it.id === iid; })[0]; }
  function catalogByName(name) {
    var k = M.normalizeName(name);
    var i, list = state.catalog;
    for (i = 0; i < list.length; i++) if (M.normalizeName(list[i].name) === k) return list[i];
    for (i = 0; i < list.length; i++) {
      var al = list[i].aliases || [];
      for (var j = 0; j < al.length; j++) if (M.normalizeName(al[j]) === k) return list[i];
    }
    return null;
  }
  function normName(x) { return M.normalizeName(x); }
  function ruleForCrew(name) {
    var rules = (window.APP_DATA && window.APP_DATA.overtimeRules) || [];
    var n = normName(name);
    var i, fallback = '加班费14小时开始算加班费（标准另议）';
    for (i = 0; i < rules.length; i++) if (normName(rules[i].name) === n) return rules[i].note;
    for (i = 0; i < rules.length; i++) {
      var k = normName(rules[i].name);
      if (k.length >= 3 && (n.indexOf(k) >= 0 || k.indexOf(n) >= 0)) return rules[i].note;
    }
    return fallback;
  }
  function walkAllItems(cb) {
    (state.project.groups || []).forEach(function (g) { (g.items || []).forEach(cb); });
    (state.kits || []).forEach(function (k) { (k.items || []).forEach(cb); });
    (state.projects || []).forEach(function (p) { (p.groups || []).forEach(function (g) { (g.items || []).forEach(cb); }); });
  }
  function propagateRename(oldName, newName) {
    var k = M.normalizeName(oldName);
    walkAllItems(function (it) { if (M.normalizeName(it.name) === k) it.name = newName; });
  }
  function propagateCrewNote(name, note) {
    var k = M.normalizeName(name);
    walkAllItems(function (it) { if (it.type === 'crew' && M.normalizeName(it.name) === k) it.note = note; });
  }
  function toggleCatalogStar(eid) {
    var e = state.catalog.filter(function (x) { return x.id === eid; })[0]; if (!e) return;
    e.star = !e.star;
    commit(); render();
    toast(e.star ? '已标星：' + e.name + '（有利润空间）' : '已取消星标', 'ok');
  }
  function toggleCatalogLock(eid) {
    var e = state.catalog.filter(function (x) { return x.id === eid; })[0]; if (!e) return;
    e.lock = !e.lock;
    commit(); render();
    toast(e.lock ? '已锁定价格：' + e.name : '已解锁价格：' + e.name, 'ok');
  }
  function openCrewCard(eid) {
    var e = state.catalog.filter(function (x) { return x.id === eid; })[0]; if (!e) return;
    var p = (e.otStart || e.otRate) ? { start: e.otStart, rate: e.otRate, unit: e.otUnit || '小时' } : parseOvertime(e.note);
    var start = p ? p.start : '';
    var rate = p ? p.rate : '';
    var unit = p ? (p.unit || '小时') : '小时';
    openModal('<div class="modal" style="width:min(720px,100%)"><div class="modal-head"><h3>岗位资料卡 · ' + esc(e.name) + '</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
      '<div class="modal-body"><div class="form-grid" style="grid-template-columns:1fr 1fr">' +
      '<label class="field span-2">岗位名称<input id="cc-name" value="' + esc(e.name) + '"></label>' +
      '<label class="field">报价（元/天）<input id="cc-quote" type="number" step="0.01" value="' + esc(e.quote) + '"></label>' +
      '<label class="field">底价（元/天）<input id="cc-bottom" type="number" step="0.01" value="' + esc(e.bottom) + '"></label>' +
      '<label class="field">核价（元/天）<input id="cc-approved" type="number" step="0.01" value="' + esc(e.approved) + '"></label>' +
      '<label class="field">加班费单位<select id="cc-unit"><option' + (unit === '小时' ? ' selected' : '') + '>小时</option><option' + (unit === '组' ? ' selected' : '') + '>组</option></select></label>' +
      '<label class="field">加班起算（小时）<input id="cc-start" type="number" min="0" step="0.5" value="' + esc(start) + '"></label>' +
      '<label class="field">加班费（元/小时）<input id="cc-rate" type="number" min="0" step="0.01" value="' + esc(rate) + '"></label>' +
      '<label class="field span-2">加班费标准说明（可手改）<input id="cc-note" value="' + esc(e.note || '') + '"></label>' +
      '</div><p class="muted small" style="margin:10px 0 0">起算小时和费用按岗位单独保存；不会自动覆盖项目里已排好的人员。</p>' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px"><input type="checkbox" id="cc-apply"> 保存后同时应用到当前项目里的同名人员（仅此岗位）</label>' +
      '</div><div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">取消</button>' +
      '<button class="btn primary" data-act="crew-card-save" data-eid="' + e.id + '">保存资料卡</button></div></div>');
  }
  function saveCrewCard(eid) {
    var e = state.catalog.filter(function (x) { return x.id === eid; })[0]; if (!e) return;
    var name = ($('#cc-name') || {}).value; name = name ? name.trim() : e.name;
    var quote = M.num(($('#cc-quote') || {}).value);
    var bottom = M.num(($('#cc-bottom') || {}).value);
    var approved = M.num(($('#cc-approved') || {}).value);
    var start = ($('#cc-start') || {}).value === '' ? null : M.num(($('#cc-start') || {}).value);
    var rate = ($('#cc-rate') || {}).value === '' ? null : M.num(($('#cc-rate') || {}).value);
    var unit = ($('#cc-unit') || {}).value || '小时';
    var noteInput = ($('#cc-note') || {}).value;
    e.name = name; e.quote = quote; e.bottom = bottom; e.approved = approved;
    e.otStart = start; e.otRate = rate; e.otUnit = unit;
    e.note = (noteInput && noteInput.trim()) ? noteInput.trim() : overtimeText(start, rate, unit);
    if ((!noteInput || !noteInput.trim()) && !start && !rate) e.note = '';
    if (($('#cc-apply') || {}).checked) propagateCrewNote(e.name, e.note);
    closeModal(); commit(); render();
    toast('已保存岗位资料卡：' + e.name, 'ok');
  }
  function autoCategorize(silent) {
    var changed = 0;
    state.catalog.forEach(function (e) {
      if (e.type === 'crew' || e.catManual) return;
      var c = M.classifyName(e.name, e.type);
      if (c && c !== e.cat) { e.cat = c; changed += 1; }
    });
    (state.kits || []).forEach(function (k) {
      (k.items || []).forEach(function (it) { if (it.type !== 'crew') it.cat = M.classifyName(it.name, it.type); });
    });
    (state.project.groups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) { if (it.type !== 'crew') it.cat = M.classifyName(it.name, it.type); });
    });
    (state.projects || []).forEach(function (p) {
      (p.groups || []).forEach(function (g) {
        (g.items || []).forEach(function (it) { if (it.type !== 'crew') it.cat = M.classifyName(it.name, it.type); });
      });
    });
    if (!silent) { commit(); render(); toast(changed ? '已自动识别 ' + changed + ' 项的详细分类' : '分类已是最新', changed ? 'ok' : ''); }
    return changed;
  }
  function openCatalogHealth() {
    var C = state.catalog;
    var norm = M.normalizeName;
    var names = {}, dups = [];
    C.forEach(function (e) {
      var k = norm(e.name);
      (names[k] = names[k] || []).push(e);
    });
    Object.keys(names).forEach(function (k) { if (names[k].length > 1) dups.push(names[k]); });
    var zero = C.filter(function (e) { return e.type !== 'crew' && !M.num(e.quote); }).length;
    var uncat = C.filter(function (e) { return e.type !== 'crew' && e.cat === '其他配件'; }).length;
    var missing = 0;
    (state.kits || []).forEach(function (k) {
      (k.items || []).forEach(function (it) { if (!C.some(function (e) { return norm(e.name) === norm(it.name); })) missing += 1; });
    });
    var dupText = dups.slice(0, 6).map(function (list) {
      return list[0].name + '（' + list.map(function (e) { return '¥' + M.round2(e.quote); }).join(' / ') + '）';
    }).join('；');
    openModal('<div class="modal" style="width:min(680px,100%)"><div class="modal-head"><h3>数据体检</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="kv"><span class="k">器材总数</span><span class="v">' + C.length + ' 项</span></div>' +
      '<div class="kv"><span class="k">同名器材（可能价格不一致）</span><span class="v">' + dups.length + ' 组' + (dupText ? '：' + esc(dupText) : '') + '</span></div>' +
      '<div class="kv"><span class="k">报价为 0 的器材</span><span class="v">' + zero + ' 项</span></div>' +
      '<div class="kv"><span class="k">仍归在「其他配件」</span><span class="v">' + uncat + ' 项</span></div>' +
      '<div class="kv"><span class="k">组合里找不到器材库价格</span><span class="v">' + missing + ' 行</span></div>' +
      '<p class="muted small" style="margin:12px 0 0">建议：优先给器材库/人员标准补齐组合里用到的名称；同名器材改名区分（含供应商或型号后缀）；报价为 0 的逐项确认。</p>' +
      '</div><div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">知道了</button></div></div>');
  }
  function countNameRefs(name) {
    var k = M.normalizeName(name), n = 0;
    walkAllItems(function (it) { if (M.normalizeName(it.name) === k) n += 1; });
    return n;
  }
  var smartImport = null;

  function openSmartImport() {
    openModal('<div class="modal" style="width:min(720px,100%)"><div class="modal-head"><h3>智能识别导入</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
      '<div class="modal-body"><div id="smart-drop" style="border:1.5px dashed var(--line-2);border-radius:12px;padding:28px 18px;text-align:center;background:#fafbf9">' +
      '<div style="font-size:30px;line-height:1">📄</div><p style="margin:10px 0 4px;font-weight:700">把供应商的器材表格拖到这里，或选择文件</p>' +
      '<p class="muted small" style="margin:0 0 14px">支持 .xlsx / .csv / .tsv；自动识别名称、型号、分类、底价/报价、单位、库存</p>' +
      '<input id="smart-file" type="file" accept=".xlsx,.csv,.tsv,.txt" style="display:none">' +
      '<button class="btn primary" data-act="smart-pick">选择文件</button>' +
      '<p class="muted small" style="margin:14px 0 0">旧版 .xls 请先用 Excel 另存为 .xlsx 或 CSV。</p></div></div>' +
      '<div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">取消</button></div></div>');
  }
  function smartPickFile() { var f = $('#smart-file'); if (f) f.click(); }
  function smartFileText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(new Error('文件读取失败')); };
      if (/\.(csv|tsv|txt)$/i.test(file.name)) { r.onload = function () { resolve({ text: String(r.result || '') }); }; r.readAsText(file, 'utf-8'); }
      else { r.onload = function () { resolve({ buffer: r.result }); }; r.readAsArrayBuffer(file); }
    });
  }
  function smartCellText(cell) {
    if (!cell) return '';
    var v = cell.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map(function (x) { return x.text || ''; }).join('');
      if (v.text !== undefined) return String(v.text);
      if (v.result !== undefined) return String(v.result);
      if (v.hyperlink !== undefined) return String(v.text || v.hyperlink);
      if (v.formula !== undefined) return '';
    }
    return String(v);
  }
  function smartSplitLine(line, d) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === d && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(function (x) { return x.trim(); });
  }
  function smartParseDelimited(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return [];
    var head = lines.slice(0, 6).join('\n');
    var counts = { '\t': (head.match(/\t/g) || []).length, ',': (head.match(/,/g) || []).length, ';': (head.match(/;/g) || []).length };
    var d = '\t'; Object.keys(counts).forEach(function (k) { if (counts[k] > counts[d]) d = k; });
    return lines.map(function (l) { return smartSplitLine(l, d); });
  }
  var SMART_COLS = {
    name: ['名称', '品名', '器材', '设备', '产品', '物料', '道具', '项目', '品名规格'],
    model: ['型号', '规格型号', '规格', '型号规格'],
    brand: ['品牌', '厂商', '厂家'],
    cat: ['类别', '分类', '类型', '品类'],
    unit: ['单位'],
    stock: ['库存', '数量', '现有', '在库', '可租'],
    bottom: ['底价', '成本价', '成本', '进货价', '采购价', '结算价', '同行价'],
    quote: ['报价', '销售价', '售价', '租价', '租金', '日租', '单价', '价格'],
    supplier: ['供应商', '供货商', '商家', '公司'],
    note: ['备注', '说明', '参数', '配置', '描述', '备注说明'],
    spec: ['规格', '型号', '参数']
  };
  function smartMatchHeader(cell) {
    var t = String(cell || '').replace(/\s/g, '');
    if (!t) return null;
    var order = ['bottom', 'name', 'model', 'brand', 'cat', 'unit', 'stock', 'quote', 'supplier', 'note'];
    for (var i = 0; i < order.length; i++) {
      var k = order[i], arr = SMART_COLS[k];
      for (var j = 0; j < arr.length; j++) if (t.indexOf(arr[j]) >= 0) return k;
    }
    return null;
  }
  function smartDetectHeader(rows) {
    var best = { idx: -1, score: 0, map: null };
    var max = Math.min(rows.length, 20);
    for (var i = 0; i < max; i++) {
      var row = rows[i] || [], map = {}, score = 0;
      for (var c = 0; c < row.length; c++) {
        var k = smartMatchHeader(row[c]);
        if (k && map[k] === undefined) { map[k] = c; score += (k === 'name' ? 3 : (k === 'bottom' || k === 'quote' ? 2 : 1)); }
      }
      if (map.name === undefined && map.model !== undefined) { map.name = map.model; }
      if (map.name !== undefined && score > best.score) best = { idx: i, score: score, map: map };
    }
    if (best.idx < 0) {
      // 没有表头时按位置兜底：第一列名称，后面的数字列作为价格
      var fallback = { idx: -1, score: 0, map: { name: 0 } };
      return fallback;
    }
    return best;
  }
  function smartNum(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).replace(/[¥￥,，\s元]/g, '');
    var m = s.match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  function smartPriceSet(value, kind) {
    var rate = M.num(state.settings.markupRate) || 30, cut = M.num(state.settings.cutRate) || 20;
    var bottom = 0, quote = 0;
    if (value === null || value === undefined || isNaN(value)) return { bottom: 0, quote: 0, approved: 0 };
    if (kind === 'bottom') { bottom = M.round2(value); quote = M.round2(bottom * (1 + rate / 100)); }
    else { quote = M.round2(value); bottom = M.round2(quote / (1 + rate / 100)); }
    return { bottom: bottom, quote: quote, approved: M.round2(quote * (1 - cut / 100)) };
  }
  function smartRowsFromSheets(sheets) {
    var out = [], debug = [];
    sheets.forEach(function (sh) {
      var rows = sh.rows || [];
      if (!rows.length) return;
      var found = smartDetectHeader(rows);
      var map = found.map || {}, start = found.idx + 1;
      var hasBottom = map.bottom !== undefined, hasQuote = map.quote !== undefined;
      for (var i = start; i < rows.length; i++) {
        var r = rows[i] || [];
        var rawName = String(r[map.name] === undefined ? '' : r[map.name]).trim();
        var rawModel = String(map.model === undefined ? '' : (r[map.model] || '')).trim();
        var name = rawName || rawModel;
        if (!name || name.length < 2) continue;
        if (/^(合计|小计|总计|备注|说明|序号|名称|品名|器材|设备)/.test(name)) continue;
        var cat = String(map.cat === undefined ? '' : (r[map.cat] || '')).trim();
        var unit = String(map.unit === undefined ? '' : (r[map.unit] || '')).trim();
        var stock = map.stock === undefined ? null : smartNum(r[map.stock]);
        var note = String(map.note === undefined ? '' : (r[map.note] || '')).trim();
        var brand = String(map.brand === undefined ? '' : (r[map.brand] || '')).trim();
        if (rawModel && name.indexOf(rawModel) < 0) note = [note, '型号 ' + rawModel].filter(Boolean).join('；');
        if (brand && name.indexOf(brand) < 0) note = [note, brand].filter(Boolean).join('；');
        var value = null, kind = null;
        if (hasBottom) { value = smartNum(r[map.bottom]); kind = 'bottom'; }
        else if (hasQuote) {
          value = smartNum(r[map.quote]);
          var qh = String(r[map.quote] || '');
          kind = /单价|价格/.test(qh) && !/报价|销售|售价|租/.test(qh) ? 'generic' : 'quote';
        }
        if (value === null) {
          // 无表头兜底：取该行第一个数字作为价格
          for (var c = 1; c < r.length; c++) { var n = smartNum(r[c]); if (n !== null && n > 0) { value = n; kind = 'generic'; break; } }
        }
        out.push({ name: name, cat: cat || M.classifyName(name, 'equipment'), unit: unit || '个', stock: stock, note: note, value: value, kind: kind || 'generic', sheet: sh.name || '' });
      }
      debug.push(sh.name + ':' + Math.max(0, rows.length - start));
    });
    return out;
  }
  function smartCalcRow(r, mode) {
    if (r.value === null || r.value === undefined) return { bottom: 0, quote: 0, approved: 0 };
    var kind = r.kind;
    if (kind === 'generic') kind = mode === 'bottom' ? 'bottom' : 'quote';
    return smartPriceSet(r.value, kind);
  }
  function smartRenderPreview() {
    if (!smartImport) return;
    var rows = smartImport.rows || [];
    var mode = smartImport.mode || 'auto';
    var body = rows.slice(0, 50).map(function (r, i) {
      var p = smartCalcRow(r, mode);
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.cat || '') + '</td><td class="center">' + esc(r.unit || '') + '</td><td class="num">' + (r.stock === null ? '—' : r.stock) + '</td>' +
        '<td class="num">' + money(p.bottom) + '</td><td class="num">' + money(p.quote) + '</td><td class="num muted">' + money(p.approved) + '</td>' +
        '<td class="muted small">' + esc(r.note || '') + '</td></tr>';
    }).join('');
    openModal('<div class="modal" style="width:min(1180px,100%)"><div class="modal-head"><h3>识别结果 · ' + rows.length + ' 项</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
      '<div class="modal-body"><div class="toolbar" style="margin:0 0 12px;flex-wrap:wrap">' +
      '<span class="muted small">来源：' + esc(smartImport.fileName || '') + '</span>' +
      '<select id="smart-price-mode" style="padding:8px 10px;border:1px solid var(--line-2);border-radius:9px">' +
      '<option value="auto"' + (mode === 'auto' ? ' selected' : '') + '>价格按表头识别</option>' +
      '<option value="bottom"' + (mode === 'bottom' ? ' selected' : '') + '>整列按底价</option>' +
      '<option value="quote"' + (mode === 'quote' ? ' selected' : '') + '>整列按报价</option>' +
      '</select>' +
      '<input id="smart-supplier" value="' + esc(smartImport.supplier || '') + '" placeholder="供应商名称" style="padding:8px 10px;border:1px solid var(--line-2);border-radius:9px;min-width:160px">' +
      '<select id="smart-dedupe" style="padding:8px 10px;border:1px solid var(--line-2);border-radius:9px">' +
      '<option value="skip">同名器材：跳过</option><option value="update">同名器材：更新价格</option><option value="add">同名也新增</option></select>' +
      '<span class="spacer"></span><span class="muted small">预览前 50 行；底价/报价按当前加价率换算</span></div>' +
      '<div style="max-height:52vh;overflow:auto;border:1px solid var(--line);border-radius:10px"><table class="tbl"><thead><tr><th>#</th><th>名称</th><th>分类</th><th>单位</th><th>库存</th><th>底价</th><th>报价</th><th>核价</th><th>备注</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      (rows.length > 50 ? '<p class="muted small" style="margin:8px 0 0">仅预览前 50 行，导入会包含全部 ' + rows.length + ' 项。</p>' : '') +
      '</div><div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">取消</button>' +
      '<button class="btn primary" data-act="smart-import-confirm">导入 ' + rows.length + ' 项</button></div></div>');
  }
  function smartReadFile(file) {
    toast('正在识别「' + file.name + '」…', 'ok');
    smartFileText(file).then(function (data) {
      var sheets = [];
      if (data.text !== undefined) {
        sheets.push({ name: 'CSV', rows: smartParseDelimited(data.text) });
      } else {
        if (!window.ExcelJS) throw new Error('Excel 解析组件未加载，请刷新页面');
        var wb = new ExcelJS.Workbook();
        return wb.xlsx.load(data.buffer).then(function () {
          wb.eachSheet(function (ws) {
            var rows = [];
            ws.eachRow({ includeEmpty: false }, function (row) {
              var vals = [], n = Math.min(row.cellCount || 0, 40);
              for (var c = 1; c <= n; c++) vals.push(smartCellText(row.getCell(c)));
              rows.push(vals);
            });
            sheets.push({ name: ws.name, rows: rows });
          });
          return sheets;
        });
      }
      return sheets;
    }).then(function (sheets) {
      var rows = smartRowsFromSheets(sheets || []);
      if (!rows.length) { toast('没有识别到器材行，请确认表格含名称/价格列', 'err'); return; }
      smartImport = { rows: rows, fileName: file.name, mode: 'auto', supplier: file.name.replace(/\.[^.]+$/, '') };
      smartRenderPreview();
      toast('识别到 ' + rows.length + ' 项，请预览确认', 'ok');
    }).catch(function (e) { toast(e.message || '识别失败', 'err'); });
  }
  function smartConfirmImport() {
    if (!smartImport) return;
    var mode = ($('#smart-dedupe') || {}).value || 'skip';
    var priceMode = ($('#smart-price-mode') || {}).value || 'auto';
    var supplier = (($('#smart-supplier') || {}).value || '').trim() || smartImport.supplier || '供应商导入';
    var rows = smartImport.rows || [];
    var existing = {};
    state.catalog.forEach(function (e) { if (e.type !== 'crew') existing[M.normalizeName(e.name)] = e; });
    var added = 0, updated = 0, skipped = 0;
    rows.forEach(function (r) {
      var key = M.normalizeName(r.name);
      var old = existing[key];
      var p = smartCalcRow(r, priceMode);
      if (old && mode === 'skip') { skipped++; return; }
      if (old && mode === 'update') {
        old.bottom = p.bottom; old.quote = p.quote; old.approved = p.approved;
        if (r.stock !== null) old.stock = r.stock;
        if (r.unit) old.unit = r.unit;
        if (r.cat) old.cat = r.cat;
        if (r.note) old.note = r.note;
        updated++; return;
      }
      var item = {
        id: uid('eq'), key: key, name: r.name, cat: r.cat || M.classifyName(r.name, 'equipment'), unit: r.unit || '个', type: 'equipment',
        bottom: p.bottom, quote: p.quote, approved: p.approved, stock: r.stock === null ? null : r.stock,
        note: r.note || '', supplier: supplier, group: '供应商导入', src: '智能导入'
      };
      state.catalog.push(item); existing[key] = item; added++;
    });
    commit(); closeModal(); smartImport = null; render();
    toast('导入完成：新增 ' + added + ' 项 · 更新 ' + updated + ' 项 · 跳过 ' + skipped + ' 项', 'ok');
  }

  function addCatalog() {
    var name = prompt('新增器材名称（含型号），例如：Sony FX6 Camera摄影机机身：');
    if (!name) return;
    var item = {
      id: uid('eq'), key: M.normalizeName(name), name: name.trim(), cat: M.classifyName(name.trim(), 'equipment'), unit: '个', type: 'equipment',
      bottom: 0, quote: 0, approved: 0, stock: null, note: '', supplier: '自定义', group: '自定义', src: '自定义'
    };
    state.catalog.push(item); commit(); render();
    toast('已新增器材，可直接在表格里改价格', 'ok');
  }
  function delCatalog(eid) {
    var e = state.catalog.filter(function (x) { return x.id === eid; })[0];
    if (!e) return;
    var refs = countNameRefs(e.name);
    var msg = '删除' + (e.type === 'crew' ? '岗位' : '器材') + '「' + e.name + '」？';
    if (refs) msg += '\\n\\n注意：名称被 ' + refs + ' 处组合/项目引用，删除后这些行会找不到价格（仍保留名称）。';
    if (!confirm(msg)) return;
    state.catalog = state.catalog.filter(function (x) { return x.id !== eid; });
    commit(); render(); toast('已删除', 'ok');
  }
  function openCrewAdd() {
    openModal('<div class="modal" style="width:min(680px,100%)"><div class="modal-head"><h3>新增人员岗位</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
      '<div class="modal-body"><div class="form-grid" style="grid-template-columns:1fr 1fr">' +
      '<label class="field span-2">岗位名称<input id="ca-name" placeholder="例如：跟机员 / 摄影大助理"></label>' +
      '<label class="field">报价（元/天）<input id="ca-quote" type="number" step="0.01" value="600"></label>' +
      '<label class="field">底价（元/天）<input id="ca-bottom" type="number" step="0.01" value="600"></label>' +
      '<label class="field">核价（元/天）<input id="ca-approved" type="number" step="0.01" value="600"></label>' +
      '<label class="field">加班起算（小时）<input id="ca-start" type="number" min="0" step="0.5" placeholder="例如 3"></label>' +
      '<label class="field">加班费（元/小时）<input id="ca-rate" type="number" min="0" step="0.01" placeholder="例如 80"></label>' +
      '</div><p id="ca-ot-preview" class="muted small" style="margin:10px 0 0">不填加班时间和费用则使用默认标准。</p>' +
      '<p class="muted small" style="margin:6px 0 0">人员价格不会自动加价/砍价，按你填的数值保存；加班标准会保存到岗位资料卡。</p></div>' +
      '<div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">取消</button>' +
      '<button class="btn primary" data-act="crew-add-save">保存并新增</button></div></div>');
  }
  function saveCrewAdd() {
    var name = ($('#ca-name') || {}).value;
    name = name ? name.trim() : '';
    if (!name) { toast('请填写岗位名称', 'warn'); return; }
    var quote = M.num(($('#ca-quote') || {}).value);
    var bottom = M.num(($('#ca-bottom') || {}).value);
    var approved = M.num(($('#ca-approved') || {}).value);
    var startVal = (($('#ca-start') || {}).value === '' || ($('#ca-start') || {}).value === undefined) ? null : M.num(($('#ca-start') || {}).value);
    var rateVal = (($('#ca-rate') || {}).value === '' || ($('#ca-rate') || {}).value === undefined) ? null : M.num(($('#ca-rate') || {}).value);
    var note = (startVal !== null || rateVal !== null) ? overtimeText(startVal, rateVal, '小时') : ruleForCrew(name);
    var op = parseOvertime(note);
    state.catalog.push({
      id: uid('eq'), key: M.normalizeName(name), name: name, cat: '人员', unit: '人', type: 'crew',
      bottom: bottom, quote: quote, approved: approved, stock: null, note: note,
      otStart: startVal !== null ? startVal : (op ? op.start : null),
      otRate: rateVal !== null ? rateVal : (op ? op.rate : null),
      otUnit: '小时',
      supplier: '自定义', group: '人员', src: '自定义'
    });
    closeModal(); commit(); render();
    toast('已新增岗位「' + name + '」', 'ok');
  }
  function syncCrewNotesFromCatalog() {
    var map = {};
    state.catalog.forEach(function (e) { if (e.type === 'crew') map[M.normalizeName(e.name)] = e.note || ''; });
    var n = 0;
    walkAllItems(function (it) {
      if (it.type !== 'crew') return;
      var v = map[M.normalizeName(it.name)];
      if (v !== undefined && it.note !== v) { it.note = v; n += 1; }
    });
    commit(); render();
    toast(n ? '已同步 ' + n + ' 行人员加班费标准' : '人员和组合的加班费标准已是最新', n ? 'ok' : '');
  }
  function srcLabel(src) { return String(src || '').replace('历史核价单', '历史').replace(/\+/g, '/'); }
  function supOf(e) { return e.supplier || e.src || '历史报价'; }
  function grpOf(e) { return e.group || ''; }
  function parseOvertime(note) {
    var t = String(note || '');
    var m = t.match(/(\d+)\s*小时[^。；]*?加班费(?:为|是)?\s*([\d.]+)\s*\/?\s*(小时|时|组)/);
    if (m) return { start: +m[1], rate: +m[2], unit: m[3] === '组' ? '组' : '小时' };
    m = t.match(/加班费[：:]\s*(\d+)\s*小时后[；;]\s*([\d.]+)\s*\/?时\/?(组)?/);
    if (m) return { start: +m[1], rate: +m[2], unit: m[3] ? '组' : '小时' };
    m = t.match(/(\d+)\s*小时.*?([\d.]+)\s*\/?\s*(小时|时|组)/);
    if (m) return { start: +m[1], rate: +m[2], unit: m[3] === '组' ? '组' : '小时' };
    return null;
  }
  function overtimeText(start, rate, unit) {
    if (!start && !rate) return '';
    if (unit === '组') return '加班费：' + start + '小时后；' + rate + '/时/组';
    return '加班费' + start + '小时开始算加班费，加班费为' + rate + '/小时';
  }
  function ensureCatalogOvertime(cat) {
    (cat || []).forEach(function (e) {
      if (e.type !== 'crew') return;
      if (e.otStart === undefined) {
        var p = parseOvertime(e.note);
        e.otStart = p ? p.start : null;
        e.otRate = p ? p.rate : null;
        e.otUnit = p ? p.unit : '小时';
      }
    });
  }
  function isStar(e) { return !!e.star; }
  function isLock(e) { return !!e.lock; }
  function majorOf(e) {
    if (e.type === 'crew') return '人员';
    var c = String(e.cat || '');
    if (/^灯光|^LED|^聚光|^柔光|^灯架|^布景|电源\/线材|布架|电箱|耗材/.test(c)) return '灯光器材';
    if (/摄影|镜头|滤镜|图传|监视器|存储卡|电池|稳定器|跟焦|支撑|遮光斗|其他配件/.test(c)) return '摄影器材';
    return '其他';
  }
  function field(label, key, val, cls, type, attrs) {
    return '<label class="field ' + (cls || '') + '">' + label +
      '<input type="' + (type || 'text') + '" data-pfield="' + key + '" value="' + esc(val === undefined || val === null ? '' : val) + '" ' + (attrs || '') + '></label>';
  }
  function stockBadge(it) {
    var ce = catalogByName(it.name);
    if (!ce || ce.stock === null || ce.stock === undefined || ce.stock === '') return '';
    var low = M.num(it.qty) > M.num(ce.stock);
    return ' <span class="stock-badge ' + (low ? 'low' : '') + '" title="器材库可用数量">库存 ' + ce.stock + '</span>';
  }

  /* ================= 界面一：下单报价（对外） ================= */
  function projectTabs(active) {
    var items = [['quote', '报价单'], ['overtime', '加班记录'], ['expenses', '报销整理'], ['stats', '费用统计']];
    return '<div class="proj-tabs">' + items.map(function (x) {
      return '<button class="chip ' + (active === x[0] ? 'active' : '') + '" data-act="proj-view" data-view="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '<span class="muted small" style="margin-left:8px">当前项目内</span>' +
      '<button class="btn sm solid" style="margin-left:auto" data-act="share-links">🔗 分享链接</button></div>';
  }
  function renderOrder() {
    var p = state.project, t = M.totals(p);
    return '<div class="page">' +
      '<section class="card"><div class="card-head"><h2>项目信息</h2><span class="sub">改完自动保存；点右上角「保存」进入历史项目</span></div>' +
      '<div class="card-body"><div class="form-grid">' +
      field('项目名称', 'name', p.name, 'span-2') +
      field('客户 / 事业部', 'client', p.client) +
      field('拍摄日期', 'shootDate', p.shootDate, '', 'date') +
      field('活动地址', 'location', p.location, 'span-2') +
      field('拍摄天数', 'days', M.lineDays(p), '', 'number', 'min="1" step="1"') +
      field('税率 %', 'taxRatePct', M.round2(M.num(p.taxRate) * 100), '', 'number', 'min="0" step="0.01"') +
      field('备注 / 说明（打印在报价单顶部）', 'remark', p.remark, 'span-4') +
      '</div></div></section>' +
      '<div class="toolbar">' +
      '<button class="btn light" data-act="open-kits">从组合添加机位</button>' +
      '<button class="btn light" data-act="go-kits">管理组合</button>' +
      '<button class="btn light" data-act="add-group">＋ 新增机位组</button>' +
      '<button class="btn light" data-act="sync-prices">按器材库刷新价格</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn light" data-act="share-links">🔗 分享链接</button>' +
      '<button class="btn light" data-act="print-quote">打印 / 存 PDF</button>' +
      '</div>' +
      '<div id="issues"></div>' +
      '<div id="groups">' + p.groups.map(orderGroupHtml).join('') + '</div>' +
      '<div class="totals-bar" id="order-totals">' + orderTotalsHtml() + '</div>' +
      '</div>';
  }
  function orderGroupHtml(g) {
    var gt = M.groupTotals(g, state.project);
    var rows = g.items.map(function (it) { return orderRowHtml(g, it); }).join('');
    if (!g.items.length) rows = '<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">这个机位还没有器材，点右上角「＋ 添加器材」</td></tr>';
    return '<section class="card group-card" data-gcard="' + g.id + '">' +
      '<div class="group-head">' +
      '<input class="g-name" data-gfield="name" data-gid="' + g.id + '" value="' + esc(g.name) + '" title="点击重命名机位组">' +
      '<span class="group-count" data-ogcount="' + g.id + '">' + gt.count + ' 项 / ' + gt.qty + ' 件</span>' +
      '<span class="g-sum" data-ogsum="' + g.id + '">报价 ' + money(gt.quote) + '</span>' +
      '<label class="pkg-toggle"><input type="checkbox" data-gpkg="' + g.id + '"' + (g.pkg ? ' checked' : '') + '> 整组报价</label>' +
      (g.pkg ? '<span class="pkg-field">整组报价 ¥<input class="price" type="number" min="0" step="0.01" data-gpfield="pkgQuote" data-gid="' + g.id + '" value="' + esc(M.num(g.pkgQuote)) + '"></span>' : '') +
      '<div class="g-actions">' +
      '<button class="btn sm light" data-act="add-item" data-gid="' + g.id + '">＋ 添加器材</button>' +
      '<button class="btn sm light" data-act="save-kit" data-gid="' + g.id + '" title="把这个机位组存成常用组合">存为组合</button>' +
      '<button class="btn sm danger" data-act="del-group" data-gid="' + g.id + '">删除机位组</button>' +
      '</div></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
      '<th style="min-width:250px">器材 / 人员</th><th>数量</th><th>单位</th><th>报价单价</th><th>报价合计</th><th>备注 / 加班规则</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }
  function orderRowHtml(g, it) {
    var gid = g.id, iid = it.id;
    var cat = it.cat || '';
    var tagCls = it.type === 'crew' ? 'crew' : (cat.indexOf('灯光') >= 0 ? 'light' : '');
    return '<tr data-gid="' + gid + '" data-iid="' + iid + '">' +
      '<td><span class="cat-tag ' + tagCls + '">' + (it.type === 'crew' ? '人员' : '器材') + '</span> ' +
      '<input class="name-edit" data-ifield="name" value="' + esc(it.name) + '">' + stockBadge(it) + '</td>' +
      '<td><input class="qty" type="number" min="0" step="1" data-ifield="qty" value="' + esc(it.qty) + '"></td>' +
      '<td><input class="input-plain" style="width:46px" data-ifield="unit" value="' + esc(it.unit || '个') + '"></td>' +
      '<td><input class="price" type="number" step="0.01" min="0" data-ifield="quote" value="' + esc(it.quote) + '" title="给公司的报价"' + (g.pkg ? ' disabled' : '') + '></td>' +
      '<td class="num money" data-oamount="' + gid + '|' + iid + '">' + (g.pkg ? '含整组' : money(M.lineQuote(it, state.project))) + '</td>' +
      '<td><input class="note" data-ifield="note" value="' + esc(it.note || '') + '" placeholder="备注"></td>' +
      '<td style="text-align:center"><button class="del" data-act="del-item" data-gid="' + gid + '" data-iid="' + iid + '" title="删除">✕</button></td>' +
      '</tr>';
  }
  function toggleGroupPkg(gid, on) {
    var g = groupById(gid); if (!g) return;
    var gt = M.groupTotals(g, state.project);   // 先按明细算，再切整组，避免默认值变 0
    g.pkg = !!on;
    if (g.pkg) {
      if (g.pkgQuote === undefined || g.pkgQuote === null || g.pkgQuote === 0) g.pkgQuote = gt.quote || 0;
      if (g.pkgBottom === undefined || g.pkgBottom === null || g.pkgBottom === 0) g.pkgBottom = gt.bottom || 0;
      if (g.pkgApproved === undefined || g.pkgApproved === null || g.pkgApproved === 0) g.pkgApproved = gt.approved || 0;
      if (g.pkgQty === undefined || g.pkgQty === null) g.pkgQty = 1;
    }
    commit(); render();
    toast(g.pkg ? '已改为整组报价（明细只用于出库）' : '已改回明细报价', 'ok');
  }
  function orderTotalsHtml() {
    var t = M.totals(state.project);
    return '<div class="t-item"><span class="t-label">报价合计（未税）</span><span class="t-val accent" data-ot="quote">' + money(t.quote) + '</span></div>' +
      '<div class="t-item"><span class="t-label">税费</span><span class="t-val" data-ot="tax">' + money(t.tax) + '</span></div>' +
      '<div class="t-item"><span class="t-label">项目合计（含税）</span><span class="t-val green" data-ot="quoteTotal">' + money(t.quoteTotal) + '</span></div>' +
      '<div class="divider"></div>' +
      '<div class="t-item"><span class="t-label">数量 / 行数</span><span class="t-val" data-ot="qty">' + t.qty + ' / ' + t.lines + '</span></div>' +
      '<span class="spacer"></span>' +
      '<span class="t-note">' + M.lineDays(state.project) + ' 天 · 税率 ' + pct(M.num(state.project.taxRate)) + '</span>';
  }
  function updateOrderDOM() {
    var t = M.totals(state.project);
    var set = function (k, v) { var e = $('[data-ot="' + k + '"]'); if (e) e.textContent = v; };
    set('quote', money(t.quote)); set('tax', money(t.tax)); set('quoteTotal', money(t.quoteTotal));
    set('qty', t.qty + ' / ' + t.lines);
    (state.project.groups || []).forEach(function (g) {
      var gt = M.groupTotals(g, state.project);
      var c = $('[data-ogcount="' + g.id + '"]'); if (c) c.textContent = gt.count + ' 项 / ' + gt.qty + ' 件';
      var s = $('[data-ogsum="' + g.id + '"]'); if (s) s.textContent = '报价 ' + money(gt.quote);
      $$('[data-oamount^="' + g.id + '|"]').forEach(function (td) {
        var iid = td.dataset.oamount.split('|')[1];
        var it = itemById(g, iid); if (it) td.textContent = money(M.lineQuote(it, state.project));
      });
    });
    var note = $('#order-totals .t-note');
    if (note) note.textContent = M.lineDays(state.project) + ' 天 · 税率 ' + pct(M.num(state.project.taxRate));
  }

  /* ================= 界面二：利润看板（内部） ================= */
  function renderProfit() {
    var p = state.project, t = M.totals(p);
    return '<div class="page">' +
      '<div class="hint danger"><span class="pill danger">内部</span> 数据统计：含底价、返点、利润，<b>别给外包团队或公司看到</b>。对外报价请切到「下单报价」。</div>' +
      '<div class="stat-grid">' +
      statCard('我的利润', money(t.profit), '利润率（对底价）' + t.profitRateBottom + '%', 'dark') +
      statCard('利润率（对核价）', t.profitRateApproved + '%', '利润 ÷ 公司核价', 'green') +
      statCard('公司核价合计', money(t.approved), '报价×' + pct(1 - M.num(p.cutRate)), '') +
      statCard('报价合计', money(t.quote), '含税 ' + money(t.quoteTotal), 'accent') +
      statCard('底价合计', money(t.bottom), '供应商成本', '') +
      statCard('供应商返点', money(t.rebate), pct(M.num(p.rebateRate)) + ' × 底价', '') +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>项目与价格比例</h2><span class="sub">改比例后点「按默认比例重算」应用到所有行</span></div>' +
      '<div class="card-body"><div class="form-grid">' +
      field('项目名称', 'name', p.name, 'span-2') +
      field('拍摄天数', 'days', M.lineDays(p), '', 'number', 'min="1" step="1"') +
      field('加价率 %（底价→报价）', 'markupPct', M.round2(M.num(p.markupRate) * 100), '', 'number', 'min="0" step="0.01"') +
      field('核价砍价 %（报价→核价）', 'cutPct', M.round2(M.num(p.cutRate) * 100), '', 'number', 'min="0" step="0.01"') +
      field('供应商返点 %（按底价）', 'rebatePct', M.round2(M.num(p.rebateRate) * 100), '', 'number', 'min="0" step="0.01"') +
      '</div><div class="toolbar" style="margin-top:12px">' +
      '<button class="btn light" data-act="recalc">按默认比例重算</button>' +
      '<button class="btn light" data-act="sync-prices">按器材库刷新底价</button>' +
      '<button class="btn light" data-act="export-approved">导出核价单</button>' +
      '<button class="btn light" data-act="export-combined">导出报价+核价</button>' +
      '<button class="btn light" data-act="lock-profit">🔒 锁定</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn solid" data-act="go-order">去下单报价改数量 / 报价 →</button>' +
      '</div></div></section>' +
      (state.catalog.filter(function (e) { return e.star; }).length ? '<section class="card"><div class="card-head"><h2>标星关注 · 有利润空间</h2><span class="sub">在下方逐行明细里点 ★ 标记；只在这里显示</span></div>' +
        '<div class="table-wrap"><table class="grid"><thead><tr><th>名称</th><th>类型</th><th class="num">底价</th><th class="num">报价</th><th class="num">核价</th><th></th></tr></thead><tbody>' +
        state.catalog.filter(function (e) { return e.star; }).map(function (e) {
          return '<tr><td><span class="cat-tag ' + (e.type === 'crew' ? 'crew' : '') + '">' + (e.type === 'crew' ? '人员' : '器材') + '</span> ' + esc(e.name) + '</td>' +
            '<td>' + esc(e.cat || '') + '</td><td class="num">' + money(e.bottom) + '</td><td class="num">' + money(e.quote) + '</td><td class="num">' + money(e.approved) + '</td>' +
            '<td style="text-align:center"><button class="btn sm light" data-act="profit-star" data-eid="' + e.id + '">取消标星</button></td></tr>';
        }).join('') + '</tbody></table></div></section>' : '') +
      '<section class="card"><div class="card-head"><h2>整组报价组（按组计费）</h2><span class="sub">伸缩炮组这类按整组给价的：勾选后按整组价格计费，明细只用于出库</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th style="min-width:160px">机位组</th><th>整组</th><th class="num">整组底价</th><th class="num">整组报价</th><th class="num">整组核价</th><th class="num">组数</th><th class="num">利润</th></tr></thead><tbody>' +
      p.groups.map(pkgGroupRow).join('') + '</tbody></table></div></section>' +
      '<section class="card"><div class="card-head"><h2>按机位组看利润</h2><span class="sub">哪组赚钱、哪组亏钱一眼看出</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
      '<th style="min-width:160px">机位组</th><th class="num">项数</th><th class="num">报价</th><th class="num">核价</th><th class="num">底价</th><th class="num">返点</th><th class="num">利润</th><th class="num">利润率</th>' +
      '</tr></thead><tbody>' + p.groups.map(profitGroupRow).join('') + profitTotalRow(t) + '</tbody></table></div></section>' +
      '<section class="card"><div class="card-head"><h2>逐行明细</h2><span class="sub">底价 / 核价可直接改，利润自动重算；核价改过会记为你手动核价</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
      '<th style="min-width:120px">机位组</th><th style="min-width:230px">器材 / 人员</th><th>单位</th><th class="num">数量</th><th class="num">底价</th><th class="num">报价</th><th class="num">核价</th><th class="num">返点</th><th class="num">利润</th><th class="num">利润率</th><th style="width:44px">★</th>' +
      '</tr></thead><tbody>' + p.groups.map(profitDetailRows).join('') + '</tbody></table></div></section>' +
      '<div class="totals-bar">' +
      '<div class="t-item"><span class="t-label">我的利润</span><span class="t-val green" data-pt="profit">' + money(t.profit) + '</span></div>' +
      '<div class="t-item"><span class="t-label">利润率（对底价 / 对核价）</span><span class="t-val green" style="font-size:15px" data-pt="rates">' + t.profitRateBottom + '% / ' + t.profitRateApproved + '%</span></div>' +
      '<span class="spacer"></span>' +
      '<span class="t-note">底价为供应商价；核价可按实际结果手动改</span></div>' +
      '</div>';
  }
  function statCard(k, v, s, cls) {
    return '<div class="stat-card ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + (s || '') + '</div></div>';
  }
  function pkgGroupRow(g) {
    var gt = M.groupTotals(g, state.project);
    var dis = g.pkg ? '' : ' disabled';
    return '<tr data-pkgrow="' + g.id + '">' +
      '<td>' + esc(g.name) + '</td>' +
      '<td><input type="checkbox" data-gpkg="' + g.id + '"' + (g.pkg ? ' checked' : '') + '></td>' +
      '<td class="num"><input class="price pv" type="number" min="0" step="0.01" data-gpfield="pkgBottom" data-gid="' + g.id + '" value="' + esc(M.num(g.pkgBottom)) + '"' + dis + '></td>' +
      '<td class="num"><input class="price pv" type="number" min="0" step="0.01" data-gpfield="pkgQuote" data-gid="' + g.id + '" value="' + esc(M.num(g.pkgQuote)) + '"' + dis + '></td>' +
      '<td class="num"><input class="price pv" type="number" min="0" step="0.01" data-gpfield="pkgApproved" data-gid="' + g.id + '" value="' + esc(M.num(g.pkgApproved)) + '"' + dis + '></td>' +
      '<td class="num"><input class="qty" type="number" min="1" step="1" data-gpfield="pkgQty" data-gid="' + g.id + '" value="' + esc(g.pkgQty || 1) + '"' + dis + '></td>' +
      '<td class="num profit-cell ' + (gt.profit < 0 ? 'neg' : '') + '">' + money(g.pkg ? gt.profit : 0) + '</td></tr>';
  }
  function profitRate(gt) { return gt.bottom > 0 ? M.round2(gt.profit / gt.bottom * 100) : 0; }
  function profitGroupRow(g) {
    var gt = M.groupTotals(g, state.project);
    return '<tr data-grow="' + g.id + '">' +
      '<td>' + esc(g.name) + '</td>' +
      '<td class="num" data-gcell="count">' + gt.count + '</td>' +
      '<td class="num" data-gcell="quote">' + money(gt.quote) + '</td>' +
      '<td class="num" data-gcell="approved">' + money(gt.approved) + '</td>' +
      '<td class="num" data-gcell="bottom">' + money(gt.bottom) + '</td>' +
      '<td class="num" data-gcell="rebate">' + money(M.round2(gt.bottom * M.num(state.project.rebateRate))) + '</td>' +
      '<td class="num profit-cell ' + (gt.profit < 0 ? 'neg' : '') + '" data-gcell="profit">' + money(gt.profit) + '</td>' +
      '<td class="num rate" data-gcell="rate">' + profitRate(gt) + '%</td></tr>';
  }
  function profitTotalRow(t) {
    return '<tr style="background:#fffbeb;font-weight:700">' +
      '<td>合计</td><td class="num">' + t.lines + '</td>' +
      '<td class="num">' + money(t.quote) + '</td><td class="num">' + money(t.approved) + '</td>' +
      '<td class="num">' + money(t.bottom) + '</td><td class="num">' + money(t.rebate) + '</td>' +
      '<td class="num profit-cell ' + (t.profit < 0 ? 'neg' : '') + '">' + money(t.profit) + '</td>' +
      '<td class="num rate">' + t.profitRateBottom + '%</td></tr>';
  }
  function profitDetailRows(g) {
    if (g.pkg) {
      var gt = M.groupTotals(g, state.project);
      var rate = gt.bottom > 0 ? M.round2(gt.profit / gt.bottom * 100) : 0;
      return '<tr style="background:#fffbeb"><td class="muted">' + esc(g.name) + '</td>' +
        '<td><b>整组报价</b><span class="muted small">（明细见出库单）</span></td>' +
        '<td class="center">组</td><td class="num">' + (g.pkgQty || 1) + '</td>' +
        '<td class="num">' + money(gt.bottom) + '</td><td class="num">' + money(gt.quote) + '</td><td class="num">' + money(gt.approved) + '</td>' +
        '<td class="num">' + money(gt.rebate) + '</td><td class="num profit-cell ' + (gt.profit < 0 ? 'neg' : '') + '">' + money(gt.profit) + '</td>' +
        '<td class="num rate">' + rate + '%</td></tr>';
    }
    return g.items.map(function (it) {
      var pb = M.lineBottom(it, state.project), pq = M.lineQuote(it, state.project), pa = M.lineApproved(it, state.project);
      var prb = M.lineRebate(it, state.project), pp = M.lineProfit(it, state.project);
      var rate = pb > 0 ? M.round2(pp / pb * 100) : 0;
      var key = g.id + '|' + it.id;
      return '<tr data-drow="' + key + '">' +
        '<td class="muted">' + esc(g.name) + '</td>' +
        '<td><span class="cat-tag ' + (it.type === 'crew' ? 'crew' : '') + '">' + (it.type === 'crew' ? '人员' : '器材') + '</span> ' + esc(it.name) + '</td>' +
        '<td class="center">' + esc(it.unit || '个') + '</td>' +
        '<td class="num">' + M.num(it.qty) + '</td>' +
        '<td class="num"><input class="price pv" type="number" step="0.01" min="0" data-pifield="bottom" value="' + esc(it.bottom) + '"></td>' +
        '<td class="num" data-dcell="quote">' + money(pq) + '</td>' +
        '<td class="num"><input class="price pv" type="number" step="0.01" min="0" data-pifield="approved" value="' + esc(it.approved) + '"><div class="muted" style="font-size:10px" data-dcell="manual">' + (it.approvedManual ? '手动核价' : '') + '</div></td>' +
        '<td class="num" data-dcell="rebate">' + money(prb) + '</td>' +
        '<td class="num profit-cell ' + (pp < 0 ? 'neg' : '') + '" data-dcell="profit">' + money(pp) + '</td>' +
        '<td class="num rate" data-dcell="rate">' + rate + '%</td>' +
        '<td style="text-align:center">' + (function () {
          var ce = state.catalog.filter(function (x) { return M.normalizeName(x.name) === M.normalizeName(it.name); })[0];
          return ce ? '<button class="btn sm ' + (ce.star ? 'solid' : 'light') + '" data-act="profit-star" data-eid="' + ce.id + '" title="标记有利润空间">' + (ce.star ? '★' : '☆') + '</button>' : '<span class="muted">—</span>';
        })() + '</td>' +
        '</tr>';
    }).join('');
  }
  function updateProfitDOM(skipInput) {
    var p = state.project, t = M.totals(p);
    var setPt = function (k, v) { var e = $('[data-pt="' + k + '"]'); if (e) e.textContent = v; };
    setPt('profit', money(t.profit));
    setPt('rates', t.profitRateBottom + '% / ' + t.profitRateApproved + '%');
    $$('[data-stat]').forEach(function (e) { if (e.dataset.stat === 'profit') e.textContent = money(t.profit); });
    // 汇总卡片用 data-stat 更稳（在 renderProfit 中未用，保留兼容）
    (p.groups || []).forEach(function (g) {
      var gt = M.groupTotals(g, state.project);
      var row = $('[data-grow="' + g.id + '"]'); if (!row) return;
      var setG = function (k, v) { var e = row.querySelector('[data-gcell="' + k + '"]'); if (e) { e.textContent = v; } };
      setG('count', gt.count); setG('quote', money(gt.quote)); setG('approved', money(gt.approved));
      setG('bottom', money(gt.bottom)); setG('rebate', money(M.round2(gt.bottom * M.num(p.rebateRate))));
      var pcell = row.querySelector('[data-gcell="profit"]'); if (pcell) { pcell.textContent = money(gt.profit); pcell.classList.toggle('neg', gt.profit < 0); }
      setG('rate', profitRate(gt) + '%');
      (g.items || []).forEach(function (it) {
        var drow = $('[data-drow="' + g.id + '|' + it.id + '"]'); if (!drow) return;
        var pb = M.lineBottom(it, p), pq = M.lineQuote(it, p), pa = M.lineApproved(it, p);
        var prb = M.lineRebate(it, p), pp = M.lineProfit(it, p);
        var rate = pb > 0 ? M.round2(pp / pb * 100) : 0;
        var q = function (k) { return drow.querySelector('[data-dcell="' + k + '"]'); };
        if (q('quote')) q('quote').textContent = money(pq);
        if (q('rebate')) q('rebate').textContent = money(prb);
        if (q('profit')) { q('profit').textContent = money(pp); q('profit').classList.toggle('neg', pp < 0); }
        if (q('rate')) q('rate').textContent = rate + '%';
        if (q('manual')) q('manual').textContent = it.approvedManual ? '手动核价' : '';
        var bi = drow.querySelector('[data-pifield="bottom"]');
        if (bi && bi !== skipInput) bi.value = it.bottom;
        var ai = drow.querySelector('[data-pifield="approved"]');
        if (ai && ai !== skipInput) ai.value = it.approved;
      });
    });
  }
  function updateIssues() {
    var box = $('#issues'); if (!box) return;
    var issues = M.stockIssues(state.project, state.catalog);
    var zero = M.zeroPriceLines(state.project);
    var neg = 0;
    (state.project.groups || []).forEach(function (g) { (g.items || []).forEach(function (it) { if (M.lineProfit(it, state.project) < 0) neg += 1; }); });
    var html = '';
    if (issues.length) {
      html += '<div class="hint danger">⚠ 库存不足 ' + issues.length + ' 项：' + issues.map(function (x) {
        return esc(x.name) + '（需要 ' + x.need + '，库存 ' + x.stock + '）';
      }).join('；') + '。库存为手动维护，仅作提醒。</div>';
    }
    if (zero.length) {
      html += '<div class="hint warn">提示：' + zero.length + ' 行报价为 0（赠送/含在套餐内，或还没填价）。</div>';
    }
    var missing = [];
    (state.project.groups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) {
        if (!catalogByName(it.name)) missing.push(it.name);
      });
    });
    if (missing.length) {
      var uniq = missing.filter(function (x, i) { return missing.indexOf(x) === i; });
      html += '<div class="hint warn">⚠ 有 ' + missing.length + ' 行在器材库/人员标准里找不到同名条目（' + uniq.slice(0, 6).map(esc).join('、') + (uniq.length > 6 ? ' 等' : '') + '），价格会按 0 计算。去「器材库」或「人员标准」新增/改名成同名条目即可。</div>';
    }
    box.innerHTML = html ? '<div class="page" style="gap:8px">' + html + '</div>' : '';
  }

  /* ---------------- 出库单 ---------------- */
  function otAmount(r) { return M.round2(M.num(r.hours) * M.num(r.rate)); }
  function exSubtotal(r) { return M.round2(M.num(r.goCost) + M.num(r.parking) + M.num(r.toll) + M.num(r.leaveCost)); }
  function rateFromNote(note) {
    var m = String(note || '').match(/加班费(?:为|是)?\s*([\d.]+)\s*\/\s*(?:小时|时)/);
    return m ? M.num(m[1]) : 0;
  }
  function renderOvertime() {
    var p = scopeProject(), rows = p.overtime || [];
    var body = rows.map(function (r, i) {
      return '<tr data-otrow="' + r.id + '">' +
        '<td><input class="input-plain" style="width:108px" data-otfield="date" data-otid="' + r.id + '" value="' + esc(r.date || '') + '" placeholder="2026-10-22"></td>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td><input class="input-plain" style="width:110px" data-otfield="dept" data-otid="' + r.id + '" value="' + esc(r.dept || '') + '" placeholder="摄影组"></td>' +
        '<td class="num"><input class="qty" type="number" min="0" step="1" data-otfield="headcount" data-otid="' + r.id + '" value="' + esc(r.headcount) + '"></td>' +
        '<td><input class="name-edit" data-otfield="name" data-otid="' + r.id + '" value="' + esc(r.name || '') + '" placeholder="姓名"></td>' +
        '<td><input class="input-plain" style="width:88px" data-otfield="start" data-otid="' + r.id + '" value="' + esc(r.start || '') + '" placeholder="10:19"></td>' +
        '<td><input class="input-plain" style="width:110px" data-otfield="end" data-otid="' + r.id + '" value="' + esc(r.end || '') + '" placeholder="次日05:22"></td>' +
        '<td class="num"><input class="qty" type="number" min="0" step="0.5" data-otfield="hours" data-otid="' + r.id + '" value="' + esc(r.hours) + '"></td>' +
        '<td class="num"><input class="price" type="number" min="0" step="0.01" data-otfield="rate" data-otid="' + r.id + '" value="' + esc(r.rate) + '"></td>' +
        '<td class="num money" data-otamount="' + r.id + '">' + money(otAmount(r)) + '</td>' +
        '<td><input class="note" data-otfield="note" data-otid="' + r.id + '" value="' + esc(r.note || '') + '" placeholder="备注 / 拼车说明"></td>' +
        '<td style="text-align:center"><button class="del" data-act="ot-del" data-id="' + r.id + '">✕</button></td></tr>';
    }).join('');
    if (!body) body = '<tr><td colspan="12" class="muted" style="text-align:center;padding:20px">还没有加班记录，点「＋ 添加记录」或「从项目人员生成」</td></tr>';
    return '<div class="page">' +
      '<div class="hint"><span class="pill">内部</span> 加班记录按项目保存，导出后可直接交财务；水印照片 / 票据请在备注里注明张数。</div>' +
      '<div class="toolbar">' +
      '<button class="btn solid" data-act="ot-add">＋ 添加记录</button>' +
      '<button class="btn light" data-act="ot-from-crew">从项目人员生成</button>' +
      '<button class="btn light" data-act="checkin-link">现场打卡链接</button>' +
      '<span class="spacer"></span>' +
      '<span class="muted small">' + esc(p.name || '') + ' · ' + esc(p.shootDate || '') + '</span>' +
      '<button class="btn solid" data-act="ot-export">导出加班费明细</button>' +
      '</div>' +
      '<div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">' +
      statCard('记录 / 人数', '<span data-otstat="count">0</span> 条 / <span data-otstat="people">0</span> 人', '', '') +
      statCard('加班总时长', '<span data-otstat="hours">0</span> 小时', '', 'green') +
      statCard('加班费合计', '<span data-otstat="amount">¥0.00</span>', '', 'accent') +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>加班明细</h2><span class="sub">时长 × 单价 = 合计；导出格式对齐公司加班费明细表</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
      '<th>日期</th><th>序号</th><th>职位 / 部门</th><th>人数</th><th style="min-width:150px">姓名</th><th>加班费时间</th><th>收工时间</th><th>加班时长</th><th>加班费单价</th><th>合计</th><th style="min-width:180px">备注</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div></section>' +
      '<div class="totals-bar"><div class="t-item"><span class="t-label">加班费合计</span><span class="t-val accent" data-otstat="amount2">¥0.00</span></div><span class="spacer"></span><span class="t-note">导出后可交财务核对</span></div>' +
      '</div>';
  }
  function updateOtTotals() {
    var rows = scopeProject().overtime || [];
    var people = 0, hours = 0, amount = 0;
    rows.forEach(function (r) { people += M.num(r.headcount); hours += M.num(r.hours); amount += otAmount(r); });
    var set = function (k, v) { $$('[data-otstat="' + k + '"]').forEach(function (e) { e.textContent = v; }); };
    set('count', rows.length); set('people', people); set('hours', M.round2(hours)); set('amount', money(amount)); set('amount2', money(amount));
    rows.forEach(function (r) {
      $$('[data-otamount="' + r.id + '"]').forEach(function (td) { td.textContent = money(otAmount(r)); });
    });
  }
  function onOtField(t) {
    var r = (scopeProject().overtime || []).filter(function (x) { return x.id === t.dataset.otid; })[0]; if (!r) return;
    var k = t.dataset.otfield;
    r[k] = (k === 'headcount' || k === 'hours' || k === 'rate') ? M.num(t.value) : t.value;
    commit(); updateOtTotals();
  }
  function addOtRow() {
    var _p = scopeProject(); _p.overtime = _p.overtime || [];
    _p.overtime.push({ id: uid('ot'), date: _p.shootDate || today(), dept: '', name: '', headcount: 1, start: '', end: '', hours: 0, rate: 0, note: '' });
    commit(); render(); toast('已添加一条加班记录', 'ok');
  }
  function delOtRow(id) { var _p = scopeProject(); _p.overtime = (_p.overtime || []).filter(function (x) { return x.id !== id; }); commit(); render(); }
  function otFromCrew() {
    var p = scopeProject(), added = 0;
    (p.groups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) {
        if (it.type !== 'crew') return;
        p.overtime.push({ id: uid('ot'), date: p.shootDate || today(), dept: g.name, name: it.name, headcount: M.num(it.qty) || 1, start: '', end: '', hours: 0, rate: rateFromNote(it.note), note: '' });
        added += 1;
      });
    });
    commit(); render(); toast(added ? '已从项目人员生成 ' + added + ' 条，补一下时长即可' : '项目里没有人员行', added ? 'ok' : 'warn');
  }
  function checkinBase() {
    if (location.protocol === 'file:') return 'http://127.0.0.1:8137';
    // 单域名部署（服务同时托管报价系统）：同源即可
    if (location.port === '8137' || location.port === '') return location.origin;
    // 本地/局域网开发：报价系统 8123，上传服务 8137
    return location.protocol + '//' + location.hostname + ':8137';
  }
  function copyText(txt, cb) {
    function fallback() {
      try {
        var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        if (cb) cb(true);
      } catch (e) { if (cb) cb(false); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { if (cb) cb(true); }).catch(fallback);
    } else fallback();
  }
  function shareJobParams() {
    var _sp = scopeProject(); return '?job=' + encodeURIComponent(_sp.id || '') + '&p=' + encodeURIComponent(_sp.name || '');
  }
  function openShareLinks() {
    var base = checkinBase();
    fetch(base + '/api/meta').then(function (r) { return r.json(); }).then(function (m) {
      var lans = (m.lanUrls || []).filter(function (u) { return u.indexOf('127.0.0.1') < 0; });
      var root = lans[0] || base;
      var qs = shareJobParams();
      var checkin = root + '/m' + qs, expense = root + '/expense' + qs;
      var canShare = !!navigator.share;
      openModal('<div class="modal" style="width:min(680px,100%)"><div class="modal-head"><h3>分享现场链接 · ' + esc(state.project.name || '') + '</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
        '<div class="modal-body">' +
        '<p class="muted small" style="margin:0 0 12px">这是当前项目的专属链接，发到工作群即可；手机连同一 Wi-Fi 打开。数据按项目隔离，不会混到别的项目。</p>' +
        '<label class="field">打卡 / 报销（同一个手机页）<input readonly value="' + esc(checkin) + '" onclick="this.select()"></label>' +
        '<div class="toolbar" style="margin:8px 0 14px"><button class="btn solid" data-act="share-copy" data-target="checkin">复制打卡链接</button>' +
        '<button class="btn light" data-act="share-copy" data-target="expense">复制报销链接</button>' +
        '<button class="btn light" data-act="share-copy" data-target="both">复制两条</button>' +
        (canShare ? '<button class="btn primary" data-act="share-native">系统分享</button>' : '') +
        '</div>' +
        '<label class="field">报销直达链接<input readonly value="' + esc(expense) + '" onclick="this.select()"></label>' +
        '<p class="muted small" style="margin:10px 0 0">手机打开后顶部可切换「打卡凭证 / 报销凭证」。</p>' +
        '</div><div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">关闭</button></div></div>');
      window.__shareUrls = { checkin: checkin, expense: expense };
    }).catch(function () {
      openModal('<div class="modal" style="width:min(560px,100%)"><div class="modal-head"><h3>分享链接</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
        '<div class="modal-body"><p style="margin:0 0 8px">没有连上现场服务，请先双击「启动现场打卡.command」，再点分享。</p>' +
        '<p class="muted small" style="margin:0">服务启动后，链接会变成 <b>http://电脑IP:8137/m?job=项目ID</b> 的形式。</p></div>' +
        '<div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">知道了</button></div></div>');
    });
  }
  function openProfitPin() {
    openModal('<div class="modal" style="width:min(420px,100%)"><div class="modal-head"><h3>数据统计 · 访问验证</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
      '<div class="modal-body"><p class="muted small" style="margin:0 0 10px">该页面包含内部数据或系统设置，请输入访问密码。</p>' +
      '<input id="profit-pin" type="password" autocomplete="off" placeholder="访问密码" style="width:100%;padding:11px 12px;border:1px solid var(--line-2);border-radius:9px;font-size:15px">' +
      '<div class="err" id="profit-pin-err" style="color:#b91c1c;font-size:12px;min-height:18px;margin-top:6px"></div>' +
      '</div><div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">取消</button>' +
      '<button class="btn primary" data-act="profit-pin-ok">进入</button></div></div>');
    setTimeout(function () { var el = document.getElementById('profit-pin'); if (el) el.focus(); }, 50);
  }
  function checkProfitPin() {
    var el = document.getElementById('profit-pin');
    var pin = (el && el.value) ? el.value.trim() : '';
    if (pin === String(state.settings.profitPin || '')) {
      var target = state.ui.pinTarget || 'profit';
      state.ui.profitUnlocked = true;
      closeModal();
      setTab(target);
      toast('已验证，进入' + (target === 'settings' ? '设置' : '数据统计'), 'ok');
    } else {
      var err = document.getElementById('profit-pin-err');
      if (err) err.textContent = '密码不正确';
      if (el) { el.value = ''; el.focus(); }
    }
  }
  function lockProfit() {
    state.ui.profitUnlocked = false;
    setTab('order');
    toast('已锁定数据统计', 'ok');
  }
  function lockSettings() {
    state.ui.profitUnlocked = false;
    setTab('order');
    toast('已锁定设置', 'ok');
  }
  function supplierLink() {
    var name = (($('#sup-link-name') || {}).value || state.ui.supplierName || '').trim();
    return checkinBase() + '/supplier?sid=' + encodeURIComponent(state.ui.supplierSid) + '&supplier=' + encodeURIComponent(name);
  }
  function openSupplierModal() {
    if (!state.ui.supplierSid) state.ui.supplierSid = 'sup_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    if (state.ui.supplierName === undefined) state.ui.supplierName = '';
    openModal('<div class="modal" style="width:min(980px,100%)"><div class="modal-head"><h3>供应商填报</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
      '<div class="modal-body">' +
      '<div class="form-grid" style="grid-template-columns:1fr 1.6fr;gap:10px">' +
      '<label class="field">供应商名称<input id="sup-link-name" value="' + esc(state.ui.supplierName || '') + '" placeholder="例如：XX影视器材"></label>' +
      '<label class="field">填报链接（发给供应商）<input id="sup-link" readonly value="' + esc(supplierLink()) + '"></label>' +
      '</div>' +
      '<div class="toolbar" style="margin:10px 0 14px"><button class="btn solid" data-act="supplier-copy">复制链接</button>' +
      '<button class="btn light" data-act="supplier-open-link">打开填报页</button>' +
      '<button class="btn light" data-act="supplier-refresh">刷新提交</button>' +
      '<span class="spacer"></span><span class="muted small">供应商提交的底价会在这里等待你审核入库</span></div>' +
      '<div id="sup-subs"><p class="muted small">正在读取…</p></div>' +
      '</div><div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">关闭</button></div></div>');
    supplierFetchSubs();
  }
  function supplierFetchSubs() {
    var box = $('#sup-subs'); if (!box) return;
    box.innerHTML = '<p class="muted small">正在读取提交…</p>';
    fetch(checkinBase() + '/api/supplier/submissions', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (list) {
      state.ui.supplierSubs = Array.isArray(list) ? list : [];
      supplierRenderSubs();
    }).catch(function () {
      if ($('#sup-subs')) box.innerHTML = '<p class="muted small">上传服务未连接（本地需启动 checkin 服务 8137）。</p>';
    });
  }
  function supplierRenderSubs() {
    var box = $('#sup-subs'); if (!box) return;
    var list = state.ui.supplierSubs || [];
    if (!list.length) { box.innerHTML = '<div class="empty"><div class="big">📭</div><p>还没有供应商提交。把上面的链接发给他们填写即可。</p></div>'; return; }
    box.innerHTML = list.map(function (rec) {
      var rows = (rec.rows || []).map(function (r) {
        return '<tr><td>' + esc(r.name) + (r.model ? '<div class="muted small">' + esc(r.model) + '</div>' : '') + '</td>' +
          '<td>' + esc(r.major || '') + '</td><td class="center">' + esc(r.unit || '') + '</td>' +
          '<td class="num">' + money(r.bottom) + '</td><td class="center">' + (r.stock === null || r.stock === undefined ? '—' : r.stock) + '</td>' +
          '<td class="muted small">' + esc(r.note || '') + '</td></tr>';
      }).join('');
      return '<div class="card" style="margin:0 0 12px;border:1px solid var(--line);border-radius:12px"><div class="card-head" style="padding:12px 14px">' +
        '<h3 style="font-size:15px">' + esc(rec.supplier || '供应商') + ' <span class="muted small" style="font-weight:400">' + esc(rec.submittedAt || '') + '</span></h3>' +
        '<span class="spacer"></span>' + (rec.imported ? '<span class="pill" style="background:#e7f5ec;color:#276749">已入库</span>' : '<button class="btn sm solid" data-act="supplier-import" data-id="' + rec.id + '">导入器材库</button>') +
        '<button class="btn sm danger" data-act="supplier-del-sub" data-id="' + rec.id + '">删除</button></div>' +
        '<div class="table-wrap"><table class="grid"><thead><tr><th>器材</th><th>大类</th><th>单位</th><th class="num">底价</th><th>库存</th><th>备注</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }).join('');
  }
  function supplierImport(id) {
    var rec = (state.ui.supplierSubs || []).filter(function (x) { return x.id === id; })[0];
    if (!rec) return;
    var rate = M.num(state.settings.markupRate) || 30, cut = M.num(state.settings.cutRate) || 20;
    var added = 0, updated = 0;
    (rec.rows || []).forEach(function (r) {
      var key = M.normalizeName(r.name);
      var old = state.catalog.filter(function (x) { return M.normalizeName(x.name) === key && x.type !== 'crew'; })[0];
      var quote = M.round2(M.num(r.bottom) * (1 + rate / 100));
      var approved = M.round2(quote * (1 - cut / 100));
      if (old) {
        old.bottom = M.num(r.bottom); old.quote = quote; old.approved = approved;
        if (r.stock !== null && r.stock !== undefined) old.stock = r.stock;
        updated++; return;
      }
      var cat = M.classifyName(r.name, 'equipment');
      var major = majorOf({ cat: cat });
      if (r.major && major !== r.major) cat = r.major;
      state.catalog.push({
        id: uid('eq'), key: key, name: r.name, cat: cat, unit: r.unit || '个', type: 'equipment',
        bottom: M.num(r.bottom), quote: quote, approved: approved,
        stock: r.stock === null || r.stock === undefined ? null : r.stock,
        note: [r.model ? '型号 ' + r.model : '', r.note || ''].filter(Boolean).join('；'),
        supplier: rec.supplier || '供应商填报', group: '供应商填报', src: '供应商填报'
      });
      added++;
    });
    rec.imported = true;
    commit(); render(); supplierRenderSubs();
    toast('已入库：新增 ' + added + ' 项 · 更新 ' + updated + ' 项', 'ok');
    fetch(checkinBase() + '/api/supplier/imported', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rec.id }) }).catch(function () {});
  }
  function supplierDelete(id) {
    if (!confirm('删除这条供应商提交？')) return;
    fetch(checkinBase() + '/api/supplier/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) }).then(function () {
      state.ui.supplierSubs = (state.ui.supplierSubs || []).filter(function (x) { return x.id !== id; });
      supplierRenderSubs(); toast('已删除');
    }).catch(function () { toast('删除失败', 'err'); });
  }

  function openCheckinModal() {
    var base = checkinBase();
    fetch(base + '/api/meta').then(function (r) { return r.json(); }).then(function (m) {
      var lans = (m.lanUrls || []).filter(function (u) { return u.indexOf('127.0.0.1') < 0; });
      var root = lans[0] || base;
      var qs = shareJobParams();
      var form = root + '/m' + qs;
      var admin = root + '/admin';
      openModal('<div class="modal" style="width:min(640px,100%)"><div class="modal-head"><h3>现场打卡链接</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
        '<div class="modal-body">' +
        '<p class="muted small" style="margin:0 0 10px">这是<b>当前项目专属链接</b>，发到现场群即可；手机连同一 Wi-Fi，选职位、填姓名、拍照上传。照片会自动加项目名和时间水印。</p>' +
        '<label class="field">手机打卡链接（当前项目）<input readonly value="' + esc(form) + '" onclick="this.select()"></label>' +
        '<label class="field" style="margin-top:10px">电脑端查看 / 导出<input readonly value="' + esc(admin) + '" onclick="this.select()"></label>' +
        (lans.length > 1 ? '<p class="muted small" style="margin:8px 0 0">其他地址：' + lans.map(function (u) { return '<a href="' + u + '/m' + qs + '" target="_blank">' + u + '</a>'; }).join(' / ') + '</p>' : '') +
        '<p class="muted small" style="margin:10px 0 0">已有打卡记录：' + (m.count || 0) + ' 条。服务没启动时，先双击桌面测试版文件夹里的「启动现场打卡.command」。</p>' +
        '</div><div class="modal-foot"><span class="spacer"></span>' +
        '<a class="btn light" href="' + esc(form) + '" target="_blank">打开手机页</a>' +
        '<a class="btn solid" href="' + esc(admin) + '" target="_blank">打开管理页</a>' +
        '</div></div>');
    }).catch(function () {
      openModal('<div class="modal" style="width:min(560px,100%)"><div class="modal-head"><h3>现场打卡未启动</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
        '<div class="modal-body"><p style="margin:0 0 10px">还没检测到打卡服务。请先双击测试版文件夹里的 <b>启动现场打卡.command</b>，窗口里会显示手机链接。</p>' +
        '<p class="muted small" style="margin:0">启动后手机连同一 Wi-Fi，打开窗口里的链接即可。</p></div>' +
        '<div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">知道了</button></div></div>');
    });
  }
  function exportOvertime() {
    if (!window.ExcelJS) { toast('Excel 导出组件未加载', 'err'); return; }
    try {
      var wb = EX.buildOvertimeWorkbook(window.ExcelJS, scopeProject(), state.settings);
      EX.downloadWorkbook(wb, EX.safeName(scopeProject().name || '项目') + '_加班费明细_' + today() + '.xlsx').then(function (f) { toast('已导出：' + f, 'ok'); });
    } catch (e) { toast('导出失败：' + e.message, 'err'); }
  }
  function renderExpenses() {
    var p = scopeProject(), rows = p.expenses || [];
    var body = rows.map(function (r, i) {
      return '<tr data-exrow="' + r.id + '">' +
        '<td><input class="input-plain" style="width:108px" data-exfield="date" data-exid="' + r.id + '" value="' + esc(r.date || '') + '"></td>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td><input class="input-plain" style="width:110px" data-exfield="dept" data-exid="' + r.id + '" value="' + esc(r.dept || '') + '" placeholder="摄影组"></td>' +
        '<td class="num"><input class="qty" type="number" min="0" step="1" data-exfield="headcount" data-exid="' + r.id + '" value="' + esc(r.headcount) + '"></td>' +
        '<td><input class="name-edit" data-exfield="name" data-exid="' + r.id + '" value="' + esc(r.name || '') + '" placeholder="姓名"></td>' +
        '<td><select data-exfield="type" data-exid="' + r.id + '" style="width:92px"><option value="equipment"' + (r.type === 'ride' ? '' : ' selected') + '>器材运输</option><option value="ride"' + (r.type === 'ride' ? ' selected' : '') + '>网约车</option></select></td>' +
        '<td><input class="input-plain" style="width:150px" data-exfield="passengers" data-exid="' + r.id + '" value="' + esc(r.passengers || '') + '" placeholder="同乘人，逗号分隔"></td>' +
        '<td><input class="input-plain" style="width:84px" data-exfield="goTime" data-exid="' + r.id + '" value="' + esc(r.goTime || '') + '" placeholder="08:50"></td>' +
        '<td><input class="input-plain" style="width:100px" data-exfield="leaveTime" data-exid="' + r.id + '" value="' + esc(r.leaveTime || '') + '" placeholder="次日05:30"></td>' +
        '<td class="num"><input class="price" type="number" min="0" step="0.01" data-exfield="goCost" data-exid="' + r.id + '" value="' + esc(r.goCost) + '"></td>' +
        '<td class="num"><input class="price" type="number" min="0" step="0.01" data-exfield="parking" data-exid="' + r.id + '" value="' + esc(r.parking) + '"></td>' +
        '<td class="num"><input class="price" type="number" min="0" step="0.01" data-exfield="toll" data-exid="' + r.id + '" value="' + esc(r.toll) + '"></td>' +
        '<td class="num"><input class="price" type="number" min="0" step="0.01" data-exfield="leaveCost" data-exid="' + r.id + '" value="' + esc(r.leaveCost) + '"></td>' +
        '<td class="num money" data-exsubtotal="' + r.id + '">' + money(exSubtotal(r)) + '</td>' +
        '<td><input class="note" data-exfield="note" data-exid="' + r.id + '" value="' + esc(r.note || '') + '" placeholder="拼车 / 票据说明"></td>' +
        '<td style="text-align:center"><button class="del" data-act="ex-del" data-id="' + r.id + '">✕</button></td></tr>';
    }).join('');
    if (!body) body = '<tr><td colspan="16" class="muted" style="text-align:center;padding:20px">还没有报销记录，点「＋ 添加记录」或「从项目人员生成」</td></tr>';
    return '<div class="page">' +
      '<div class="hint"><span class="pill">内部</span> 交通报销按项目整理：前往 / 离开 / 停车 / 过路费自动小计；票据请备注张数或另行归档。</div>' +
      '<div class="toolbar">' +
      '<button class="btn solid" data-act="ex-add">＋ 添加记录</button>' +
      '<button class="btn light" data-act="ex-from-crew">从项目人员生成</button>' +
      '<button class="btn light" data-act="expense-link">现场报销链接</button>' +
      '<span class="spacer"></span><span class="muted small">' + esc(p.name || '') + ' · ' + esc(p.shootDate || '') + '</span>' +
      '<button class="btn solid" data-act="ex-export">导出交通费报销</button>' +
      '</div>' +
      '<div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">' +
      statCard('记录 / 人数', '<span data-exstat="count">0</span> 条 / <span data-exstat="people">0</span> 人', '', '') +
      statCard('器材运输', '<span data-exstat="equipment">¥0.00</span>', '', 'green') +
      statCard('网约车', '<span data-exstat="ride">¥0.00</span>', '', 'accent') +
      statCard('报销合计', '<span data-exstat="total">¥0.00</span>', '含停车 / 过路费', 'dark') +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>报销明细</h2><span class="sub">小计 = 前往费用 + 停车费 + 过路费 + 离开费用；格式对齐公司交通费报销表</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
      '<th>日期</th><th>序号</th><th>职位 / 部门</th><th>人数</th><th style="min-width:130px">姓名</th><th>费用类型</th><th style="min-width:150px">同乘人</th><th>前往时间</th><th>离开时间</th><th>前往费用</th><th>停车费</th><th>过路费</th><th>离开费用</th><th>小计</th><th style="min-width:180px">备注</th><th></th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div></section>' +
      '<div class="totals-bar"><div class="t-item"><span class="t-label">报销合计</span><span class="t-val accent" data-exstat="total2">¥0.00</span></div><span class="spacer"></span><span class="t-note">导出后可交财务核对</span></div>' +
      '</div>';
  }
  function updateExTotals() {
    var rows = scopeProject().expenses || [];
    var people = 0, equipment = 0, ride = 0, total = 0;
    rows.forEach(function (r) {
      people += M.num(r.headcount); total += exSubtotal(r);
      if (r.type === 'ride') ride += exSubtotal(r); else equipment += exSubtotal(r);
    });
    var set = function (k, v) { $$('[data-exstat="' + k + '"]').forEach(function (e) { e.textContent = v; }); };
    set('count', rows.length); set('people', people); set('equipment', money(equipment)); set('ride', money(ride)); set('total', money(total)); set('total2', money(total));
    rows.forEach(function (r) {
      $$('[data-exsubtotal="' + r.id + '"]').forEach(function (td) { td.textContent = money(exSubtotal(r)); });
    });
  }
  function onExField(t) {
    var r = (scopeProject().expenses || []).filter(function (x) { return x.id === t.dataset.exid; })[0]; if (!r) return;
    var k = t.dataset.exfield;
    r[k] = (k === 'headcount' || k === 'goCost' || k === 'parking' || k === 'toll' || k === 'leaveCost') ? M.num(t.value) : t.value;
    commit(); updateExTotals();
  }
  function addExRow() {
    var _pe = scopeProject(); _pe.expenses = _pe.expenses || [];
    _pe.expenses.push({ id: uid('ex'), date: _pe.shootDate || today(), dept: '', name: '', headcount: 1, type: 'ride', passengers: '', goTime: '', leaveTime: '', goCost: 0, parking: 0, toll: 0, leaveCost: 0, note: '' });
    commit(); render(); toast('已添加一条报销记录', 'ok');
  }
  function delExRow(id) { var _pe = scopeProject(); _pe.expenses = (_pe.expenses || []).filter(function (x) { return x.id !== id; }); commit(); render(); }
  function exFromCrew() {
    var p = scopeProject(), added = 0;
    (p.groups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) {
        if (it.type !== 'crew') return;
        p.expenses.push({ id: uid('ex'), date: p.shootDate || today(), dept: g.name, name: it.name, headcount: M.num(it.qty) || 1, type: 'ride', passengers: '', goTime: '', leaveTime: '', goCost: 0, parking: 0, toll: 0, leaveCost: 0, note: '' });
        added += 1;
      });
    });
    commit(); render(); toast(added ? '已从项目人员生成 ' + added + ' 条，填费用即可' : '项目里没有人员行', added ? 'ok' : 'warn');
  }
  function openExpenseModal() {
    var base = checkinBase();
    fetch(base + '/api/meta').then(function (r) { return r.json(); }).then(function (m) {
      var lans = (m.lanUrls || []).filter(function (u) { return u.indexOf('127.0.0.1') < 0; });
      var root = lans[0] || base;
      var qs = shareJobParams();
      var expense = root + '/expense' + qs, admin = root + '/admin';
      openModal('<div class="modal" style="width:min(640px,100%)"><div class="modal-head"><h3>现场报销链接</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
        '<div class="modal-body">' +
        '<p class="muted small" style="margin:0 0 10px">这是<b>当前项目专属链接</b>，发到现场群；填车费、上传票据截图提交，管理页按项目汇总。</p>' +
        '<label class="field">手机报销链接（当前项目）<input readonly value="' + esc(expense) + '" onclick="this.select()"></label>' +
        '<label class="field" style="margin-top:10px">电脑端管理（含打卡/报销两个页签）<input readonly value="' + esc(admin) + '" onclick="this.select()"></label>' +
        (lans.length > 1 ? '<p class="muted small" style="margin:8px 0 0">其他地址：' + lans.map(function (u) { return '<a href="' + u + '/expense' + qs + '" target="_blank">' + u + '</a>'; }).join(' / ') + '</p>' : '') +
        '<p class="muted small" style="margin:10px 0 0">已有报销记录：' + (m.expenseCount || 0) + ' 条。服务没启动时，先双击「启动现场打卡.command」。</p>' +
        '</div><div class="modal-foot"><span class="spacer"></span>' +
        '<a class="btn light" href="' + esc(expense) + '" target="_blank">打开手机页</a>' +
        '<a class="btn solid" href="' + esc(admin) + '" target="_blank">打开管理页</a>' +
        '</div></div>');
    }).catch(function () {
      openModal('<div class="modal" style="width:min(560px,100%)"><div class="modal-head"><h3>报销服务未启动</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
        '<div class="modal-body"><p style="margin:0">请先双击测试版文件夹里的 <b>启动现场打卡.command</b>，启动后手机打开窗口里的报销链接。</p></div>' +
        '<div class="modal-foot"><span class="spacer"></span><button class="btn light" data-act="modal-close">知道了</button></div></div>');
    });
  }
  function exportExpenses() {
    if (!window.ExcelJS) { toast('Excel 导出组件未加载', 'err'); return; }
    try {
      var wb = EX.buildExpensesWorkbook(window.ExcelJS, scopeProject(), state.settings);
      EX.downloadWorkbook(wb, EX.safeName(scopeProject().name || '项目') + '_交通费报销_' + today() + '.xlsx').then(function (f) { toast('已导出：' + f, 'ok'); });
    } catch (e) { toast('导出失败：' + e.message, 'err'); }
  }

  function summaryProjects() {
    var map = {};
    [state.project].concat(state.projects || []).forEach(function (p) { if (p && p.id && !map[p.id]) map[p.id] = p; });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function summarizeProjects(projects) {
    var byProject = [], byDept = {}, byPerson = {};
    var tot = { hours: 0, otFee: 0, expense: 0, otCount: 0, exCount: 0 };
    projects.forEach(function (p) {
      var row = { name: p.name || '未命名项目', date: p.shootDate || '', hours: 0, otFee: 0, expense: 0, otCount: 0, exCount: 0 };
      (p.overtime || []).forEach(function (r) {
        var h = M.num(r.hours), fee = otAmount(r);
        row.hours += h; row.otFee += fee; row.otCount += 1;
        var dept = r.dept || '未分部门', person = (r.name || '') + (r.role ? '（' + r.role + '）' : '');
        byDept[dept] = byDept[dept] || { hours: 0, otFee: 0, expense: 0 };
        byDept[dept].hours += h; byDept[dept].otFee += fee;
        byPerson[person] = byPerson[person] || { dept: dept, hours: 0, otFee: 0, expense: 0 };
        byPerson[person].hours += h; byPerson[person].otFee += fee;
      });
      (p.expenses || []).forEach(function (r) {
        var sub = exSubtotal(r);
        row.expense += sub; row.exCount += 1;
        var dept = r.dept || '未分部门', person = (r.name || '') + (r.role ? '（' + r.role + '）' : '');
        byDept[dept] = byDept[dept] || { hours: 0, otFee: 0, expense: 0 };
        byDept[dept].expense += sub;
        byPerson[person] = byPerson[person] || { dept: dept, hours: 0, otFee: 0, expense: 0 };
        byPerson[person].expense += sub;
      });
      tot.hours += row.hours; tot.otFee += row.otFee; tot.expense += row.expense; tot.otCount += row.otCount; tot.exCount += row.exCount;
      byProject.push(row);
    });
    ['hours', 'otFee', 'expense'].forEach(function (k) { tot[k] = M.round2(tot[k]); });
    return { total: tot, byProject: byProject, byDept: byDept, byPerson: byPerson };
  }
  function renderStats() {
    var scope = state.ui.summaryScope || 'current';
    var projects = scope === 'all' ? summaryProjects() : [scopeProject()];
    var sum = summarizeProjects(projects);
    var t = sum.total;
    function scopeBtn(v, label) { return '<button class="btn sm ' + (scope === v ? 'solid' : 'light') + '" data-act="summary-scope" data-scope="' + v + '">' + label + '</button>'; }
    var projRows = sum.byProject.map(function (r) {
      return '<tr><td>' + esc(r.name) + '</td><td class="center">' + esc(r.date) + '</td><td class="num">' + r.otCount + '</td><td class="num">' + M.round2(r.hours) + ' h</td><td class="num">' + money(r.otFee) + '</td><td class="num">' + r.exCount + '</td><td class="num">' + money(r.expense) + '</td></tr>';
    }).join('');
    var deptRows = Object.keys(sum.byDept).sort().map(function (d) {
      var r = sum.byDept[d];
      return '<tr><td>' + esc(d) + '</td><td class="num">' + M.round2(r.hours) + ' h</td><td class="num">' + money(r.otFee) + '</td><td class="num">' + money(r.expense) + '</td></tr>';
    }).join('');
    var personRows = Object.keys(sum.byPerson).sort(function (a, b) { return (sum.byPerson[b].otFee + sum.byPerson[b].expense) - (sum.byPerson[a].otFee + sum.byPerson[a].expense); }).map(function (n) {
      var r = sum.byPerson[n];
      return '<tr><td>' + esc(n) + '</td><td>' + esc(r.dept) + '</td><td class="num">' + M.round2(r.hours) + ' h</td><td class="num">' + money(r.otFee) + '</td><td class="num">' + money(r.expense) + '</td></tr>';
    }).join('');
    return '<div class="page">' +
      '<div class="hint"><span class="pill">内部</span> 自动汇总各项目的<b>加班时长/加班费</b>和<b>报销总费用</b>；现场打卡、现场报销可一键导入当前项目。</div>' +
      '<div class="toolbar">' + scopeBtn('current', '本项目') + scopeBtn('all', '全部项目') +
      '<span class="spacer"></span>' +
      '<button class="btn light" data-act="summary-export">导出费用汇总</button></div>' +
      '<div class="stat-grid">' +
      statCard('加班总时长', M.round2(t.hours) + ' 小时', t.otCount + ' 条记录', '') +
      statCard('加班费合计', money(t.otFee), '', 'green') +
      statCard('报销总费用', money(t.expense), t.exCount + ' 条记录', 'accent') +
      statCard('合计费用', money(M.round2(t.otFee + t.expense)), '加班 + 报销', 'dark') +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>按项目汇总</h2><span class="sub">' + (scope === 'all' ? '当前项目 + 历史已保存项目' : '当前项目') + '</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>项目</th><th>拍摄日期</th><th class="num">加班条数</th><th class="num">加班时长</th><th class="num">加班费</th><th class="num">报销条数</th><th class="num">报销合计</th></tr></thead><tbody>' + (projRows || '<tr><td colspan="7" class="muted center">暂无数据</td></tr>') + '</tbody></table></div></section>' +
      '<section class="card"><div class="card-head"><h2>按部门汇总</h2><span class="sub">加班和报销分部门统计</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>部门 / 组</th><th class="num">加班时长</th><th class="num">加班费</th><th class="num">报销合计</th></tr></thead><tbody>' + (deptRows || '<tr><td colspan="4" class="muted center">暂无数据</td></tr>') + '</tbody></table></div></section>' +
      '<section class="card"><div class="card-head"><h2>按人员汇总</h2><span class="sub">按金额从高到低</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>姓名</th><th>部门</th><th class="num">加班时长</th><th class="num">加班费</th><th class="num">报销合计</th></tr></thead><tbody>' + (personRows || '<tr><td colspan="5" class="muted center">暂无数据</td></tr>') + '</tbody></table></div></section>' +
      '<section class="card"><div class="card-head"><h2>现场数据导入（到当前项目）</h2><span class="sub">从手机打卡/报销服务拉取，自动去重</span></div>' +
      '<div class="card-body"><div class="toolbar" style="flex-wrap:wrap">' +
      '<label class="field" style="max-width:180px">加班起算（小时）<input class="qty" id="imp-threshold" type="number" min="0" step="1" value="14"></label>' +
      '<button class="btn solid" data-act="imp-checkin">拉取现场打卡 → 加班记录</button>' +
      '<button class="btn solid" data-act="imp-expense">拉取现场报销 → 报销整理</button>' +
      '</div><p class="muted small" style="margin:10px 0 0">打卡按「到场/离场」时间差计算加班时长（默认 14 小时起算），加班单价导入后按人员/历史记录匹配，匹配不到可手动补；报销金额和票据链接会一起导入。</p>' +
      '</div></section>' +
      '</div>';
  }
  function parseCheckinTime(s) {
    var m = String(s || '').match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  function importCheckin() {
    var base = checkinBase();
    var threshold = M.num((($('#imp-threshold') || {}).value), 14);
    fetch(base + '/api/submissions?job=' + encodeURIComponent(scopeProject().id || '')).then(function (r) { return r.json(); }).then(function (list) {
      var p = scopeProject(); p.overtime = p.overtime || [];
      var existing = {}; p.overtime.forEach(function (r) { if (r.sourceId) existing[r.sourceId] = 1; });
      var groups = {};
      (list || []).forEach(function (s) {
        var key = [s.date, s.dept, s.role, s.name].join('|');
        groups[key] = groups[key] || { ins: [], outs: [], row: s };
        if (s.type === 'out') groups[key].outs.push(s); else groups[key].ins.push(s);
      });
      var added = 0, skipped = 0;
      Object.keys(groups).forEach(function (key) {
        var g = groups[key];
        if (!g.ins.length || !g.outs.length) { skipped += 1; return; }
        g.ins.sort(function (a, b) { return parseCheckinTime(a.receivedAt) - parseCheckinTime(b.receivedAt); });
        g.outs.sort(function (a, b) { return parseCheckinTime(b.receivedAt) - parseCheckinTime(a.receivedAt); });
        var inRec = g.ins[0], outRec = g.outs[0];
        var t1 = parseCheckinTime(inRec.receivedAt), t2 = parseCheckinTime(outRec.receivedAt);
        if (!t1 || !t2) { skipped += 1; return; }
        var span = (t2 - t1) / 3600000;
        var ot = Math.max(0, Math.round((span - threshold) * 2) / 2);
        var sid = 'ci:' + inRec.id + ':' + outRec.id;
        if (existing[sid]) { skipped += 1; return; }
        var sameDay = t2.toDateString() === t1.toDateString();
        function hhmm(t) { return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); }
        var rate = 0;
        p.overtime.forEach(function (r) { if (!rate && r.name === g.row.name && r.role === g.row.role) rate = M.num(r.rate); });
        p.overtime.push({
          id: uid('ot'), sourceId: sid, date: g.row.date, dept: g.row.dept, role: g.row.role, name: g.row.name,
          headcount: 1, start: hhmm(t1), end: (sameDay ? '' : '次日') + hhmm(t2), hours: ot, rate: rate,
          note: '现场打卡导入' + (inRec.photo ? ' · 到场照片 ' + base + '/' + inRec.photo : '')
        });
        added += 1;
      });
      commit(); render();
      toast('已导入 ' + added + ' 条加班记录' + (skipped ? '，跳过 ' + skipped + ' 组（缺到场/离场或已导入）' : ''), added ? 'ok' : 'warn');
    }).catch(function () { toast('没有连上现场打卡服务，请先启动', 'err'); });
  }
  function importExpense() {
    var base = checkinBase();
    fetch(base + '/api/expenses?job=' + encodeURIComponent(scopeProject().id || '')).then(function (r) { return r.json(); }).then(function (list) {
      var p = scopeProject(); p.expenses = p.expenses || [];
      var existing = {}; p.expenses.forEach(function (r) { if (r.sourceId) existing[r.sourceId] = 1; });
      var added = 0;
      (list || []).forEach(function (s) {
        var sid = 'ex:' + s.id;
        if (existing[sid]) return;
        var total0 = M.num(s.goCost) + M.num(s.parking) + M.num(s.toll) + M.num(s.leaveCost);
        var guess = s.ocr && s.ocr.guess ? M.num(s.ocr.guess) : 0;
        p.expenses.push({
          id: uid('ex'), sourceId: sid, date: s.date, dept: s.dept, name: s.name, role: s.role, headcount: 1,
          type: s.type === 'ride' ? 'ride' : 'equipment', passengers: s.passengers || '',
          goTime: '', leaveTime: '', goCost: (total0 === 0 && guess ? guess : M.num(s.goCost)), parking: M.num(s.parking), toll: M.num(s.toll), leaveCost: M.num(s.leaveCost),
          note: '现场报销导入' + (s.photo ? ' · 票据 ' + base + '/' + s.photo : '') + (guess ? ' · OCR识别 ¥' + guess : '') + (s.note ? ' · ' + s.note : '')
        });
        added += 1;
      });
      commit(); render();
      toast('已导入 ' + added + ' 条报销记录', added ? 'ok' : 'warn');
    }).catch(function () { toast('没有连上现场服务，请先启动', 'err'); });
  }
  function exportSummary() {
    if (!window.ExcelJS) { toast('Excel 导出组件未加载', 'err'); return; }
    var scope = state.ui.summaryScope || 'current';
    var projects = scope === 'all' ? summaryProjects() : [scopeProject()];
    try {
      var wb = EX.buildSummaryWorkbook(window.ExcelJS, scope === 'all' ? summaryProjects() : [scopeProject()], state.settings, scope === 'all' ? '全部项目' : '本项目');
      EX.downloadWorkbook(wb, EX.safeName(state.project.name || '项目') + '_费用汇总_' + today() + '.xlsx').then(function (f) { toast('已导出：' + f, 'ok'); });
    } catch (e) { toast('导出失败：' + e.message, 'err'); }
  }

  function renderOutbound() {
    var p = state.project, ob = M.outbound(p);
    if (!ob.lines.length) {
      return '<div class="page"><div class="empty"><div class="big">📦</div><p>当前项目还没有器材，先去「下单报价」添加。</p><button class="btn solid" data-act="go-order">去下单报价</button></div></div>';
    }
    var rows = ob.lines.map(function (l, i) {
      var out = p.outbound[l.key] !== undefined && p.outbound[l.key] !== '' ? p.outbound[l.key] : '';
      var diff = out === '' ? '' : M.round2(M.num(out) - l.qty);
      var low = out !== '' && M.num(out) < l.qty;
      return '<tr data-obrow="' + l.key + '"><td class="num">' + (i + 1) + '</td>' +
        '<td><span class="cat-tag">' + esc(l.cat) + '</span></td>' +
        '<td>' + esc(l.name) + '</td><td class="center">' + esc(l.unit) + '</td>' +
        '<td class="num money">' + l.qty + '</td>' +
        '<td class="muted">' + esc(l.groups.map(function (g) { return g.name + ' ' + g.qty; }).join('；')) + '</td>' +
        '<td><input class="qty" type="number" min="0" step="1" data-obkey="' + esc(l.key) + '" value="' + esc(out) + '" placeholder="待填"></td>' +
        '<td class="num" data-obdiff="' + esc(l.key) + '" style="' + (low ? 'color:var(--red);font-weight:700' : '') + '">' + (diff === '' ? '' : diff) + '</td>' +
        '</tr>';
    }).join('');
    var detail = ob.groups.map(function (g) {
      if (!g.items.length) return '';
      var q = g.items.reduce(function (s, i) { return s + i.qty; }, 0);
      return '<div class="card" style="margin-bottom:10px"><div class="card-head" style="padding:9px 14px"><h2 style="font-size:14px">' + esc(g.name) + '</h2><span class="sub">' + g.items.length + ' 项 / ' + q + ' 件</span></div>' +
        '<table class="grid"><thead><tr><th>序号</th><th>器材名称</th><th>单位</th><th class="num">数量</th><th>备注</th></tr></thead><tbody>' +
        g.items.map(function (it, i) {
          return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(it.name) + '</td><td class="center">' + esc(it.unit) + '</td><td class="num money">' + it.qty + '</td><td class="muted">' + esc(it.note || '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).join('');
    return '<div class="page">' +
      '<div class="toolbar">' +
      '<button class="btn light" data-act="export-outbound">导出出库单</button>' +
      '<button class="btn light" data-act="print-outbound">打印 / 存 PDF</button>' +
      '<span class="spacer"></span>' +
      '<span class="muted small">人员 ' + ob.crewQty + ' 人不计入器材出库；实发数量可直接填，自动算差异</span>' +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>出库汇总</h2><span class="sub">' + ob.lineCount + ' 项器材 / 共 ' + ob.totalQty + ' 件 · 同名器材跨机位合并</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>序号</th><th>分类</th><th>器材名称（含型号）</th><th>单位</th><th class="num">应发数量</th><th>分属机位及数量</th><th>实发数量</th><th class="num">差异</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>' +
      '<div class="totals-bar"><div class="t-item"><span class="t-label">应发合计</span><span class="t-val accent">' + ob.totalQty + ' 件</span></div>' +
      '<div class="t-item"><span class="t-label">器材项数</span><span class="t-val">' + ob.lineCount + ' 项</span></div>' +
      '<span class="spacer"></span><span class="t-note">按报价数量生成，含备用器材</span></div>' +
      '<h3 style="font-size:15px;margin:6px 0 2px">分机位明细（现场按机位分箱点数）</h3>' + detail +
      '</div>';
  }

  /* ---------------- 器材库（内部） ---------------- */
  function renderCatalog() {
    var crewMode = state.ui.catalogMode === 'crew';
    var cats = {}; state.catalog.forEach(function (e) { cats[e.cat || '其他'] = 1; });
    var catOpts = Object.keys(cats).sort().map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
    var sups = {}; state.catalog.forEach(function (e) { var x = supOf(e); sups[x] = (sups[x] || 0) + 1; });
    var supOpts = Object.keys(sups).sort(function (a, b) { return sups[b] - sups[a]; }).map(function (x) {
      return '<option value="' + esc(x) + '">' + esc(srcLabel(x)) + '（' + sups[x] + '）</option>';
    }).join('');
    var grps = {}; state.catalog.forEach(function (e) { var g = grpOf(e); if (g) grps[g] = (grps[g] || 0) + 1; });
    var grpOpts = Object.keys(grps).sort().map(function (x) {
      return '<option value="' + esc(x) + '">' + esc(x) + '（' + grps[x] + '）</option>';
    }).join('');
    var list = state.catalog.filter(function (e) { return crewMode ? e.type === 'crew' : e.type !== 'crew'; });
    if (!crewMode && state.ui.catalogMajor) list = list.filter(function (e) { return majorOf(e) === state.ui.catalogMajor; });
    var rows = list.map(crewMode ? crewRowHtml : catRowHtml).join('');
    var eqN = state.catalog.filter(function (e) { return e.type !== 'crew'; }).length;
    var crewN = state.catalog.length - eqN;

    return '<div class="page">' +
      '<div class="toolbar">' +
      '<div class="seg" style="display:flex;gap:0;border:1px solid var(--line-2);border-radius:9px;overflow:hidden">' +
      '<button class="btn sm ' + (crewMode ? 'light' : 'solid') + '" data-act="catalog-mode" data-mode="equipment" style="border-radius:0">器材价格</button>' +
      '<button class="btn sm ' + (crewMode ? 'solid' : 'light') + '" data-act="catalog-mode" data-mode="crew" style="border-radius:0">人员标准</button>' +
      '</div>' +
      '<input type="search" data-search="catalog" placeholder="搜索名称 / 型号…" style="padding:8px 12px;border:1px solid var(--line-2);border-radius:9px;min-width:220px">' +
      '<select data-cat-filter style="padding:8px 10px;border:1px solid var(--line-2);border-radius:9px"><option value="">全部分类</option>' + catOpts + '</select>' +
      (crewMode ? '' : '<div class="seg" style="display:flex;gap:0;border:1px solid var(--line-2);border-radius:9px;overflow:hidden">' +
        ['', '摄影器材', '灯光器材'].map(function (m) {
          var n = m ? state.catalog.filter(function (e) { return e.type !== 'crew' && majorOf(e) === m; }).length : eqN;
          return '<button class="btn sm ' + (state.ui.catalogMajor === m ? 'solid' : 'light') + '" data-act="catalog-major" data-major="' + m + '" style="border-radius:0">' + (m || '全部') + ' ' + n + '</button>';
        }).join('') + '</div>') +
      '<select data-sup-filter style="padding:8px 10px;border:1px solid var(--line-2);border-radius:9px"><option value="">全部供应商</option>' + supOpts + '</select>' +
      '<select data-group-filter style="padding:8px 10px;border:1px solid var(--line-2);border-radius:9px;max-width:220px"><option value="">全部板块</option>' + grpOpts + '</select>' +
      '<span class="lib-stats"><span>共 <b>' + state.catalog.length + '</b> 项</span><span>器材 <b>' + eqN + '</b></span><span>人员 <b>' + crewN + '</b></span>' + '</span>' +
      '<span class="spacer"></span>' +
      (crewMode
        ? '<button class="btn solid" data-act="sync-prices">价格同步到当前项目</button>'
        : '<button class="btn solid" data-act="sync-prices">价格同步到当前项目</button>' +
          '<button class="btn solid" data-act="catalog-smart-import">智能识别导入</button>' +
          '<button class="btn light" data-act="supplier-open">供应商填报</button>' +
          '<button class="btn light" data-act="auto-cat">自动识别分类</button>' +
          '<button class="btn light" data-act="cat-health">数据体检</button>') +
      (crewMode
        ? '<button class="btn light" data-act="crew-add">＋ 新增岗位</button>'
        : '<button class="btn light" data-act="catalog-add">＋ 新增器材</button>') +
      '<button class="btn light" data-act="catalog-import">导入 JSON</button>' +
      '<button class="btn light" data-act="catalog-export">导出 JSON</button>' +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>' + (crewMode ? '人员费用与加班费标准' : '器材库与三套价') + '</h2>' +
      '<span class="sub">' + (crewMode ? '每个岗位的报价 / 底价 / 核价 + 加班费标准，改完自动同步' : '底价 = 供应商给你的价；报价 = 给公司；核价 = 公司核定') + '</span></div>' +
      '<div class="table-scroll"><table class="grid"><thead><tr>' +
      (crewMode
        ? '<th style="min-width:230px">岗位名称</th><th>分类</th><th>单位</th><th class="num">报价</th><th class="num">底价</th><th class="num">核价</th><th style="min-width:330px">加班费标准（备注）</th><th></th>'
        : '<th style="min-width:250px">器材名称（含型号）</th><th>分类</th><th>类型</th><th>单位</th><th class="num">底价</th><th class="num">报价</th><th class="num">核价</th><th class="num">库存</th><th style="min-width:160px">备注</th><th></th>') +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="10" class="muted" style="text-align:center;padding:24px">没有数据</td></tr>') + '</tbody></table></div></section>' +
      '<div class="totals-bar"><div class="t-item"><span class="t-label">器材库来源</span><span class="t-val" style="font-size:13px">' + esc(state.meta.source || '') + '</span></div>' +
      '<span class="spacer"></span><span class="t-note">共 ' + state.catalog.length + ' 项 · 改价/改名自动保存并同步</span></div>' +
      '</div>';
  }
  function crewRowHtml(e) {
    return '<tr data-eid="' + e.id + '" data-name="' + esc(e.name) + '" data-cat="' + esc(e.cat || '') + '" data-type="crew" data-sup="' + esc(supOf(e)) + '" data-group="' + esc(grpOf(e)) + '">' +
      '<td><input class="name-edit" data-efield="name" value="' + esc(e.name) + '"><div class="grp-tag" title="' + esc(grpOf(e) || '') + '">' + esc(grpOf(e) || '') + '</div></td>' +
      '<td>' + esc(e.cat || '') + '</td>' +
      '<td><input class="input-plain" style="width:40px" data-efield="unit" value="' + esc(e.unit || '人') + '"></td>' +
      '<td class="num"><input class="price" type="number" min="0" step="0.01" data-efield="quote" value="' + esc(e.quote) + '"' + (isLock(e) ? ' disabled' : '') + '></td>' +
      '<td class="num"><input class="price" type="number" min="0" step="0.01" data-efield="bottom" value="' + esc(e.bottom) + '"' + (isLock(e) ? ' disabled' : '') + '></td>' +
      '<td class="num"><input class="price" type="number" min="0" step="0.01" data-efield="approved" value="' + esc(e.approved) + '"' + (isLock(e) ? ' disabled' : '') + '></td>' +
      '<td><input class="note" data-efield="note" value="' + esc(e.note || '') + '" placeholder="例如：加班费14小时开始算加班费，加班费为300/小时"></td>' +
      '<td style="text-align:center;white-space:nowrap">' +
      '<button class="btn sm light" data-act="crew-card" data-eid="' + e.id + '" title="岗位资料卡（加班费标准）">📇</button> ' +
      '<button class="btn sm ' + (isLock(e) ? 'solid' : 'light') + '" data-act="catalog-lock" data-eid="' + e.id + '" title="锁定/解锁价格">' + (isLock(e) ? '🔒' : '🔓') + '</button> ' +
      '<button class="del" data-act="catalog-del" data-eid="' + e.id + '">✕</button></td></tr>';
  }
  function catRowHtml(e) {
    return '<tr data-eid="' + e.id + '" data-name="' + esc(e.name) + '" data-cat="' + esc(e.cat || '') + '" data-type="' + esc(e.type || 'equipment') + '" data-sup="' + esc(supOf(e)) + '" data-group="' + esc(grpOf(e)) + '" data-major="' + esc(majorOf(e)) + '">' +
      '<td><input class="name-edit" data-efield="name" value="' + esc(e.name) + '"> <span class="major-tag ' + (majorOf(e) === '灯光器材' ? 'light' : 'photo') + '">' + esc(majorOf(e)) + '</span> <span class="src-tag" title="' + esc(supOf(e)) + '">' + esc(srcLabel(supOf(e))) + '</span>' + (grpOf(e) ? '<div class="grp-tag" title="' + esc(grpOf(e)) + '">' + esc(grpOf(e)) + '</div>' : '') + '</td>' +
      '<td><input class="input-plain" style="width:80px" data-efield="cat" value="' + esc(e.cat || '') + '"></td>' +
      '<td><span class="cat-tag ' + (e.type === 'crew' ? 'crew' : '') + '">' + (e.type === 'crew' ? '人员' : '器材') + '</span></td>' +
      '<td><input class="input-plain" style="width:42px" data-efield="unit" value="' + esc(e.unit || '个') + '"></td>' +
      '<td class="num"><input class="price" type="number" min="0" step="0.01" data-efield="bottom" value="' + esc(e.bottom) + '"' + (isLock(e) ? ' disabled' : '') + '></td>' +
      '<td class="num"><input class="price" type="number" min="0" step="0.01" data-efield="quote" value="' + esc(e.quote) + '"' + (isLock(e) ? ' disabled' : '') + '></td>' +
      '<td class="num"><input class="price" type="number" min="0" step="0.01" data-efield="approved" value="' + esc(e.approved) + '"' + (isLock(e) ? ' disabled' : '') + '></td>' +
      '<td class="num"><input class="qty" type="number" min="0" step="1" data-efield="stock" value="' + esc(e.stock === null || e.stock === undefined ? '' : e.stock) + '" placeholder="—"></td>' +
      '<td><input class="note" data-efield="note" value="' + esc(e.note || '') + '"></td>' +
      '<td style="text-align:center;white-space:nowrap"><button class="btn sm ' + (isLock(e) ? 'solid' : 'light') + '" data-act="catalog-lock" data-eid="' + e.id + '" title="锁定/解锁价格">' + (isLock(e) ? '🔒' : '🔓') + '</button> ' +
      '<button class="del" data-act="catalog-del" data-eid="' + e.id + '">✕</button></td></tr>';
  }
  function applyCatalogFilter() {
    var q = (($('[data-search="catalog"]') || {}).value || '').trim().toLowerCase();
    var cat = ($('[data-cat-filter]') || {}).value || '';
    var typ = ($('[data-type-filter]') || {}).value || '';
    var sup = ($('[data-sup-filter]') || {}).value || '';
    var grp = ($('[data-group-filter]') || {}).value || '';
    var major = ($('[data-major-filter]') || {}).value || '';
    $$('#view tbody tr[data-eid]').forEach(function (tr) {
      var name = (tr.dataset.name || '').toLowerCase();
      var ok = (!q || name.indexOf(q) >= 0) && (!cat || tr.dataset.cat === cat) && (!typ || tr.dataset.type === typ)
        && (!sup || tr.dataset.sup === sup) && (!grp || tr.dataset.group === grp) && (!major || tr.dataset.major === major);
      tr.style.display = ok ? '' : 'none';
    });
  }

  /* ---------------- 历史项目 ---------------- */
  function renderSettlement() {
    var p = scopeProject();
    var view = state.ui.settleView || 'overtime';
    var inner = view === 'overtime' ? renderOvertime() : (view === 'expenses' ? renderExpenses() : renderStats());
    inner = inner.replace(/^<div class="page">/, '').replace(/<\/div>$/, '');
    var tabs = [['overtime', '加班记录'], ['expenses', '报销整理'], ['stats', '费用统计']].map(function (x) {
      return '<button class="chip ' + (view === x[0] ? 'active' : '') + '" data-act="settle-view" data-view="' + x[0] + '">' + x[1] + '</button>';
    }).join('');
    return '<div class="page">' +
      '<div class="toolbar"><button class="btn light" data-act="settle-back">← 返回历史项目</button>' +
      '<span class="g-title" style="font-weight:800;font-size:16px">' + esc(p.name || '未命名项目') + '</span>' +
      '<span class="muted small">' + esc(p.shootDate || '') + ' · 项目结算</span><span class="spacer"></span>' +
      '<button class="btn light" data-act="share-links">🔗 分享链接</button></div>' +
      '<div class="proj-tabs">' + tabs + '<span class="muted small" style="margin-left:8px">拍完后在这里结算</span></div>' +
      inner + '</div>';
  }
  function renderHistory() {
    if (state.ui.settleId) return renderSettlement();
    var list = state.projects.slice().sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
    var cur = state.project, curT = M.totals(cur);
    var items = list.map(function (p) {
      var t = M.totals(p);
      return '<div class="history-item"><div><div class="h-title">' + esc(p.name || '未命名项目') + '</div>' +
        '<div class="h-meta">' + esc(p.shootDate || '') + ' · ' + (p.groups || []).length + ' 个机位组 · 保存于 ' + esc(p.updatedAt || '') + '</div></div>' +
        '<div class="h-money"><div class="q">核价 ' + money(t.approved) + '</div><div class="c">报价 ' + money(t.quote) + ' · 底价 ' + money(t.bottom) + ' · 利润 ' + money(t.profit) + '（' + t.profitRateBottom + '%）</div></div>' +
        '<div class="toolbar"><button class="btn sm solid" data-act="history-settle" data-pid="' + p.id + '">结算</button>' +
        '<button class="btn sm light" data-act="history-load" data-pid="' + p.id + '">载入</button>' +
        '<button class="btn sm light" data-act="history-dup" data-pid="' + p.id + '">复制</button>' +
        '<button class="btn sm danger" data-act="history-del" data-pid="' + p.id + '">删除</button></div></div>';
    }).join('');
    if (!items) items = '<div class="empty"><div class="big">🗂</div><p>还没有保存过项目。在「下单报价」里点右上角「保存」即可存到这里。</p></div>';
    return '<div class="page">' +
      '<section class="card"><div class="card-head"><h2>当前编辑中的项目</h2><span class="sub">还没存到历史里？点保存</span></div>' +
      '<div class="card-body"><div class="history-item" style="border:0;padding:0"><div><div class="h-title">' + esc(cur.name || '未命名项目') + '</div>' +
      '<div class="h-meta">' + esc(cur.shootDate || '') + ' · ' + cur.groups.length + ' 个机位组 · ' + M.sumQty(cur) + ' 件</div></div>' +
      '<div class="h-money"><div class="q">核价 ' + money(curT.approved) + '</div><div class="c">报价 ' + money(curT.quote) + ' · 底价 ' + money(curT.bottom) + ' · 利润 ' + money(curT.profit) + '（' + curT.profitRateBottom + '%）</div></div>' +
      '<div class="toolbar"><button class="btn sm solid" data-act="save">保存到历史</button></div></div></div></section>' +
      '<section class="card"><div class="card-head"><h2>历史项目（' + list.length + '）</h2><span class="sub">点载入继续编辑，复制可做新一版</span></div>' +
      '<div class="card-body"><div class="history-list">' + items + '</div></div></section>' +
      '</div>';
  }

  /* ---------------- 设置 ---------------- */
  function renderSettings() {
    var s = state.settings;
    return '<div class="page"><div class="toolbar" style="margin:0 0 12px"><span class="spacer"></span><button class="btn light" data-act="lock-settings">🔒 锁定设置</button></div><div class="settings-grid">' +
      '<section class="card"><div class="card-head"><h2>公司与单据信息</h2><span class="sub">导出的报价单会用这里的抬头</span></div><div class="card-body">' +
      '<div class="form-grid" style="grid-template-columns:1fr 1fr">' +
      '<label class="field span-2">承接单位<input data-sfield="company" value="' + esc(s.company) + '"></label>' +
      '<label class="field span-2">单位地址<input data-sfield="address" value="' + esc(s.address) + '"></label>' +
      '<label class="field">制表人<input data-sfield="preparer" value="' + esc(s.preparer) + '"></label>' +
      '<label class="field">报价单编号前缀<input data-sfield="noPrefix" value="' + esc(s.noPrefix) + '"></label>' +
      '<label class="field">默认税率 %<input type="number" min="0" step="0.01" data-sfield="taxRate" value="' + esc(M.round2(M.num(s.taxRate) * 100)) + '"></label>' +
      '<label class="field">数据统计 / 设置访问密码<input data-sfield="profitPin" value="' + esc(s.profitPin || '') + '" placeholder="留空则不设密码"></label>' +
      '</div></div></section>' +
      '<section class="card"><div class="card-head"><h2>默认价格比例（新项目生效）</h2><span class="sub">老项目在数据统计里单独改</span></div><div class="card-body">' +
      '<div class="form-grid" style="grid-template-columns:1fr 1fr">' +
      '<label class="field">加价率 %（底价→报价）<input type="number" min="0" step="0.01" data-sfield="markupRate" value="' + esc(M.round2(M.num(s.markupRate))) + '"></label>' +
      '<label class="field">核价砍价 %（报价→核价）<input type="number" min="0" step="0.01" data-sfield="cutRate" value="' + esc(M.round2(M.num(s.cutRate))) + '"></label>' +
      '<label class="field">供应商返点 %（按底价）<input type="number" min="0" step="0.01" data-sfield="rebateRate" value="' + esc(M.round2(M.num(s.rebateRate))) + '"></label>' +
      '</div></div></section>' +
      '<section class="card"><div class="card-head"><h2>数据与备份</h2><span class="sub">本机存储：' + (storageOK ? '可用' : '不可用（请用导出备份）') + '</span></div><div class="card-body">' +
      '<div class="kv"><span class="k">器材库</span><span class="v">' + state.catalog.length + ' 项</span></div>' +
      '<div class="kv"><span class="k">供应商板块</span><span class="v">' + (function () { var g = {}; state.catalog.forEach(function (e) { if (grpOf(e)) g[grpOf(e)] = 1; }); return Object.keys(g).length; })() + ' 个</span></div>' +
      '<div class="kv"><span class="k">器材组合</span><span class="v">' + state.kits.length + ' 组</span></div>' +
      '<div class="kv"><span class="k">历史项目</span><span class="v">' + state.projects.length + ' 个</span></div>' +
      '<div class="kv"><span class="k">器材库来源</span><span class="v">' + esc(state.meta.source || '') + '</span></div>' +
      '<div class="toolbar" style="margin-top:14px;flex-wrap:wrap">' +
      '<button class="btn solid" data-act="export-all">导出全部数据（备份）</button>' +
      '<button class="btn light" data-act="import-all">导入全部数据</button>' +
      '<button class="btn danger" data-act="clear-projects">清空所有项目（保留器材库/组合）</button>' +
      '<button class="btn danger" data-act="clear-all">清空全部数据</button>' +
      '</div><p class="muted small" style="margin:12px 0 0">数据只存在这台电脑的浏览器里，建议每周导出一次备份。</p>' +
      '</div></section>' +
      '<section class="card" style="grid-column:1/-1"><div class="card-head"><h2>两个界面怎么用</h2></div><div class="card-body">' +
      '<div class="kv"><span class="k">下单报价（对外）</span><span class="v" style="font-weight:400">只显示报价，适合给公司/外包下单；默认打开就是它，别人看不到底价和利润。</span></div>' +
      '<div class="kv"><span class="k">数据统计（内部）</span><span class="v" style="font-weight:400">底价、返点、利润、按机位组分析；入口在右上角「数据统计 →」，或双击文件夹里的「数据统计.html」。</span></div>' +
      '<div class="kv"><span class="k">器材组合</span><span class="v" style="font-weight:400">把常用的机位/器材组合存成「组合」，下单时勾几组就拼出一套报价；也能随时编辑、复制。</span></div>' +
      '<div class="kv"><span class="k">出库单</span><span class="v" style="font-weight:400">两个界面里都有，按机位合并器材、填实发、算差异。</span></div>' +
      '</div></section>' +
      '</div></div>';
  }

  /* ---------------- 弹窗 ---------------- */
  function openModal(html) { $('#modal-root').innerHTML = '<div class="modal-backdrop" data-modal-backdrop>' + html + '</div>'; }
  function closeModal() { $('#modal-root').innerHTML = ''; }

  function openPicker(target) {
    var isKit = !!(target && target.kitId);
    var owner = isKit ? state.kits.filter(function (k) { return k.id === target.kitId; })[0] : groupById(target && target.gid);
    if (!owner) return;
    state.ui.pickerTarget = target;
    var cats = {}; state.catalog.forEach(function (e) { cats[e.cat || '其他'] = 1; });
    var chips = ['<button class="chip active" data-pcat="">全部</button>'].concat(Object.keys(cats).sort().map(function (c) {
      return '<button class="chip" data-pcat="' + esc(c) + '">' + esc(c) + '</button>';
    })).join('');
    var rows = state.catalog.map(function (e) {
      var stock = (e.stock === null || e.stock === undefined || e.stock === '') ? '—' : e.stock;
      return '<tr class="pick-row" data-pick-eqid="' + e.id + '" data-cat="' + esc(e.cat || '') + '" data-name="' + esc(e.name) + '">' +
        '<td class="center"><input type="checkbox" data-pick-check></td>' +
        '<td>' + esc(e.name) + '</td><td><span class="cat-tag ' + (e.type === 'crew' ? 'crew' : '') + '">' + esc(e.cat || '') + '</span></td>' +
        '<td class="center">' + esc(e.unit || '个') + '</td>' +
        '<td class="num">' + money(e.quote) + '</td><td class="num muted">' + stock + '</td></tr>';
    }).join('');
    var title = isKit ? '添加到组合「' + esc(owner.name) + '」' : '添加器材 / 人员 到「' + esc(owner.name) + '」';
    openModal('<div class="modal"><div class="modal-head"><h3>' + title + '</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
      '<div class="modal-body"><div class="picker-search"><input type="search" data-search="picker" placeholder="搜索名称 / 型号，例如 FX3、图传、灯光助理…">' +
      '<div class="chips" data-picker-cats>' + chips + '</div></div>' +
      '<div class="picker-list"><table class="grid"><thead><tr><th style="width:36px"></th><th>名称</th><th>分类</th><th>单位</th><th class="num">报价单价</th><th class="num">库存</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<details style="margin-top:12px"><summary class="muted small" style="cursor:pointer">找不到？手动新增一条（会同时加入器材库）</summary><div class="form-grid" style="grid-template-columns:2fr .8fr 1fr 1fr 1fr 1fr;margin-top:10px">' +
      '<label class="field">名称<input data-custom="name" placeholder="例如：Sony FX6 机身 / 跟机员"></label>' +
      '<label class="field">单位<input data-custom="unit" value="台"></label>' +
      '<label class="field">底价<input type="number" step="0.01" data-custom="bottom" placeholder="0"></label>' +
      '<label class="field">报价<input type="number" step="0.01" data-custom="quote" placeholder="0"></label>' +
      '<label class="field">核价<input type="number" step="0.01" data-custom="approved" placeholder="0"></label>' +
      '<label class="field">类型<select data-custom="type"><option value="equipment">器材</option><option value="crew">人员</option></select></label>' +
      '<button class="btn light" data-act="picker-custom" style="grid-column:1/-1">新增并添加</button></div></details></div>' +
      '<div class="modal-foot"><span class="muted">已选 <b data-pick-count>0</b> 项</span><span class="spacer"></span>' +
      '<button class="btn light" data-act="modal-close">取消</button><button class="btn primary" data-act="picker-add">添加选中</button></div></div>');
  }
  function pickerFilter(q, cat) {
    $$('#modal-root tr.pick-row').forEach(function (tr) {
      var name = (tr.dataset.name || '').toLowerCase();
      var ok = (!q || name.indexOf(q) >= 0) && (!cat || tr.dataset.cat === cat);
      tr.style.display = ok ? '' : 'none';
    });
  }
  function pickerCount() {
    var n = $$('#modal-root [data-pick-check]').filter(function (c) { return c.checked; }).length;
    var e = $('#modal-root [data-pick-count]'); if (e) e.textContent = n;
    return n;
  }

  /* ---------- 组合库 ---------- */
  function kitById(id) { return (state.kits || []).filter(function (k) { return k.id === id; })[0]; }
  function kitQty(kit) { return kit.items.reduce(function (s, i) { return s + M.num(i.qty); }, 0); }
  function kitPreview(kit) {
    return kit.items.slice(0, 6).map(function (i) { return esc(i.name) + ' ×' + M.num(i.qty); }).join('、') + (kit.items.length > 6 ? ' 等' : '');
  }
  function openKitsPicker() {
    var html = (state.kits || []).map(function (k) {
      return '<div class="tpl-block"><div class="tpl-head"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" data-kit-pick="' + k.id + '"> <span class="tpl-title">' + esc(k.name) + '</span></label>' +
        '<span class="tag">' + k.items.length + ' 项 / ' + kitQty(k) + ' 件</span></div>' +
        '<div class="tpl-groups" style="padding:6px 12px;color:#6b7280;font-size:12px">' + kitPreview(k) + '</div></div>';
    }).join('') || '<div class="empty">还没有组合，先去「器材组合」建一个</div>';
    openModal('<div class="modal"><div class="modal-head"><h3>从组合添加机位组</h3><button class="x-btn" data-act="modal-close">✕</button></div>' +
      '<div class="modal-body"><p class="muted small" style="margin-top:0">勾选需要的组合，会按当前器材库价格加成机位组；同名机位组会自动合并。组合可以随时在「器材组合」里改。</p>' + html + '</div>' +
      '<div class="modal-foot"><span class="muted">已选 <b data-kit-count>0</b> 组</span><span class="spacer"></span>' +
      '<button class="btn light" data-act="modal-close">取消</button><button class="btn primary" data-act="kits-add">添加所选组合</button></div></div>');
  }
  function updateKitPickCount() {
    var n = $$('#modal-root input[data-kit-pick]').filter(function (c) { return c.checked; }).length;
    var e = $('#modal-root [data-kit-count]'); if (e) e.textContent = n;
  }
  function kitToProject(kit) {
    var p = state.project;
    var g = p.groups.filter(function (x) { return x.name === kit.name; })[0];
    if (!g) { g = { id: uid('g'), name: kit.name, items: [] }; p.groups.push(g); }
    if (M.num(kit.pkgQuote) > 0) {
      g.pkg = true;
      g.pkgQuote = M.num(kit.pkgQuote);
      g.pkgBottom = M.num(kit.pkgBottom);
      g.pkgApproved = M.num(kit.pkgApproved);
      g.pkgQty = M.num(kit.pkgQty) || 1;
    }
    kit.items.forEach(function (ki) {
      var ce = catalogByName(ki.name);
      g.items.push({
        id: uid('l'), eqId: ce ? ce.id : '', name: ki.name, unit: ki.unit || '个',
        type: ki.type || 'equipment', cat: (ce && ce.cat) || ki.cat || '其他', qty: M.num(ki.qty) || 1,
        bottom: ce ? ce.bottom : 0, quote: ce ? ce.quote : 0, approved: ce ? ce.approved : 0,
        approvedManual: false, note: (ki.note || (ce && ce.note) || ((ki.type === 'crew') ? ruleForCrew(ki.name) : ''))
      });
    });
    return g;
  }
  function addKitsToProject(ids, silent) {
    if (!ids.length) return 0;
    var added = 0;
    ids.forEach(function (id) {
      var kit = kitById(id); if (!kit) return;
      kitToProject(kit); added += kit.items.length;
    });
    var missing = 0;
    (state.project.groups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) { if (!catalogByName(it.name)) missing += 1; });
    });
    commit();
    if (!silent) {
      setTab('order');
      toast('已按组合添加 ' + added + ' 行器材' + (missing ? '；有 ' + missing + ' 行在器材库/人员标准里没匹配到价格' : ''), missing ? 'warn' : 'ok');
    }
    return added;
  }

  function kitMajor(k) { return k.cat || (/灯光/.test(k.name) ? '灯光器材' : (/备用|辅助|录音|其他/.test(k.name) ? '其他' : '摄影器材')); }

  function renderKits() {
    var all = state.kits || [];
    var filter = state.ui.kitCat || '全部';
    var list = filter === '全部' ? all : all.filter(function (k) { return kitMajor(k) === filter; });
    var counts = { '全部': all.length };
    all.forEach(function (k) { var c = kitMajor(k); counts[c] = (counts[c] || 0) + 1; });
    var chips = ['全部', '摄影器材', '灯光器材', '其他'].map(function (c) {
      return '<button class="chip ' + (filter === c ? 'active' : '') + '" data-act="kit-filter" data-cat="' + c + '">' + c + '（' + (counts[c] || 0) + '）</button>';
    }).join('');
    var cards = list.map(function (k) {
      var cat = kitMajor(k);
      return '<div class="kit-card" data-kit-card="' + k.id + '">' +
        '<div class="k-title"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" data-kit-check="' + k.id + '"> ' + esc(k.name) + '</label>' +
        '<span class="major-tag ' + (cat === '灯光器材' ? 'light' : (cat === '摄影器材' ? 'photo' : 'crew')) + '">' + esc(cat) + '</span></div>' +
        '<div class="k-meta">' + k.items.length + ' 项 / ' + kitQty(k) + ' 件' + (k.note ? ' · ' + esc(k.note) : '') + '</div>' +
        '<div class="k-items">' + kitPreview(k) + '</div>' +
        '<div class="k-actions">' +
        '<button class="btn sm solid" data-act="kit-add" data-kid="' + k.id + '">加入项目</button>' +
        '<button class="btn sm light" data-act="kit-edit" data-kid="' + k.id + '">编辑</button>' +
        '<button class="btn sm light" data-act="kit-dup" data-kid="' + k.id + '">复制</button>' +
        '<button class="btn sm danger" data-act="kit-del" data-kid="' + k.id + '">删除</button>' +
        '</div></div>';
    }).join('');
    return '<div class="page">' +
      '<div class="hint">把常用的<b>机位 / 灯光器材组合</b>存成「组合」，下单时勾几组就能拼出一套报价。组合只记名称和数量，价格永远按当前器材库算。</div>' +
      '<div class="toolbar">' +
      '<button class="btn solid" data-act="kit-new" data-cat="摄影器材">＋ 摄影组合</button>' +
      '<button class="btn solid" data-act="kit-new" data-cat="灯光器材">＋ 灯光组合</button>' +
      '<button class="btn light" data-act="kits-add-selected">添加所选组合到项目</button>' +
      '<span class="spacer"></span>' +
      '<span class="muted small">共 ' + all.length + ' 组 · 点卡片上的「加入项目」即可</span>' +
      '</div>' +
      '<div class="toolbar">' + chips + '</div>' +
      '<div class="kit-grid">' + (cards || '<div class="empty" style="grid-column:1/-1"><div class="big">🧰</div><p>这个分类下还没有组合。</p></div>') + '</div>' +
      '</div>';
  }

  function quickCameraPanel() {
    function eq(re) { return state.catalog.filter(function (e) { return e.type !== 'crew' && re.test(e.name); }); }
    function opts(re) { return '<option value="">不选</option>' + eq(re).map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '（¥' + M.round2(e.quote) + '）</option>'; }).join(''); }
    function optsCat(cat) { return '<option value="">不选</option>' + state.catalog.filter(function (e) { return e.type !== 'crew' && e.cat === cat; })
      .map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '（¥' + M.round2(e.quote) + '）</option>'; }).join(''); }
    var crew = state.catalog.filter(function (e) { return e.type === 'crew'; });
    function crewOpts(re) { return crew.filter(function (e) { return re.test(e.name); }).map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '（¥' + M.round2(e.quote) + '）</option>'; }).join(''); }
    var lensOpts = optsCat('镜头');
    var filterOpts = opts(/(滤镜|镜片|ND|偏振|柔光镜|拉丝|黑魔法|棱镜|放大镜|渐变|星光)/i);
    var supportOpts = [
      { v: '稳定器', re: /稳定器|如影|Ronin|Movi|智云|斯坦尼康/i },
      { v: '轨道', re: /轨道|滑轨|车拍|板车/i },
      { v: '摇臂', re: /摇臂|伸缩|占美|Scorpio/i }
    ].map(function (t) { return '<optgroup label="' + t.v + '">' + opts(t.re) + '</optgroup>'; }).join('');
    return '<section class="card"><div class="card-head"><h2>机位快速配置</h2><span class="sub">选机身和常用配件，一键生成；镜头/滤镜可展开</span></div><div class="card-body">' +
      '<div class="qk-grid qk-main">' +
      '<label class="field qk">摄影机<select data-qk="camera">' + optsCat('摄影机') + '</select></label>' +
      '<label class="field qk">承载（稳定器/轨道/摇臂）<select data-qk="support">' + supportOpts + '</select></label>' +
      '<label class="field qk">监视器<select data-qk="monitor">' + opts(/(监视器|电视|录机)/i) + '</select></label>' +
      '<label class="field qk">无线图传<select data-qk="vtx">' + opts(/(图传|图存|Transmission)/i) + '</select></label>' +
      '<label class="field qk">电池<select data-qk="battery">' + opts(/电池|V口|BP-|充电器/i) + '</select><input class="qty" type="number" min="0" step="1" data-qk="batteryQty" value="4"></label>' +
      '<label class="field qk">内存卡<select data-qk="card">' + opts(/(内存卡|存储卡|CFexpress|SD卡|A卡|SSD|读卡器|TOUGH)/i) + '</select><input class="qty" type="number" min="0" step="1" data-qk="cardQty" value="3"></label>' +
      '<label class="field qk">跟焦器<select data-qk="ff"><option value="">不选</option><option value="__auto__">自动跟焦</option><option value="__manual__">手动跟焦</option></select></label>' +
      '</div>' +
      '<div class="qk-chips">' +
      '<label class="qk-chip"><input type="checkbox" data-qkchk="matte"> 遮光斗</label>' +
      '<label class="qk-chip"><input type="checkbox" data-qkchk="tc"> 时码器</label>' +
      '<label class="qk-chip"><input type="checkbox" data-qkchk="kit"> 基础套件</label>' +
      '<span class="muted small">勾选后自动加入清单</span>' +
      '</div>' +
      '<details class="qk-details"><summary>镜头 / 滤镜（最多各 5 支/种，可选）</summary>' +
      '<div class="qk-sub">镜头</div><div class="qk-grid qk-5">' +
      [1, 2, 3, 4, 5].map(function (i) { return '<label class="field qk">镜头 ' + i + '<select data-qk="lens' + i + '">' + lensOpts + '</select></label>'; }).join('') +
      '</div><div class="qk-sub">滤镜</div><div class="qk-grid qk-5">' +
      [1, 2, 3, 4, 5].map(function (i) { return '<label class="field qk">滤镜 ' + i + '<select data-qk="filter' + i + '">' + filterOpts + '</select></label>'; }).join('') +
      '</div></details>' +
      '<div class="qk-grid qk-main" style="margin-top:10px">' +
      '<label class="field qk">摄影助理<select data-qk="assistant">' + crewOpts(/摄影助理/i) + '</select><input class="qty" type="number" min="0" step="1" data-qk="assistantQty" value="1"></label>' +
      '<label class="field qk">技术助理<select data-qk="tech">' + crewOpts(/跟机员|机器技术|摄影大助理|技术/i) + '</select><input class="qty" type="number" min="0" step="1" data-qk="techQty" value="1"></label>' +
      '<span class="spacer"></span>' +
      '<button class="btn primary" data-act="kit-quick-build" data-kid="__KID__">生成到组合清单</button>' +
      '</div>' +
      '<p class="muted small" style="margin:8px 0 0">生成后可继续手动增减；价格按当前器材库计算。</p>' +
      '</div></section>';
  }

  function quickLightPanel() {
    function byCat(cats) {
      return state.catalog.filter(function (e) { return e.type !== 'crew' && cats.indexOf(e.cat) >= 0; });
    }
    function opts(list) {
      return '<option value="">不选</option>' + list.map(function (e) {
        return '<option value="' + e.id + '">' + esc(e.name) + '（¥' + M.round2(e.quote) + '）</option>';
      }).join('');
    }
    var lampList = byCat(['灯光设备', 'LED灯', '聚光灯/镝灯', '柔光灯']).filter(function (e) { return !/控台/.test(e.name); });
    var accList = byCat(['柔光/旗板', '布景/沙包', '灯光附件']);
    var standList = byCat(['灯架/钢脚']);
    var wireList = byCat(['电源/线材']).filter(function (e) { return !/16A|32A/.test(e.name); });
    var crew = state.catalog.filter(function (e) { return e.type === 'crew'; });
    function crewOpts(re) { return crew.filter(function (e) { return re.test(e.name); }).map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '（¥' + M.round2(e.quote) + '）</option>'; }).join(''); }
    return '<section class="card"><div class="card-head"><h2>灯光快速配置</h2><span class="sub">灯光器材 → 灯光附件 → 灯架 → 电线，选完一键生成</span></div><div class="card-body">' +
      '<div class="qk-sub">灯光器材（最多 6 台）</div><div class="qk-grid qk-5">' +
      [1, 2, 3, 4, 5, 6].map(function (i) { return '<label class="field qk">灯具 ' + i + '<select data-lk="lamp' + i + '">' + opts(lampList) + '</select></label>'; }).join('') +
      '</div><div class="qk-chips"><label class="qk-chip"><input type="checkbox" data-lkchk="console"> 灯光控台</label></div>' +
      '<div class="qk-sub">灯光附件</div><div class="qk-grid qk-5">' +
      [1, 2, 3, 4, 5].map(function (i) { return '<label class="field qk">附件 ' + i + '<select data-lk="acc' + i + '">' + opts(accList) + '</select></label>'; }).join('') +
      '</div>' +
      '<div class="qk-sub">灯架</div><div class="qk-grid qk-main">' +
      [1, 2, 3, 4].map(function (i) { return '<label class="field qk">灯架 ' + i + '<select data-lk="stand' + i + '">' + opts(standList) + '</select></label>'; }).join('') +
      '</div>' +
      '<div class="qk-sub">电线</div><div class="qk-grid qk-main">' +
      '<label class="field qk">16A 电线（米）<input class="qty" type="number" min="0" step="1" data-lk="wire16" value="0"></label>' +
      '<label class="field qk">32A 电线（米）<input class="qty" type="number" min="0" step="1" data-lk="wire32" value="0"></label>' +
      '<label class="field qk">其他线材<select data-lk="wireOther">' + opts(wireList) + '</select></label>' +
      '<label class="field qk">其他线材数量<input class="qty" type="number" min="0" step="1" data-lk="wireOtherQty" value="1"></label>' +
      '</div>' +
      '<div class="qk-sub">人员</div><div class="qk-grid qk-main">' +
      '<label class="field qk">灯光师<select data-lk="chief">' + crewOpts(/灯光师/i) + '</select><input class="qty" type="number" min="0" step="1" data-lk="chiefQty" value="1"></label>' +
      '<label class="field qk">灯光助理<select data-lk="assist">' + crewOpts(/灯光助理/i) + '</select><input class="qty" type="number" min="0" step="1" data-lk="assistQty" value="4"></label>' +
      '</div>' +
      '<div class="toolbar" style="margin-top:14px">' +
      '<button class="btn primary" data-act="kit-light-build" data-kid="__KID__">生成到组合清单（替换现有清单）</button>' +
      '<span class="muted small">电线按 10 米/条 折算数量，生成后可改；价格按当前器材库计算。</span></div></div></section>';
  }

  function renderKitEditor() {
    var kit = kitById(state.ui.editingKit);
    if (!kit) { state.ui.editingKit = null; return renderKits(); }
    var kitCat = kitMajor(kit);
    var rows = kit.items.map(function (it, idx) {
      return '<tr data-kidx="' + idx + '">' +
        '<td class="num">' + (idx + 1) + '</td>' +
        '<td><span class="cat-tag ' + (it.type === 'crew' ? 'crew' : '') + '">' + (it.type === 'crew' ? '人员' : '器材') + '</span> ' + esc(it.name) + '</td>' +
        '<td><input class="input-plain" style="width:46px" data-kitemfield="unit" data-kidx="' + idx + '" value="' + esc(it.unit || '个') + '"></td>' +
        '<td><input class="qty" type="number" min="1" step="1" data-kitemfield="qty" data-kidx="' + idx + '" value="' + esc(it.qty) + '"></td>' +
        '<td class="muted">' + esc(it.cat || '') + '</td>' +
        '<td style="text-align:center"><button class="del" data-act="kit-del-item" data-kid="' + kit.id + '" data-kidx="' + idx + '">✕</button></td></tr>';
    }).join('');
    if (!rows) rows = '<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">这个组合还没有器材，用上面的快速配置生成，或点「＋ 手动添加器材」</td></tr>';
    var quick = kitCat === '摄影器材' ? quickCameraPanel().replace('__KID__', kit.id)
      : kitCat === '灯光器材' ? quickLightPanel().replace('__KID__', kit.id) : '';
    return '<div class="page">' +
      '<div class="toolbar">' +
      '<button class="btn light" data-act="kits-back">← 返回组合列表</button>' +
      '<button class="btn light" data-act="kit-add-item" data-kid="' + kit.id + '">＋ 手动添加器材</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn solid" data-act="kit-add" data-kid="' + kit.id + '">整个组合加入项目</button>' +
      '</div>' +
      '<section class="card"><div class="card-head"><h2>组合信息</h2><span class="sub">分类决定用哪套快速配置；只存名称和数量，价格按器材库算</span></div>' +
      '<div class="card-body"><div class="form-grid">' +
      '<label class="field span-2">组合名称<input data-kitfield="name" data-kid="' + kit.id + '" value="' + esc(kit.name) + '"></label>' +
      '<label class="field">组合分类<select data-kitcat="' + kit.id + '"><option' + (kitCat === '摄影器材' ? ' selected' : '') + '>摄影器材</option><option' + (kitCat === '灯光器材' ? ' selected' : '') + '>灯光器材</option><option' + (kitCat === '其他' ? ' selected' : '') + '>其他</option></select></label>' +
      '<label class="field">备注<input data-kitfield="note" data-kid="' + kit.id + '" value="' + esc(kit.note || '') + '" placeholder="例如：A1 斯坦尼康常用配置"></label>' +
      '<label class="field">整组报价（选填）<input data-kitfield="pkgQuote" data-kid="' + kit.id + '" type="number" step="0.01" value="' + esc(kit.pkgQuote || '') + '" placeholder="按组给价的填这里"></label>' +
      '<label class="field">整组底价（选填）<input data-kitfield="pkgBottom" data-kid="' + kit.id + '" type="number" step="0.01" value="' + esc(kit.pkgBottom || '') + '"></label>' +
      '<label class="field">整组核价（选填）<input data-kitfield="pkgApproved" data-kid="' + kit.id + '" type="number" step="0.01" value="' + esc(kit.pkgApproved || '') + '"></label>' +
      '<label class="field">组数<input data-kitfield="pkgQty" data-kid="' + kit.id + '" type="number" step="1" min="1" value="' + esc(kit.pkgQty || 1) + '"></label>' +
      '</div></div></section>' + quick +
      '<section class="card"><div class="card-head"><h2>组合清单</h2><span class="sub">' + kit.items.length + ' 项 / ' + kitQty(kit) + ' 件</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>序号</th><th style="min-width:260px">器材 / 人员</th><th>单位</th><th>数量</th><th>分类</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</section></div>';
  }
  function lightingQuickBuild(kid) {
    var kit = kitById(kid); if (!kit) return;
    if (kit.items.length && !confirm('用快速配置生成的新清单替换当前 ' + kit.items.length + ' 项？')) return;
    function pick(id) { return state.catalog.filter(function (e) { return e.id === id; })[0]; }
    function first(re) { return state.catalog.filter(function (e) { return e.type !== 'crew' && re.test(e.name); })[0]; }
    var v = function (k) { var el = document.querySelector('[data-lk="' + k + '"]'); return el ? el.value : ''; };
    var chk = function (k) { var el = document.querySelector('[data-lkchk="' + k + '"]'); return !!(el && el.checked); };
    var items = [];
    function push(e, qty, note) {
      if (!e || !qty) return;
      var it = { name: e.name, unit: e.unit || '个', type: e.type || 'equipment', cat: e.cat || '灯光设备', qty: qty };
      if (note) it.note = note;
      items.push(it);
    }
    [1, 2, 3, 4, 5, 6].forEach(function (i) { push(pick(v('lamp' + i)), 1); });
    if (chk('console')) push(first(/灯光控台/), 1);
    [1, 2, 3, 4, 5].forEach(function (i) { push(pick(v('acc' + i)), 1); });
    [1, 2, 3, 4].forEach(function (i) { push(pick(v('stand' + i)), 1); });
    var w16 = M.num(v('wire16')), w32 = M.num(v('wire32'));
    if (w16 > 0) push(first(/16A电源线/), Math.ceil(w16 / 10), '16A 电线共 ' + w16 + ' 米（按 10 米/条 折算）');
    if (w32 > 0) push(first(/32A电源线/), Math.ceil(w32 / 10), '32A 电线共 ' + w32 + ' 米（按 10 米/条 折算）');
    push(pick(v('wireOther')), M.num(v('wireOtherQty')));
    push(pick(v('chief')), M.num(v('chiefQty')));
    push(pick(v('assist')), M.num(v('assistQty')));
    var merged = {};
    items.forEach(function (it) {
      var k = M.normalizeName(it.name);
      if (merged[k]) { merged[k].qty += it.qty; if (!merged[k].note && it.note) merged[k].note = it.note; }
      else merged[k] = it;
    });
    kit.items = Object.keys(merged).map(function (k) { return merged[k]; });
    commit(); render();
    toast('已生成灯光组合 ' + kit.items.length + ' 项', 'ok');
  }

  function kitQuickBuild(kid) {
    var kit = kitById(kid); if (!kit) return;
    if (kit.items.length && !confirm('用快速配置生成的新清单替换当前 ' + kit.items.length + ' 项？')) return;
    function pick(id) { return state.catalog.filter(function (e) { return e.id === id; })[0]; }
    function first(re) { return state.catalog.filter(function (e) { return e.type !== 'crew' && re.test(e.name); })[0]; }
    function addItem(e, qty) {
      if (!e || !qty) return;
      kit.items.push({ name: e.name, unit: e.unit || '个', type: e.type || 'equipment', cat: e.cat || '其他', qty: qty });
    }
    var items = [];
    function pushFrom(e, qty) {
      if (!e || !qty) return;
      items.push({ name: e.name, unit: e.unit || '个', type: e.type || 'equipment', cat: e.cat || '其他', qty: qty });
    }
    var v = function (k) { var el = document.querySelector('[data-qk="' + k + '"]'); return el ? el.value : ''; };
    var chk = function (k) { var el = document.querySelector('[data-qkchk="' + k + '"]'); return !!(el && el.checked); };
    pushFrom(pick(v('camera')), 1);
    if (chk('kit')) {
      var bk = state.catalog.filter(function (e) { return e.name === '基础套件'; })[0];
      if (!bk) {
        bk = { id: uid('eq'), key: M.normalizeName('基础套件'), name: '基础套件', cat: '摄影配件', unit: '套', type: 'equipment', bottom: 0, quote: 0, approved: 0, stock: null, note: '基础套件（如需计价请改价）', supplier: '自定义', group: '自定义', src: '自定义' };
        state.catalog.push(bk);
      }
      pushFrom(bk, 1);
    }
    pushFrom(pick(v('battery')), M.num(v('batteryQty')));
    pushFrom(pick(v('card')), M.num(v('cardQty')));
    [1, 2, 3, 4, 5].forEach(function (i) { pushFrom(pick(v('lens' + i)), 1); });
    [1, 2, 3, 4, 5].forEach(function (i) { pushFrom(pick(v('filter' + i)), 1); });
    if (chk('matte')) {
      var matte = state.catalog.filter(function (e) { return /遮光斗|Matte/i.test(e.name); })[0];
      pushFrom(matte, 1);
    }
    if (v('ff') === '__auto__') {
      var auto = state.catalog.filter(function (e) { return /无线跟焦|WCU|Focus Pro/i.test(e.name) && e.type !== 'crew'; })[0];
      pushFrom(auto, 1);
    } else if (v('ff') === '__manual__') {
      var manual = state.catalog.filter(function (e) { return /双边跟焦|手动跟焦|铁头.*跟焦/i.test(e.name); })[0];
      pushFrom(manual, 1);
    }
    pushFrom(pick(v('monitor')), 1);
    pushFrom(pick(v('vtx')), 1);
    if (chk('tc')) {
      var tc = state.catalog.filter(function (e) { return /时间码|时码|同步器/i.test(e.name); })[0];
      pushFrom(tc, 1);
    }
    pushFrom(pick(v('support')), 1);
    pushFrom(pick(v('assistant')), M.num(v('assistantQty')));
    pushFrom(pick(v('tech')), M.num(v('techQty')));
    // 同一器材合并数量
    var merged = {};
    items.forEach(function (it) {
      var k = M.normalizeName(it.name);
      if (merged[k]) merged[k].qty += it.qty;
      else merged[k] = it;
    });
    kit.items = Object.keys(merged).map(function (k) { return merged[k]; });
    commit(); render();
    toast('已按快速配置生成 ' + kit.items.length + ' 项', 'ok');
  }

  function kitNew(cat) {
    var name = prompt('新组合名称，例如「A1机 · 斯坦尼康」：', '新组合 ' + ((state.kits || []).length + 1));
    if (!name) return;
    var kit = { id: uid('kit'), name: name.trim(), note: '日常组合', cat: cat || '摄影器材', items: [] };
    state.kits.push(kit); state.ui.editingKit = kit.id; commit(); render();
  }
  function kitEdit(id) { state.ui.editingKit = id; commit(); render(); }
  function kitDup(id) {
    var k = kitById(id); if (!k) return;
    var c = clone(k); c.id = uid('kit'); c.name = k.name + '（副本）';
    state.kits.push(c); commit(); render(); toast('已复制组合', 'ok');
  }
  function kitDel(id) {
    var k = kitById(id); if (!k) return;
    if (!confirm('删除组合「' + k.name + '」？')) return;
    state.kits = state.kits.filter(function (x) { return x.id !== id; });
    if (state.ui.editingKit === id) state.ui.editingKit = null;
    commit(); render(); toast('已删除组合');
  }
  function saveGroupAsKit(gid) {
    var g = groupById(gid); if (!g) return;
    var name = prompt('把「' + g.name + '」存为组合，组合名称：', g.name);
    if (!name) return;
    var kit = {
      id: uid('kit'), name: name.trim(), note: '来自项目 ' + (state.project.name || ''),
      items: g.items.map(function (it) { return { name: it.name, unit: it.unit || '个', type: it.type || 'equipment', cat: it.cat || '其他', qty: M.num(it.qty) }; })
    };
    if (g.pkg) { kit.pkgQuote = M.num(g.pkgQuote); kit.pkgBottom = M.num(g.pkgBottom); kit.pkgApproved = M.num(g.pkgApproved); kit.pkgQty = g.pkgQty || 1; }
    state.kits.push(kit); commit();
    toast('已存为组合「' + kit.name + '」，去「器材组合」可以继续改', 'ok');
  }
  function kitDelItem(kid, idx) {
    var k = kitById(kid); if (!k) return;
    k.items.splice(idx, 1); commit(); render();
  }
  /* ---------------- 事件 ---------------- */
  view.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (t) { handleAct(t.dataset.act, t); return; }
    var row = e.target.closest('tr.pick-row');
    if (row) {
      var cb = row.querySelector('[data-pick-check]');
      if (e.target === cb) { row.classList.toggle('selected', cb.checked); pickerCount(); return; }
      cb.checked = !cb.checked; row.classList.toggle('selected', cb.checked); pickerCount();
    }
  });
  view.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.pfield) { onProjectField(t); return; }
    if (t.dataset.gfield) { var g = groupById(t.dataset.gid); if (g) { g.name = t.value; commit(); } return; }
    if (t.dataset.ifield) { onItemField(t); return; }
    if (t.dataset.pifield) { onProfitItemField(t); return; }
    if (t.dataset.obkey) { onOutboundField(t); return; }
    if (t.dataset.kitfield) {
      var kit = kitById(t.dataset.kid);
      if (kit) {
        var kf = t.dataset.kitfield;
        kit[kf] = kf.indexOf('pkg') === 0 ? M.num(t.value) : t.value;
        commit();
      }
      return;
    }
    if (t.dataset.kitemfield) {
      var kit2 = kitById(state.ui.editingKit); if (!kit2) return;
      var idx = +t.dataset.kidx;
      if (!kit2.items[idx]) return;
      kit2.items[idx][t.dataset.kitemfield] = t.dataset.kitemfield === 'qty' ? Math.max(1, M.int(t.value, 1)) : t.value;
      commit(); return;
    }
    if (t.dataset.otfield) { onOtField(t); return; }
    if (t.dataset.exfield) { onExField(t); return; }
    if (t.dataset.gpfield) {
      var gg = groupById(t.dataset.gid); if (gg) { gg[t.dataset.gpfield] = M.num(t.value); commit(); updateOrderDOM(); if (state.ui.tab === 'profit') updateProfitDOM(); }
      return;
    }
    if (t.dataset.efield) { onCatalogField(t); return; }
    if (t.dataset.search === 'catalog') { applyCatalogFilter(); return; }
    if (t.dataset.search === 'picker') { var chip = $('#modal-root .chip.active'); pickerFilter(t.value.trim().toLowerCase(), chip ? chip.dataset.pcat : ''); return; }
    if (t.dataset.sfield) {
      var k = t.dataset.sfield;
      state.settings[k] = (k === 'taxRate' || k === 'markupRate' || k === 'cutRate' || k === 'rebateRate') ? M.num(t.value) : t.value;
      commit(); return;
    }
  });
  view.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.catFilter !== undefined || t.dataset.typeFilter !== undefined || t.dataset.supFilter !== undefined || t.dataset.groupFilter !== undefined || t.dataset.majorFilter !== undefined) { applyCatalogFilter(); }
    if (t.dataset.kitCheck) { var card = t.closest('.kit-card'); if (card) card.classList.toggle('selected', t.checked); }
    if (t.dataset.kitcat) { var kk = kitById(t.dataset.kitcat); if (kk) { kk.cat = t.value; commit(); render(); } }
    if (t.dataset.gpkg) { toggleGroupPkg(t.dataset.gpkg, t.checked); }
  });
  $('#modal-root').addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (t) { handleModalAct(t.dataset.act, t); return; }
    var chip = e.target.closest('.chip[data-pcat]');
    if (chip) {
      $$('#modal-root .chip').forEach(function (c) { c.classList.toggle('active', c === chip); });
      var q = (($('#modal-root [data-search="picker"]') || {}).value || '').trim().toLowerCase();
      pickerFilter(q, chip.dataset.pcat); return;
    }
    var row = e.target.closest('tr.pick-row');
    if (row) {
      var cb = row.querySelector('[data-pick-check]');
      if (e.target === cb) { row.classList.toggle('selected', cb.checked); pickerCount(); return; }
      cb.checked = !cb.checked; row.classList.toggle('selected', cb.checked); pickerCount();
    }
  });
  $('#modal-root').addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.kitPick) updateKitPickCount();
    if (t.id === 'smart-file' && t.files && t.files[0]) { smartReadFile(t.files[0]); t.value = ''; }
    if (t.id === 'smart-price-mode' && smartImport) { smartImport.mode = t.value; smartRenderPreview(); }
  });
  $('#modal-root').addEventListener('dragover', function (e) {
    if ($('#smart-drop')) { e.preventDefault(); $('#smart-drop').style.borderColor = 'var(--brand, #2f6f4f)'; }
  });
  $('#modal-root').addEventListener('drop', function (e) {
    if (!$('#smart-drop')) return;
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) smartReadFile(f);
  });
  $('#modal-root').addEventListener('input', function (e) {
    if (e.target.id === 'sup-link-name') {
      state.ui.supplierName = e.target.value;
      var linkEl = $('#sup-link'); if (linkEl) linkEl.value = supplierLink();
    }
    if (e.target.id === 'ca-start' || e.target.id === 'ca-rate') {
      var st = (($('#ca-start') || {}).value === '' ? null : M.num(($('#ca-start') || {}).value));
      var rt = (($('#ca-rate') || {}).value === '' ? null : M.num(($('#ca-rate') || {}).value));
      var el = $('#ca-ot-preview');
      if (el) el.textContent = (st !== null && rt !== null) ? overtimeText(st, rt, '小时') : (st !== null ? '加班费' + st + '小时开始算加班费（费用待填）' : (rt !== null ? '加班费按 ' + rt + ' 元/小时（起算时间待填）' : '不填加班时间和费用则使用默认标准。'));
    }
    if (e.target.dataset.search === 'picker') {
      var chip = $('#modal-root .chip.active');
      pickerFilter(e.target.value.trim().toLowerCase(), chip ? chip.dataset.pcat : '');
    }
  });

  function onProjectField(t) {
    var k = t.dataset.pfield, v = t.value;
    if (k === 'days') {
      state.project.days = Math.max(1, M.int(v, 1));
      state.ui.tab === 'profit' ? updateProfitDOM() : updateOrderDOM();
      commit(); return;
    }
    if (k === 'taxRatePct') { state.project.taxRate = M.num(v) / 100; if (state.ui.tab === 'order') updateOrderDOM(); commit(); return; }
    if (k === 'markupPct') { state.project.markupRate = M.num(v) / 100; commit(); return; }
    if (k === 'cutPct') { state.project.cutRate = M.num(v) / 100; commit(); return; }
    if (k === 'rebatePct') { state.project.rebateRate = M.num(v) / 100; if (state.ui.tab === 'profit') updateProfitDOM(); commit(); return; }
    state.project[k] = v;
    commit();
  }
  function onItemField(t) {
    var tr = t.closest('tr'); if (!tr) return;
    var g = groupById(tr.dataset.gid); if (!g) return;
    var it = itemById(g, tr.dataset.iid); if (!it) return;
    var k = t.dataset.ifield;
    it[k] = t.value;
    if (k === 'quote') {
      if (it.type !== 'crew' && !it.approvedManual) it.approved = M.round2(M.num(it.quote) * (1 - M.num(state.project.cutRate)));
      updateOrderDOM();
    } else if (k === 'qty') { updateOrderDOM(); updateIssues(); }
    else if (k === 'name') updateIssues();
    commit();
  }
  function onProfitItemField(t) {
    var tr = t.closest('tr[data-drow]'); if (!tr) return;
    var parts = tr.dataset.drow.split('|');
    var g = groupById(parts[0]); if (!g) return;
    var it = itemById(g, parts[1]); if (!it) return;
    if (t.dataset.pifield === 'bottom') {
      it.bottom = M.num(t.value);
      if (it.type === 'crew') {
        // 人员：底价单独改，不联动报价/核价
      } else {
        it.quote = M.round2(it.bottom * (1 + M.num(state.project.markupRate)));
        it.approved = M.round2(it.quote * (1 - M.num(state.project.cutRate)));
        it.approvedManual = false;
      }
    } else {
      it.approved = M.num(t.value);
      it.approvedManual = true;
    }
    updateProfitDOM(t);
    commit();
  }
  function onOutboundField(t) {
    var ob = state.project.outbound = state.project.outbound || {};
    ob[t.dataset.obkey] = t.value;
    var d = $('[data-obdiff="' + t.dataset.obkey + '"]');
    if (d) {
      var line = M.outbound(state.project).lines.filter(function (l) { return l.key === t.dataset.obkey; })[0];
      if (line) {
        var diff = t.value === '' ? '' : M.round2(M.num(t.value) - line.qty);
        d.textContent = diff === '' ? '' : diff;
        var low = t.value !== '' && M.num(t.value) < line.qty;
        d.style.color = low ? 'var(--red)' : ''; d.style.fontWeight = low ? '700' : '';
      }
    }
    commit();
  }
  function onCatalogField(t) {
    var tr = t.closest('tr'); if (!tr) return;
    var e = state.catalog.filter(function (x) { return x.id === tr.dataset.eid; })[0]; if (!e) return;
    var k = t.dataset.efield;
    if (k === 'stock') { e.stock = t.value === '' ? null : M.num(t.value); }
    else if (e.type === 'crew') {
      // 人员：底价/报价/核价完全手动，互不联动；加班费标准只在资料卡里改，不自动覆盖项目
      if (k === 'bottom' || k === 'quote' || k === 'approved') e[k] = M.num(t.value);
      else if (k === 'note') { e.note = t.value; }
      else if (k === 'name') { var on = e.name; e.name = t.value; tr.dataset.name = t.value; propagateRename(on, e.name); }
      else { e[k] = t.value; }
      commit(); return;
    }
    else if (k === 'bottom') {
      e.bottom = M.num(t.value);
      e.quote = M.round2(e.bottom * (1 + M.num(state.project.markupRate)));
      e.approved = M.round2(e.quote * (1 - M.num(state.project.cutRate)));
      tr.querySelector('[data-efield="quote"]').value = e.quote;
      tr.querySelector('[data-efield="approved"]').value = e.approved;
    } else if (k === 'quote') {
      e.quote = M.num(t.value);
      e.approved = M.round2(e.quote * (1 - M.num(state.project.cutRate)));
      tr.querySelector('[data-efield="approved"]').value = e.approved;
    } else if (k === 'approved') { e.approved = M.num(t.value); }
    else if (k === 'note') {
      e.note = t.value;
      if (e.type === 'crew') propagateCrewNote(e.name, e.note);
    }
    else if (k === 'name') {
      var oldName = e.name; e.name = t.value; tr.dataset.name = t.value;
      if (!e.catManual) e.cat = M.classifyName(e.name, e.type);
      propagateRename(oldName, e.name);
    }
    else if (k === 'cat') { e.cat = t.value; e.catManual = true; tr.dataset.cat = t.value; }
    else { e[k] = t.value; }
    commit();
  }

  /* ---------------- 动作 ---------------- */
  function handleAct(act, el) {
    switch (act) {
      case 'go-order': setTab('order'); break;
      case 'add-group': addGroup(); break;
      case 'del-group': delGroup(el.dataset.gid); break;
      case 'add-item': openPicker(el.dataset.gid); break;
      case 'del-item': delItem(el.dataset.gid, el.dataset.iid); break;
      case 'open-kits': openKitsPicker(); break;
      case 'go-kits': setTab('kits'); break;
      case 'kits-back': state.ui.editingKit = null; commit(); render(); break;
      case 'save-kit': saveGroupAsKit(el.dataset.gid); break;
      case 'kit-new': kitNew(el.dataset.cat || '摄影器材'); break;
      case 'kit-filter': state.ui.kitCat = el.dataset.cat; commit(); render(); break;
      case 'kit-light-build': lightingQuickBuild(el.dataset.kid); break;
      case 'kit-edit': kitEdit(el.dataset.kid); break;
      case 'kit-dup': kitDup(el.dataset.kid); break;
      case 'kit-del': kitDel(el.dataset.kid); break;
      case 'kit-add': addKitsToProject([el.dataset.kid]); break;
      case 'kits-add-selected': addKitsToProject($$('#view input[data-kit-check]').filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.kitCheck; })); break;
      case 'kit-add-item': openPicker({ kitId: el.dataset.kid }); break;
      case 'kit-quick-build': kitQuickBuild(el.dataset.kid); break;
      case 'kit-del-item': kitDelItem(el.dataset.kid, +el.dataset.kidx); break;
      case 'recalc': recalc(); break;
      case 'sync-prices': syncPrices(); break;
      case 'save': saveProject(); break;
      case 'new': newProject(); break;
      case 'export-quote': exportQuote(); break;
      case 'export-combined': exportCombined(); break;
      case 'export-approved': exportApproved(); break;
      case 'export-profit': exportProfit(); break;
      case 'print-quote': EX.printQuote(state.project, state.settings); break;
      case 'export-outbound': exportOutbound(); break;
      case 'print-outbound': EX.printOutbound(state.project); break;
      case 'catalog-add': addCatalog(); break;
      case 'crew-add': openCrewAdd(); break;
      case 'crew-add-save': saveCrewAdd(); break;
      case 'catalog-mode': state.ui.catalogMode = el.dataset.mode; commit(); render(); break;
      case 'catalog-major': state.ui.catalogMajor = el.dataset.major || ''; commit(); render(); break;
      case 'supplier-open': openSupplierModal(); break;
      case 'auto-cat': autoCategorize(false); break;
      case 'cat-health': openCatalogHealth(); break;
      case 'ot-add': addOtRow(); break;
      case 'ot-del': delOtRow(el.dataset.id); break;
      case 'ot-from-crew': otFromCrew(); break;
      case 'ot-export': exportOvertime(); break;
      case 'checkin-link': openCheckinModal(); break;
      case 'proj-view': state.ui.tab = 'order'; state.ui.projView = el.dataset.view; render(); break;
      case 'lock-profit': lockProfit(); break;
      case 'lock-settings': lockSettings(); break;
      case 'share-links': openShareLinks(); break;
      case 'ex-add': addExRow(); break;
      case 'ex-del': delExRow(el.dataset.id); break;
      case 'ex-from-crew': exFromCrew(); break;
      case 'ex-export': exportExpenses(); break;
      case 'expense-link': openExpenseModal(); break;
      case 'summary-scope': state.ui.summaryScope = el.dataset.scope; commit(); render(); break;
      case 'imp-checkin': importCheckin(); break;
      case 'imp-expense': importExpense(); break;
      case 'summary-export': exportSummary(); break;
      case 'catalog-star': toggleCatalogStar(el.dataset.eid); break;
      case 'profit-star': toggleCatalogStar(el.dataset.eid); render(); break;
      case 'crew-card': openCrewCard(el.dataset.eid); break;
      case 'catalog-lock': toggleCatalogLock(el.dataset.eid); break;
      case 'crew-star-filter': state.ui.starOnly = !state.ui.starOnly; commit(); render(); break;
      case 'catalog-del': delCatalog(el.dataset.eid); break;
      case 'catalog-export': downloadText(JSON.stringify(state.catalog, null, 2), '器材库_' + today() + '.json'); break;
      case 'catalog-smart-import': openSmartImport(); break;
      case 'smart-pick': smartPickFile(); break;
      case 'catalog-import': importFile(function (json) {
        if (!Array.isArray(json)) throw new Error('格式不对');
        state.catalog = json.map(function (e) { e.id = e.id || uid('eq'); return e; });
        commit(); render(); toast('已导入 ' + state.catalog.length + ' 项器材', 'ok');
      }); break;
      case 'history-settle': state.ui.settleId = el.dataset.pid; state.ui.settleView = 'overtime'; state.ui.tab = 'history'; render(); break;
      case 'settle-view': state.ui.settleView = el.dataset.view; render(); break;
      case 'settle-back': state.ui.settleId = null; state.ui.settleView = null; render(); break;
      case 'history-load': loadProject(el.dataset.pid); break;
      case 'history-dup': dupProject(el.dataset.pid); break;
      case 'history-del': delProject(el.dataset.pid); break;
      case 'export-all': exportAll(); break;
      case 'import-all': importAll(); break;
      case 'clear-all': clearAll(); break;
      case 'clear-projects': clearProjectsOnly(); break;
      case 'modal-close': closeModal(); break;
    }
  }
  function handleModalAct(act, el) {
    switch (act) {
      case 'modal-close': closeModal(); break;
      case 'picker-add': pickerAdd(); break;
      case 'picker-custom': pickerCustom(); break;
      case 'kits-add': kitsAddFromModal(); break;
      case 'crew-add-save': saveCrewAdd(); break;
      case 'crew-card-save': saveCrewCard(el.dataset.eid); break;
      case 'profit-pin-ok': checkProfitPin(); break;
      case 'smart-import-confirm': smartConfirmImport(); break;
      case 'supplier-copy': copyText(supplierLink(), function (ok) { toast(ok ? '已复制填报链接' : '复制失败，请手动选中复制', ok ? 'ok' : 'err'); }); break;
      case 'supplier-open-link': window.open(supplierLink(), '_blank', 'noopener'); break;
      case 'supplier-refresh': supplierFetchSubs(); break;
      case 'supplier-import': supplierImport(el.dataset.id); break;
      case 'supplier-del-sub': supplierDelete(el.dataset.id); break;
      case 'share-copy': (function () {
        var u = window.__shareUrls || {}, t = el.dataset.target;
        var txt = t === 'checkin' ? u.checkin : (t === 'expense' ? u.expense : ('打卡/报销：' + u.checkin + '\n报销直达：' + u.expense));
        copyText(txt, function (ok) { toast(ok ? '已复制链接' : '复制失败，请手动选中复制', ok ? 'ok' : 'err'); });
      })(); break;
      case 'share-native': (function () {
        var u = window.__shareUrls || {};
        if (navigator.share) {
          navigator.share({ title: '现场上传链接 · ' + (scopeProject().name || ''), text: '打卡/报销链接：\n' + u.checkin + '\n报销直达：' + u.expense }).catch(function () {});
        } else {
          copyText(u.checkin, function (ok) { toast(ok ? '已复制链接' : '复制失败', ok ? 'ok' : 'err'); });
        }
      })(); break;
    }
  }

  /* ---------------- 项目操作 ---------------- */
  function addGroup() { state.project.groups.push({ id: uid('g'), name: '机位组 ' + (state.project.groups.length + 1), items: [] }); commit(); render(); }
  function delGroup(gid) {
    var g = groupById(gid); if (!g) return;
    if (!confirm('删除机位组「' + g.name + '」？（组内 ' + g.items.length + ' 行会一起删除）')) return;
    state.project.groups = state.project.groups.filter(function (x) { return x.id !== gid; });
    commit(); render();
  }
  function delItem(gid, iid) {
    var g = groupById(gid); if (!g) return;
    var it = itemById(g, iid);
    if (it && !confirm('删除「' + it.name + '」？')) return;
    g.items = g.items.filter(function (x) { return x.id !== iid; });
    commit(); render();
  }
  function recalc() {
    var p = state.project;
    if (!confirm('按当前默认比例重算全部行？\n底价 × (1+' + pct(M.num(p.markupRate)) + ') = 报价，报价 × (1−' + pct(M.num(p.cutRate)) + ') = 核价。\n（会覆盖手工改过的报价/核价）')) return;
    p.groups.forEach(function (g) { g.items.forEach(function (it) { M.derivePrices(it, p); it.approvedManual = false; }); });
    commit(); render(); toast('已按默认比例重算', 'ok');
  }
  function syncPrices() {
    var n = 0, skipped = 0;
    state.project.groups.forEach(function (g) {
      g.items.forEach(function (it) {
        var ce = catalogByName(it.name); if (!ce) return;
        var differs = M.num(ce.bottom) !== M.num(it.bottom) || M.num(ce.quote) !== M.num(it.quote) || M.num(ce.approved) !== M.num(it.approved);
        if (!differs) return;
        if (ce.lock) { skipped += 1; return; }
        it.bottom = ce.bottom; it.quote = ce.quote; it.approved = ce.approved;
        it.eqId = ce.id; it.approvedManual = false; n += 1;
      });
    });
    commit(); render();
    var msg = n ? '已更新 ' + n + ' 行价格为器材库价格' : '所有价格已与器材库一致';
    if (skipped) msg += '；' + skipped + ' 行因价格锁定跳过';
    toast(msg, n ? 'ok' : '');
  }
  function saveProject() {
    var p = state.project;
    p.updatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    var idx = -1;
    state.projects.forEach(function (x, i) { if (x.id === p.id) idx = i; });
    if (idx >= 0) state.projects[idx] = clone(p); else state.projects.push(clone(p));
    commit(); toast('已保存到历史项目', 'ok');
    if (state.ui.tab === 'history') render();
  }
  function emptyProject() {
    return ensureIds({
      id: uid('p'), no: ((state && state.settings && state.settings.noPrefix) || 'BJ') + '-' + today().replace(/-/g, ''), name: '新建项目',
      client: '', location: '', shootDate: today(), days: 1, taxRate: M.num((state && state.settings ? state.settings.taxRate : 1)) / 100,
      markupRate: M.num((state && state.settings ? state.settings.markupRate : 30)) / 100,
      cutRate: M.num((state && state.settings ? state.settings.cutRate : 20)) / 100,
      rebateRate: M.num((state && state.settings ? state.settings.rebateRate : 5)) / 100,
      remark: '', groups: [{ id: uid('g'), name: '机位组 1', items: [] }], outbound: {}
    });
  }
  function newProject() {
    if (!confirm('新建空白项目？当前项目如果没保存会丢失（可以先点「保存」）。')) return;
    state.project = emptyProject();
    commit(); setTab('order'); toast('已新建空白项目');
  }
  function loadProject(pid) {
    var p = state.projects.filter(function (x) { return x.id === pid; })[0]; if (!p) return;
    state.project = ensureIds(clone(p));
    commit(); setTab('order'); toast('已载入「' + (p.name || '项目') + '」', 'ok');
  }
  function dupProject(pid) {
    var p = state.projects.filter(function (x) { return x.id === pid; })[0]; if (!p) return;
    var c = ensureIds(clone(p));
    c.id = uid('p'); c.name = (p.name || '项目') + '（副本）'; c.updatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    state.projects.push(c); commit(); render(); toast('已复制为新项目', 'ok');
  }
  function delProject(pid) {
    var p = state.projects.filter(function (x) { return x.id === pid; })[0];
    if (!p || !confirm('删除历史项目「' + (p.name || '') + '」？')) return;
    state.projects = state.projects.filter(function (x) { return x.id !== pid; });
    commit(); render(); toast('已删除');
  }


  /* ---------------- 弹窗操作 ---------------- */
  function pickerAdd() {
    var target = state.ui.pickerTarget || {};
    var picked = $$('#modal-root tr.pick-row').filter(function (tr) { var cb = tr.querySelector('[data-pick-check]'); return cb && cb.checked; });
    if (!picked.length) { toast('还没有勾选器材', 'warn'); return; }
    if (target.kitId) {
      var kit = kitById(target.kitId);
      if (!kit) { closeModal(); return; }
      picked.forEach(function (tr) {
        var ce = state.catalog.filter(function (x) { return x.id === tr.dataset.pickEqid; })[0];
        if (!ce) return;
        kit.items.push({ name: ce.name, unit: ce.unit || '个', type: ce.type || 'equipment', cat: ce.cat || '其他', qty: 1 });
      });
      closeModal(); commit(); render(); toast('已添加 ' + picked.length + ' 项到组合', 'ok');
      return;
    }
    var g = groupById(target.gid); if (!g) { closeModal(); return; }
    picked.forEach(function (tr) {
      var ce = state.catalog.filter(function (x) { return x.id === tr.dataset.pickEqid; })[0];
      if (!ce) return;
      g.items.push({
        id: uid('l'), eqId: ce.id, name: ce.name, unit: ce.unit || '个', type: ce.type || 'equipment',
        cat: ce.cat || '其他', qty: 1, bottom: ce.bottom, quote: ce.quote, approved: ce.approved,
        approvedManual: false, note: ce.note || ((ce.type === 'crew') ? ruleForCrew(ce.name) : '')
      });
    });
    closeModal(); commit(); render(); toast('已添加 ' + picked.length + ' 项', 'ok');
  }
  function pickerCustom() {
    var target = state.ui.pickerTarget || {};
    var name = $('#modal-root [data-custom="name"]').value.trim();
    if (!name) { toast('请先填名称', 'warn'); return; }
    var type = $('#modal-root [data-custom="type"]').value;
    var unit = $('#modal-root [data-custom="unit"]').value.trim() || (type === 'crew' ? '人' : '个');
    var bottomIn = M.num($('#modal-root [data-custom="bottom"]').value);
    var quote = M.num($('#modal-root [data-custom="quote"]').value);
    var approvedIn = M.num($('#modal-root [data-custom="approved"]').value);
    var bottom = bottomIn > 0 ? bottomIn : M.round2(quote / (1 + M.num(state.project.markupRate)));
    var approved = approvedIn > 0 ? approvedIn : M.round2(quote * (1 - M.num(state.project.cutRate)));
    var ce = state.catalog.filter(function (x) { return M.normalizeName(x.name) === M.normalizeName(name); })[0];
    if (!ce) {
      ce = {
        id: uid('eq'), key: M.normalizeName(name), name: name, cat: type === 'crew' ? '人员' : M.classifyName(name, 'equipment'), unit: unit, type: type,
        bottom: bottom, quote: quote, approved: approved,
        stock: null, note: type === 'crew' ? ruleForCrew(name) : ''
      };
      state.catalog.push(ce);
    }
    if (target.kitId) {
      var kit = kitById(target.kitId); if (!kit) { closeModal(); return; }
      kit.items.push({ name: ce.name, unit: unit, type: type, cat: ce.cat, qty: 1 });
      closeModal(); commit(); render(); toast('已新增并加入组合', 'ok');
      return;
    }
    var g = groupById(target.gid); if (!g) { closeModal(); return; }
    g.items.push({ id: uid('l'), eqId: ce.id, name: ce.name, unit: unit, type: type, cat: ce.cat, qty: 1, bottom: ce.bottom, quote: ce.quote, approved: ce.approved, approvedManual: false, note: (type === 'crew') ? ruleForCrew(ce.name) : '' });
    closeModal(); commit(); render(); toast('已新增并添加到机位组', 'ok');
  }
  function kitsAddFromModal() {
    var ids = $$('#modal-root input[data-kit-pick]').filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.kitPick; });
    if (!ids.length) { toast('还没有勾选组合', 'warn'); return; }
    closeModal();
    addKitsToProject(ids);
  }
  /* ---------------- 导入导出 ---------------- */
  function importFile(cb) {
    var input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = function () {
      var f = input.files && input.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try { cb(JSON.parse(reader.result)); } catch (err) { toast('导入失败：' + err.message, 'err'); }
      };
      reader.readAsText(f, 'utf-8');
    };
    input.click();
  }
  function exportAll() {
    var all = { app: 'equip-quote', version: 3, exportedAt: new Date().toISOString(), catalog: state.catalog, kits: state.kits, projects: state.projects, project: state.project, settings: state.settings };
    downloadText(JSON.stringify(all, null, 2), '器材报价系统_备份_' + today() + '.json');
    toast('已导出备份文件', 'ok');
  }
  function importAll() {
    importFile(function (data) {
      if (!data || data.app !== 'equip-quote') throw new Error('不是本系统的备份文件');
      if (!confirm('导入会覆盖当前器材库、历史项目和设置，确定继续？')) return;
      if (Array.isArray(data.catalog)) state.catalog = data.catalog;
      if (Array.isArray(data.kits)) state.kits = data.kits;
      if (Array.isArray(data.projects)) state.projects = data.projects;
      if (data.project) state.project = ensureIds(data.project);
      if (data.settings) state.settings = Object.assign(defaultSettings(), data.settings);
      commit(); render(); toast('导入完成', 'ok');
    });
  }
  function clearProjectsOnly() {
    if (!confirm('删除所有项目（当前项目 + 历史项目 + 加班/报销记录）？器材库和器材组合会保留。')) return;
    state.projects = [];
    state.project = emptyProject();
    state.ui.settleId = null; state.ui.settleView = null;
    commit(); setTab('order'); render();
    toast('已清空所有项目，器材库和组合已保留', 'ok');
  }
  function clearAll() {
    if (!confirm('清空本机所有数据（器材库会恢复为默认，历史项目全部删除）？建议先导出备份。')) return;
    if (!confirm('再确认一次：确定清空？')) return;
    state.catalog = clone(APP.catalog || []);
    state.kits = clone(APP.kits || []);
    state.projects = [];
    state.project = emptyProject();
    state.settings = defaultSettings();
    if (storageOK) { try { localStorage.removeItem(KEY); localStorage.removeItem('eq_quote_v1'); } catch (e) {} }
    commit(); render(); toast('已清空，恢复默认数据');
  }

  /* ---------------- 导出 ---------------- */
  function exportQuote() {
    if (!window.ExcelJS) { toast('Excel 导出组件未加载（vendor/exceljs.min.js）', 'err'); return; }
    try {
      var wb = EX.buildQuoteWorkbook(window.ExcelJS, state.project, state.settings);
      EX.downloadWorkbook(wb, EX.safeName(state.project.name || '报价单') + '_报价单_' + today() + '.xlsx')
        .then(function (f) { toast('已导出报价单：' + f, 'ok'); })
        .catch(function (err) { toast('导出失败：' + err.message, 'err'); });
    } catch (e) { toast('导出失败：' + e.message, 'err'); }
  }
  function exportCombined() {
    if (!window.ExcelJS) { toast('Excel 导出组件未加载', 'err'); return; }
    try {
      var wb = EX.buildCombinedWorkbook(window.ExcelJS, state.project, state.settings);
      EX.downloadWorkbook(wb, EX.safeName(state.project.name || '项目') + '_报价+核价单_' + today() + '.xlsx')
        .then(function (f) { toast('已导出报价+核价单：' + f, 'ok'); })
        .catch(function (err) { toast('导出失败：' + err.message, 'err'); });
    } catch (e) { toast('导出失败：' + e.message, 'err'); }
  }
  function exportApproved() {
    if (!window.ExcelJS) { toast('Excel 导出组件未加载', 'err'); return; }
    try {
      var wb = EX.buildApprovedWorkbook(window.ExcelJS, state.project, state.settings);
      EX.downloadWorkbook(wb, EX.safeName(state.project.name || '核价单') + '_核价单_' + today() + '.xlsx')
        .then(function (f) { toast('已导出核价单：' + f, 'ok'); })
        .catch(function (err) { toast('导出失败：' + err.message, 'err'); });
    } catch (e) { toast('导出失败：' + e.message, 'err'); }
  }
  function exportProfit() {
    if (!window.ExcelJS) { toast('Excel 导出组件未加载', 'err'); return; }
    try {
      var wb = EX.buildProfitWorkbook(window.ExcelJS, state.project, state.settings);
      EX.downloadWorkbook(wb, EX.safeName(state.project.name || '项目') + '_利润测算_内部_' + today() + '.xlsx')
        .then(function (f) { toast('已导出利润测算（内部）：' + f, 'ok'); })
        .catch(function (err) { toast('导出失败：' + err.message, 'err'); });
    } catch (e) { toast('导出失败：' + e.message, 'err'); }
  }
  function exportOutbound() {
    if (!window.ExcelJS) { toast('Excel 导出组件未加载', 'err'); return; }
    try {
      var wb = EX.buildOutboundWorkbook(window.ExcelJS, state.project, state.settings);
      EX.downloadWorkbook(wb, EX.safeName(state.project.name || '项目') + '_出库单_' + today() + '.xlsx')
        .then(function (f) { toast('已导出出库单：' + f, 'ok'); })
        .catch(function (err) { toast('导出失败：' + err.message, 'err'); });
    } catch (e) { toast('导出失败：' + e.message, 'err'); }
  }

  /* ---------------- 顶栏 & 全局 ---------------- */
  $('#tabs').addEventListener('click', function (e) { var b = e.target.closest('.tab'); if (b) setTab(b.dataset.tab); });
  $('#btn-save').addEventListener('click', saveProject);
  $('#btn-new').addEventListener('click', newProject);
  $('#btn-mode').addEventListener('click', function () { setMode(state.ui.mode === 'profit' ? 'order' : 'profit'); });
  $('#btn-export-main').addEventListener('click', function () { state.ui.mode === 'profit' ? exportProfit() : exportQuote(); });
  $('#modal-root').addEventListener('click', function (e) { if (e.target.dataset && e.target.dataset.modalBackdrop !== undefined) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveProject(); }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); setMode(state.ui.mode === 'profit' ? 'order' : 'profit'); }
  });
  window.addEventListener('hashchange', function () {
    var t = location.hash.replace('#', '');
    if (t && HASH_TABS[t] && t !== state.ui.tab) setTab(t);
  });

  function toast(msg, type) {
    var root = $('#toast-root');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () { el.remove(); }, 2400);
  }

  function init() {
    // 迁移：人员标准已清空，旧本地缓存里的人员一并移除（只做一次）
    if (state.settings.catVersion !== 4) {
      autoCategorize(true);
      state.settings.catVersion = 4;
      commit();
    }
    if (state.settings.cleanVersion !== 1) {
      state.projects = [];
      state.project = emptyProject();
      state.ui.settleId = null; state.ui.settleView = null;
      state.settings.cleanVersion = 1;
      commit();
    }
    if (state.settings.crewCleared !== true) {
      var hadCrew = state.catalog.some(function (e) { return e.type === 'crew'; });
      state.catalog = state.catalog.filter(function (e) { return e.type !== 'crew'; });
      state.settings.crewCleared = true;
      if (hadCrew) commit();
    }
    var t = location.hash.replace('#', '');
    if (t === 'overtime' || t === 'expenses' || t === 'stats') { state.ui.tab = 'order'; state.ui.projView = t; t = 'order'; }
    if (!HASH_TABS[t]) t = 'order';
    state.ui.tab = t;
    if ((t === 'profit' || t === 'settings') && state.settings.profitPin && !state.ui.profitUnlocked) {
      state.ui.pinTarget = t;
      state.ui.tab = 'order';
      setTimeout(openProfitPin, 100);
    }
    state.ui.mode = PROFIT_TABS[t] ? 'profit' : 'order';
    $('#storage-status').textContent = storageOK
      ? '本机存储：可用（数据只保存在这台电脑）'
      : '本机存储不可用：请用「设置 → 导出全部数据」备份';
    var supCount = {}; state.catalog.forEach(function (e) { var x = supOf(e); supCount[x] = (supCount[x] || 0) + 1; });
    $('#meta-status').textContent = '器材库 ' + state.catalog.length + ' 项 · 组合 ' + state.kits.length + ' 组 · 来源：' +
      Object.keys(supCount).map(function (k) { return srcLabel(k) + ' ' + supCount[k]; }).join(' / ');
    setDraftStatus(storageOK ? '就绪' : '');
    render();
  }
  window.addEventListener('hashchange', function () {
    var t = location.hash.replace('#', '');
    if (t === 'overtime' || t === 'expenses' || t === 'stats') { state.ui.tab = 'order'; state.ui.projView = t; }
    else if (HASH_TABS[t]) { state.ui.tab = t; if (t === 'order') state.ui.projView = 'quote'; }
    else return;
    render();
  });
  try { init(); } catch (e) { fatalOverlay('启动失败：' + ((e && (e.stack || e.message)) || e)); }
})();
