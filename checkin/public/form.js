(function () {
  var meta = null, photoData = '', gps = null, busy = false;
  var Q = new URLSearchParams(location.search);
  var jobId = Q.get('job') || '';
  var jobName = Q.get('p') || '';
  var $ = function (s) { return document.querySelector(s); };
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nowText() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); }
  function loadImage(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('图片读取失败')); };
      img.src = URL.createObjectURL(file);
    });
  }
  function drawWatermark(img) {
    var max = 1400, w = img.width, h = img.height;
    if (w > max || h > max) { var r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
    var dept = $('#dept').value, role = $('#role').value, name = $('#name').value.trim();
    var type = document.querySelector('input[name=type]:checked').value === 'out' ? '离场' : '到场';
    var lines = [ (jobName || (meta ? meta.project : '现场打卡')),
      [dept, role, name].filter(Boolean).join(' · '),
      type + '  ' + nowText(),
      gps ? ('定位 ' + gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5) + ' ±' + Math.round(gps.acc) + 'm') : '' ].filter(Boolean);
    var lh = Math.max(22, Math.round(w * 0.026)), pad = Math.round(lh * 0.6), bar = lh * lines.length + pad * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, h - bar, w, bar);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
    ctx.font = 'bold ' + Math.round(lh * 0.72) + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    lines.forEach(function (t, i) { ctx.fillText(t, pad, h - bar + pad + i * lh); });
    return c.toDataURL('image/jpeg', 0.82);
  }
  function refresh() { $('#submitBtn').disabled = !(photoData && $('#name').value.trim() && $('#role').value); }
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
    meta = m; $('#project').textContent = (jobName || m.project || '现场打卡') + ' · 现场打卡';
    $('#date').value = today();
    $('#dept').innerHTML = (m.depts || []).map(function (d) { return '<option>' + d.name + '</option>'; }).join('');
    updateRoles();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (pos) {
        gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy };
        $('#gpsHint').textContent = '定位：已获取（会写进水印）';
      }, function () {}, { timeout: 6000, maximumAge: 60000 });
    }
  }).catch(function () { $('#project').textContent = '现场打卡'; });
  $('#dept').addEventListener('change', updateRoles);
  $('#name').addEventListener('input', refresh);
  document.querySelectorAll('.type').forEach(function (el) {
    el.addEventListener('click', function () {
      document.querySelectorAll('.type').forEach(function (x) { x.classList.remove('on'); });
      el.classList.add('on'); el.querySelector('input').checked = true;
      if (photoData) previewFile.lastFile && handleFile(previewFile.lastFile);
    });
  });
  $('#shootBtn').addEventListener('click', function () { $('#file').click(); });
  function handleFile(file) {
    if (!file) return;
    previewFile.lastFile = file;
    loadImage(file).then(function (img) {
      photoData = drawWatermark(img);
      var pv = $('#preview'); pv.src = photoData; pv.style.display = 'block';
      refresh();
    }).catch(function (e) { $('#err').textContent = e.message; });
  }
  var previewFile = {};
  $('#file').addEventListener('change', function (e) { handleFile(e.target.files[0]); });
  $('#submitBtn').addEventListener('click', function () {
    if (busy) return;
    var name = $('#name').value.trim();
    if (!name) { $('#err').textContent = '请填写姓名'; return; }
    if (!photoData) { $('#err').textContent = '请先拍照'; return; }
    busy = true; $('#err').textContent = ''; $('#submitBtn').disabled = true; $('#submitBtn').textContent = '上传中…';
    fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      job: jobId, jobName: jobName,
      date: $('#date').value || today(), dept: $('#dept').value, role: $('#role').value, name: name,
      type: document.querySelector('input[name=type]:checked').value, note: $('#note').value,
      photo: photoData, lat: gps && gps.lat, lng: gps && gps.lng, accuracy: gps && gps.acc
    }) }).then(function (r) { return r.json(); }).then(function (r) {
      if (!r.ok) throw new Error(r.error || '提交失败');
      $('#formCard').style.display = 'none';
      $('#okView').style.display = 'block';
      $('#okTitle').textContent = '打卡成功';
      $('#okInfo').textContent = $('#dept').value + ' · ' + $('#role').value + ' · ' + name + '\n' + r.record.receivedAt;
    }).catch(function (e) { $('#err').textContent = e.message; }).then(function () {
      busy = false; $('#submitBtn').textContent = '提交打卡'; refresh();
    });
  });
  $('#againBtn').addEventListener('click', function () {
    photoData = ''; previewFile.lastFile = null; $('#preview').style.display = 'none';
    $('#note').value = ''; $('#okView').style.display = 'none'; $('#formCard').style.display = 'block'; refresh();
  });
})();
