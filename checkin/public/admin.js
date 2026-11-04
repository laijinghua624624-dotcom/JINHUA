(function () {
  var all = [], exps = [], meta = null, tab = 'checkin';
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function money(n) { return '¥' + (Number(n) || 0).toFixed(2); }
  function subtotal(e) { return (Number(e.goCost) || 0) + (Number(e.parking) || 0) + (Number(e.toll) || 0) + (Number(e.leaveCost) || 0); }
  function active() { return tab === 'checkin' ? all : exps; }
  function load() {
    Promise.all([
      fetch('/api/meta').then(function (r) { return r.json(); }),
      fetch('/api/submissions').then(function (r) { return r.json(); }),
      fetch('/api/expenses').then(function (r) { return r.json(); })
    ]).then(function (res) {
      meta = res[0]; all = res[1]; exps = res[2];
      $('#title').textContent = (meta.project || '现场管理') + ' · 打卡与报销';
      var dates = {}, depts = {}, projs = {};
      active().forEach(function (s) { dates[s.date] = 1; depts[s.dept] = 1; if (s.jobName) projs[s.jobName] = 1; });
      $('#projFilter').innerHTML = '<option value="">全部项目</option>' + Object.keys(projs).sort().map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
      $('#dateFilter').innerHTML = '<option value="">全部日期</option>' + Object.keys(dates).sort().reverse().map(function (d) { return '<option>' + d + '</option>'; }).join('');
      $('#deptFilter').innerHTML = '<option value="">全部部门</option>' + Object.keys(depts).sort().map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('');
      render();
    });
  }
  function render() {
    var df = $('#dateFilter').value, dp = $('#deptFilter').value, pj = $('#projFilter').value;
    var list = active().filter(function (s) { return (!df || s.date === df) && (!dp || s.dept === dp) && (!pj || s.jobName === pj); });
    var people = {};
    list.forEach(function (s) { people[s.name + '|' + s.dept + '|' + s.role] = 1; });
    var stats = [['记录数', list.length], ['人数', Object.keys(people).length]];
    if (tab === 'checkin') {
      stats.push(['到场', list.filter(function (s) { return s.type !== 'out'; }).length]);
      stats.push(['离场', list.filter(function (s) { return s.type === 'out'; }).length]);
    } else {
      stats.push(['报销合计', money(list.reduce(function (a, s) { return a + subtotal(s); }, 0))]);
      var totalExp = list.reduce(function (a, s) { return a + subtotal(s); }, 0);
      stats.push(['器材运输', money(list.filter(function (s) { return s.type !== 'ride'; }).reduce(function (a, s) { return a + subtotal(s); }, 0))]);
      stats.push(['网约车', money(list.filter(function (s) { return s.type === 'ride'; }).reduce(function (a, s) { return a + subtotal(s); }, 0))]);
      stats.push(['平均每单', money(list.length ? totalExp / list.length : 0)]);
      stats.push(['OCR 识别', list.filter(function (s) { return s.ocr && s.ocr.guess; }).length + ' / ' + list.length]);
    }
    $('#stats').innerHTML = stats.map(function (x) { return '<div class="stat"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + '</div></div>'; }).join('');
    if (tab === 'checkin') return renderCheckin(list);
    return renderExpense(list);
  }
  function renderCheckin(list) {
    var groups = {};
    list.forEach(function (s) {
      var key = (s.jobName || '未指定项目') + '|' + s.date + '|' + s.dept;
      groups[key] = groups[key] || {};
      var pk = s.name + '|' + s.role;
      groups[key][pk] = groups[key][pk] || { name: s.name, role: s.role, inPhoto: null, outPhoto: null, notes: [] };
      var g = groups[key][pk];
      if (s.type === 'out') { if (!g.outPhoto || s.receivedAt > g.outPhoto.receivedAt) g.outPhoto = s; }
      else { if (!g.inPhoto || s.receivedAt > g.inPhoto.receivedAt) g.inPhoto = s; }
      if (s.note) g.notes.push(s.note);
    });
    var html = Object.keys(groups).sort().reverse().map(function (key) {
      var parts = key.split('|'), proj = parts[0], date = parts[1], dept = parts[2];
      var rows = Object.keys(groups[key]).map(function (pk) {
        var g = groups[key][pk];
        function ph(s, label) {
          if (!s) return '<div class="ph"><div class="t">未打卡</div></div>';
          return '<div class="ph" onclick="window.open(\'' + s.photo + '\',\'_blank\')"><img src="/' + s.photo + '"><div class="t"><span class="tag ' + s.type + '">' + label + '</span>' + esc(s.receivedAt) + '</div></div>';
        }
        var delIds = [g.inPhoto, g.outPhoto].filter(Boolean).map(function (x) { return x.id; });
        return '<div class="row"><div class="who"><b>' + esc(g.name) + '</b><div>' + esc(g.role) + '</div></div>' +
          '<div class="shot" style="display:flex;gap:8px">' + ph(g.inPhoto, '到场') + ph(g.outPhoto, '离场') + '</div>' +
          '<div class="note">' + esc(g.notes.join('；')) + '</div>' +
          (delIds.length ? '<button class="mini danger" onclick="delCheckin(\'' + delIds.join(',') + '\')">删除</button>' : '') + '</div>';
      }).join('');
      return '<div class="card"><h3>' + esc(proj) + ' · ' + esc(date) + ' · ' + esc(dept) + '（' + Object.keys(groups[key]).length + ' 人）</h3>' + rows + '</div>';
    }).join('');
    $('#list').innerHTML = html || '<div class="empty">还没有打卡记录。把打卡链接发到现场群，拍照上传后会出现在这里。</div>';
  }
  function duplicateWarnings(list) {
    var per = {};
    (list || []).forEach(function (e) {
      var names = [e.name].concat(String(e.passengers || '').split(/[,，、;；\s]+/).filter(Boolean));
      names.forEach(function (n) {
        per[e.date] = per[e.date] || {};
        per[e.date][n] = per[e.date][n] || [];
        per[e.date][n].push(e);
      });
    });
    var warns = [];
    Object.keys(per).forEach(function (d) {
      Object.keys(per[d]).forEach(function (n) {
        var arr = per[d][n];
        if (arr.length > 1) warns.push(d + ' · ' + n + ' 出现在 ' + arr.length + ' 条报销里（' + arr.map(function (e) { return e.name + ' ' + money(subtotal(e)); }).join(' / ') + '），请确认是否重复');
      });
    });
    list.forEach(function (e) {
      if (e.ocr && e.ocr.guess && Math.abs(subtotal(e) - e.ocr.guess) > 1) {
        warns.push('OCR 识别金额 ' + money(e.ocr.guess) + ' 与填报小计 ' + money(subtotal(e)) + ' 不一致（' + e.name + '），请核对');
      }
    });
    return warns;
  }
  function renderExpense(list) {
    var warns = duplicateWarnings(list);
    var warnHtml = warns.length ? '<div class="card"><h3>⚠️ 可能重复报销（同一天同一人出现多次）</h3>' + warns.map(function (w) { return '<div class="row" style="color:#b45309;font-size:13px">' + esc(w) + '</div>'; }).join('') + '</div>' : '';
    var groups = {};
    list.forEach(function (s) {
      var key = (s.jobName || '未指定项目') + '|' + s.date + '|' + s.dept;
      groups[key] = groups[key] || {};
      groups[key][s.name + '|' + s.role] = s;
    });
    var html = Object.keys(groups).sort().reverse().map(function (key) {
      var parts = key.split('|'), proj = parts[0], date = parts[1], dept = parts[2];
      var rows = Object.keys(groups[key]).map(function (pk) {
        var e = groups[key][pk];
        return '<div class="row">' +
          '<div class="who"><b>' + esc(e.name) + '</b><div>' + esc(e.role) + ' · <span class="tag ' + (e.type === 'ride' ? 'out' : 'in') + '">' + (e.type === 'ride' ? '网约车' : '器材运输') + '</span></div></div>' +
          '<div class="ph" onclick="window.open(\'' + e.photo + '\',\'_blank\')"><img src="/' + e.photo + '"><div class="t">票据照片</div></div>' +
          '<div class="fees">前往 ' + money(e.goCost) + '　离开 ' + money(e.leaveCost) + '<br>停车 ' + money(e.parking) + '　过路 ' + money(e.toll) + '<br><b>小计 ' + money(subtotal(e)) + '</b>' + (e.passengers ? '<br>同乘：' + esc(e.passengers) : '') +
          (e.ocr && e.ocr.guess ? '<br><span style="color:#2563eb">OCR 识别 ' + money(e.ocr.guess) + '</span> <button class="mini" onclick="adopt(\'' + e.id + '\',\'goCost\',' + e.ocr.guess + ')">→前往</button> <button class="mini" onclick="adopt(\'' + e.id + '\',\'leaveCost\',' + e.ocr.guess + ')">→离开</button>' : '') + '</div>' +
          '<div class="note">' + esc(e.note || '') + '<br><span style="color:#94a3b8">' + esc(e.receivedAt) + '</span></div>' +
          '<button class="mini danger" onclick="delExpense(\'' + e.id + '\')">删除</button>' +
          '</div>';
      }).join('');
      return '<div class="card"><h3>' + esc(proj) + ' · ' + esc(date) + ' · ' + esc(dept) + '（' + Object.keys(groups[key]).length + ' 人）</h3>' + rows + '</div>';
    }).join('');
    $('#list').innerHTML = warnHtml + (html || '<div class="empty">还没有报销记录。把报销链接发到现场群，填费用、拍票据上传后会出现在这里。</div>');
  }
  $('#tabCheckin').addEventListener('click', function () { tab = 'checkin'; this.classList.add('on'); $('#tabExpense').classList.remove('on'); load(); });
  $('#tabExpense').addEventListener('click', function () { tab = 'expense'; this.classList.add('on'); $('#tabCheckin').classList.remove('on'); load(); });
  window.delCheckin = function (ids) {
    if (!confirm('删除这条打卡记录和照片？')) return;
    fetch('/api/submission/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids.split(',') }) })
      .then(function (r) { return r.json(); }).then(function () { load(); });
  };
  window.delExpense = function (id) {
    if (!confirm('删除这条报销记录和票据照片？')) return;
    fetch('/api/expense/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
      .then(function (r) { return r.json(); }).then(function () { load(); });
  };
  window.adopt = function (id, field, amount) {
    var patch = {}; patch[field] = amount;
    fetch('/api/expense/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, patch: patch }) })
      .then(function (r) { return r.json(); }).then(function () { load(); });
  };
  $('#projFilter').addEventListener('change', render);
  $('#dateFilter').addEventListener('change', render);
  $('#deptFilter').addEventListener('change', render);
  $('#refresh').addEventListener('click', load);
  $('#csv').addEventListener('click', function () { window.open(tab === 'checkin' ? '/api/export.csv' : '/api/expenses/export.csv', '_blank'); });
  $('#formLink').addEventListener('click', function () { fetch('/api/meta').then(function (r) { return r.json(); }).then(function (m) { window.open(tab === 'checkin' ? m.formUrl : m.expenseUrl, '_blank'); }); });
  load();
  setInterval(function () { if (!document.hidden) load(); }, 15000);
})();
