(function () {
  var meta = null, photoData = '', busy = false;
  var Q = new URLSearchParams(location.search);
  var jobId = Q.get('job') || '';
  var jobName = Q.get('p') || '';
  var $ = function (s) { return document.querySelector(s); };
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nowText() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); }
  function money(n) { return '¥' + (Number(n) || 0).toFixed(2); }
  function subtotal() { return ['goCost','parking','toll','leaveCost'].reduce(function (s, id) { return s + (Number($('#' + id).value) || 0); }, 0); }
  function refresh() {
    $('#subtotal').textContent = money(subtotal());
    $('#submitBtn').disabled = !(photoData && $('#name').value.trim() && $('#role').value);
  }
  function loadImage(file) { return new Promise(function (res, rej) { var img = new Image(); img.onload = function () { res(img); }; img.onerror = function () { rej(new Error('图片读取失败')); }; img.src = URL.createObjectURL(file); }); }
  function drawWatermark(img) {
    var max = 1400, w = img.width, h = img.height;
    if (w > max || h > max) { var r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
    var lines = [ (jobName || (meta ? meta.project : '交通费报销')) + ' · 报销票据',
      [$('#dept').value, $('#role').value, $('#name').value.trim()].filter(Boolean).join(' · '),
      '报销 ' + nowText() ];
    var lh = Math.max(22, Math.round(w * 0.026)), pad = Math.round(lh * 0.6), bar = lh * lines.length + pad * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, w, bar);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
    ctx.font = 'bold ' + Math.round(lh * 0.72) + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    lines.forEach(function (t, i) { ctx.fillText(t, pad, pad + i * lh); });
    return c.toDataURL('image/jpeg', 0.82);
  }
  function updateRoles() {
    var dept = $('#dept').value, roles = [];
    (meta.depts || []).forEach(function (d) { if (d.name === dept) roles = d.roles || []; });
    $('#role').innerHTML = roles.map(function (r) { return '<option>' + r + '</option>'; }).join('');
    refresh();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.mtabs a'), function (a) {
    a.href = a.getAttribute('href').split('?')[0] + location.search;
  });
  fetch('/api/meta').then(function (r) { return r.json(); }).then(function (m) {
    meta = m; $('#project').textContent = (jobName || m.project || '交通费报销') + ' · 报销';
    $('#date').value = today();
    $('#dept').innerHTML = (m.depts || []).map(function (d) { return '<option>' + d.name + '</option>'; }).join('');
    updateRoles();
  }).catch(function () {});
  document.querySelectorAll('.type').forEach(function (el) {
    el.addEventListener('click', function () {
      document.querySelectorAll('.type').forEach(function (x) { x.classList.remove('on'); });
      el.classList.add('on'); el.querySelector('input').checked = true;
    });
  });
  $('#dept').addEventListener('change', updateRoles);
  $('#name').addEventListener('input', refresh);
  ['goCost','parking','toll','leaveCost'].forEach(function (id) { $('#' + id).addEventListener('input', refresh); });
  $('#uploadBtn').addEventListener('click', function () { $('#file').click(); });
  $('#shootBtn').addEventListener('click', function () { $('#camera').click(); });
  var lastFile = null;
  function handleFile(file) {
    if (!file) return; lastFile = file;
    loadImage(file).then(function (img) {
      photoData = drawWatermark(img);
      var pv = $('#preview'); pv.src = photoData; pv.style.display = 'block';
      refresh();
    }).catch(function (e) { $('#err').textContent = e.message; });
  }
  $('#file').addEventListener('change', function (e) { handleFile(e.target.files[0]); });
  $('#camera').addEventListener('change', function (e) { handleFile(e.target.files[0]); });
  $('#submitBtn').addEventListener('click', function () {
    if (busy) return;
    if (!$('#name').value.trim()) { $('#err').textContent = '请填写姓名'; return; }
    if (!photoData) { $('#err').textContent = '请先拍票据照片'; return; }
    // 金额可以留空：上传截图后由系统 OCR 自动识别
    busy = true; $('#err').textContent = ''; $('#submitBtn').disabled = true; $('#submitBtn').textContent = '上传中…';
    fetch('/api/expense/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      job: jobId, jobName: jobName,
      date: $('#date').value || today(), dept: $('#dept').value, role: $('#role').value, name: $('#name').value.trim(),
      type: document.querySelector('input[name=etype]:checked').value,
      passengers: $('#passengers').value,
      goCost: Number($('#goCost').value) || 0, parking: Number($('#parking').value) || 0,
      toll: Number($('#toll').value) || 0, leaveCost: Number($('#leaveCost').value) || 0,
      note: $('#note').value, photo: photoData
    }) }).then(function (r) { return r.json(); }).then(function (r) {
      if (!r.ok) throw new Error(r.error || '提交失败');
      $('#formCard').style.display = 'none'; $('#okView').style.display = 'block';
      $('#okInfo').textContent = $('#dept').value + ' · ' + $('#role').value + ' · ' + $('#name').value.trim() + ' · 小计 ' + money(subtotal());
    }).catch(function (e) { $('#err').textContent = e.message; }).then(function () {
      busy = false; $('#submitBtn').textContent = '提交报销'; refresh();
    });
  });
  $('#againBtn').addEventListener('click', function () {
    photoData = ''; lastFile = null; $('#preview').style.display = 'none'; $('#note').value = ''; $('#passengers').value = '';
    ['goCost','parking','toll','leaveCost'].forEach(function (id) { $('#' + id).value = '0'; });
    $('#okView').style.display = 'none'; $('#formCard').style.display = 'block'; refresh();
  });
})();
