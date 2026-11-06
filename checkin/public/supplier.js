(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var sid = q.get('sid') || '';
  var supplierFromLink = q.get('supplier') || q.get('name') || '';
  var rowsEl = document.getElementById('sup-rows');
  var nameEl = document.getElementById('sup-name');
  var countEl = document.getElementById('sup-count');
  var submitted = false;
  if (supplierFromLink) nameEl.value = supplierFromLink;
  else nameEl.focus();

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rowHtml(i) {
    return '<section class="sup-row" data-row>' +
      '<div class="sup-row-head"><strong>器材 ' + (i + 1) + '</strong><button type="button" class="sup-del" data-del>删除</button></div>' +
      '<label class="sup-field span2"><span>器材名称 *</span><input data-f="name" placeholder="例如：Sony FX6 摄影机机身" autocomplete="off"></label>' +
      '<label class="sup-field"><span>大类 *</span><select data-f="major"><option>摄影器材</option><option>灯光器材</option></select></label>' +
      '<label class="sup-field"><span>型号</span><input data-f="model" placeholder="例如：FX6" autocomplete="off"></label>' +
      '<label class="sup-field"><span>单位</span><input data-f="unit" value="个" autocomplete="off"></label>' +
      '<label class="sup-field"><span>底价（元）*</span><input data-f="bottom" type="number" min="0" step="0.01" inputmode="decimal" placeholder="真实供货价"></label>' +
      '<label class="sup-field"><span>库存 / 数量</span><input data-f="stock" type="number" min="0" step="1" inputmode="numeric" placeholder="可不填"></label>' +
      '<label class="sup-field span2"><span>备注</span><input data-f="note" placeholder="如：含箱、需另配电池" autocomplete="off"></label>' +
      '</section>';
  }
  function addRow() {
    var wrap = document.createElement('div');
    wrap.innerHTML = rowHtml(rowsEl.querySelectorAll('[data-row]').length);
    rowsEl.appendChild(wrap.firstChild);
    updateCount();
  }
  function updateCount() { countEl.textContent = '已填 ' + rowsEl.querySelectorAll('[data-row]').length + ' 项'; }
  rowsEl.addEventListener('click', function (e) {
    var del = e.target.closest('[data-del]');
    if (del) {
      var row = del.closest('[data-row]');
      if (rowsEl.querySelectorAll('[data-row]').length <= 1) { alert('至少保留一项'); return; }
      row.remove(); updateCount();
    }
  });
  document.getElementById('sup-add').addEventListener('click', addRow);
  function collect() {
    var rows = [].map.call(rowsEl.querySelectorAll('[data-row]'), function (row) {
      function v(k) { var el = row.querySelector('[data-f="' + k + '"]'); return el ? el.value.trim() : ''; }
      return { name: v('name'), major: v('major'), model: v('model'), unit: v('unit') || '个', bottom: v('bottom'), stock: v('stock'), note: v('note') };
    }).filter(function (r) { return r.name; });
    return rows;
  }
  function validate(rows) {
    if (!rows.length) return '请至少填写一项器材名称';
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].name) return '第 ' + (i + 1) + ' 项请填器材名称';
      if (!(Number(rows[i].bottom) > 0)) return '第 ' + (i + 1) + ' 项请填底价（大于 0）';
    }
    return '';
  }
  document.getElementById('sup-submit').addEventListener('click', function () {
    if (submitted) return;
    var supplier = nameEl.value.trim();
    if (!supplier) { nameEl.focus(); alert('请先填供应商名称'); return; }
    var rows = collect();
    var err = validate(rows);
    if (err) { alert(err); return; }
    var btn = document.getElementById('sup-submit');
    btn.disabled = true; btn.textContent = '提交中…';
    fetch('/api/supplier/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: sid, supplier: supplier, rows: rows })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.error || '提交失败');
      submitted = true;
      document.getElementById('sup-success-text').textContent = '共 ' + j.record.rows.length + ' 项器材已提交，赖先生审核后会入库。';
      document.getElementById('sup-success').hidden = false;
    }).catch(function (e) {
      alert(e.message || '提交失败，请重试');
      btn.disabled = false; btn.textContent = '提交给赖先生';
    });
  });
  document.getElementById('sup-again').addEventListener('click', function () {
    submitted = false;
    rowsEl.innerHTML = '';
    addRow();
    document.getElementById('sup-success').hidden = true;
    var btn = document.getElementById('sup-submit');
    btn.disabled = false; btn.textContent = '提交给赖先生';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  addRow();
})();
