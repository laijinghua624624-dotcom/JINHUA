/* export.js — 导出：报价单（给公司）/ 核价单 / 利润测算（内部）/ 出库单，以及打印 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EQExport = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';
  var M = (typeof require === 'function') ? require('./model.js') : root.EQModel;
  var FONT = '宋体';

  function textUnits(s) {
    s = String(s === undefined || s === null ? '' : s);
    var u = 0;
    for (var i = 0; i < s.length; i++) u += s.charCodeAt(i) > 127 ? 2 : 1;
    return u;
  }
  function lineCount(text, widthChars) {
    return Math.max(1, Math.ceil(textUnits(text) / Math.max(6, widthChars * 0.9)));
  }
  function rowHeight(name, note, nameWidth, noteWidth) {
    var lines = Math.max(lineCount(name, nameWidth), lineCount(note, noteWidth));
    return Math.max(24, Math.min(48, lines * 15 + 8));
  }
  function font(size, bold, color) { return { name: FONT, size: size || 11, bold: !!bold, color: { argb: color || 'FF1F2937' } }; }
  var THIN = { style: 'thin', color: { argb: 'FF9CA3AF' } };
  var BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  function solid(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }
  var AMBER = solid('FFFFC000'), GREEN = solid('FF9BBB59'), LGREEN = solid('FFE2EFDA'),
      LAMBER = solid('FFFFF2CC'), BLUEBG = solid('FFEAF1FB'), REDBG = solid('FFFEF2F2');

  function cell(ws, r, c, v, opt) {
    opt = opt || {};
    var x = ws.getCell(r, c);
    if (v !== undefined) x.value = v;
    x.font = opt.font || font();
    x.alignment = opt.align || { vertical: 'middle', wrapText: opt.wrap !== false, horizontal: opt.left ? 'left' : (opt.right ? 'right' : 'center') };
    if (opt.fill) x.fill = opt.fill;
    if (opt.border !== false) x.border = BORDER;
    if (opt.numFmt) x.numFmt = opt.numFmt;
    return x;
  }
  function merge(ws, r1, c1, r2, c2, v, opt) {
    for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) cell(ws, r, c, undefined, opt);
    if (v !== undefined) ws.getCell(r1, c1).value = v;
    if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  }
  function widths(ws, arr) { arr.forEach(function (w, i) { ws.getColumn(i + 1).width = w; }); }
  function title(ws, text, lastCol) {
    merge(ws, 1, 1, 1, lastCol, text, { font: font(16, true), align: { vertical: 'middle', horizontal: 'center' } });
    ws.getRow(1).height = 38;
  }
  function infoRow(ws, r, label, value, lastCol) {
    merge(ws, r, 1, r, 2, label, { font: font(10.5, true), fill: LGREEN, left: true });
    merge(ws, r, 3, r, lastCol, value, { font: font(10.5), left: true });
    ws.getRow(r).height = 22;
  }
  function headerRow(ws, r, heads, widthsArr) {
    heads.forEach(function (h, i) {
      cell(ws, r, i + 1, h, { font: font(10.5, true), fill: AMBER, align: { vertical: 'middle', horizontal: 'center', wrapText: true } });
    });
    if (widthsArr) widths(ws, widthsArr);
    ws.getRow(r).height = 30;
  }
  function dateStr(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) { var p = d.slice(0, 10).split('-'); return p[0] + '/' + p[1] + '/' + p[2]; }
    return String(d || '');
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
  }
  function pct(x) { return M.round2(x * 100) + '%'; }
  function rate(project, key, dft) {
    var v = project[key];
    return (v === undefined || v === null || v === '') ? dft : M.num(v);
  }

  /* ---------- 报价单 / 核价单（同版式，价格口径不同） ---------- */
  var HEADS = ['序号', '项目编码', '活动项目描述（活动工序工艺说明）', '类型', '计量单位', '数量', '天数', '材料费', '人工费', '综合单价', '合计', '备注'];
  var WIDTHS = [6, 15, 44, 7, 9, 8, 7, 11, 11, 12, 14, 30];
  var LAST = 12, AMT_COL = 11, HEADER = 8, NAME_W = 44, NOTE_W = 30;

  function fillSheet(ws, mode, sheetTitle, project, settings) {
    title(ws, sheetTitle, LAST);
    infoRow(ws, 2, '承接单位', settings.company || '广州市灯龙影视器材租赁有限公司', LAST);
    infoRow(ws, 3, '单位地址', settings.address || '广州市海珠区华洲路170号自编0栋101室之一', LAST);
    infoRow(ws, 4, '活动名称', project.name || '', LAST);
    infoRow(ws, 5, '活动地址', project.location || '', LAST);

    merge(ws, 6, 1, 6, 2, '报价日期', { font: font(10.5, true), fill: LGREEN, left: true });
    merge(ws, 6, 3, 6, 4, todayStr(), { font: font(10.5), left: true });
    merge(ws, 6, 5, 6, 5, '拍摄日期', { font: font(10.5, true), fill: LGREEN, left: true });
    merge(ws, 6, 6, 6, 7, dateStr(project.shootDate), { font: font(10.5), left: true });
    merge(ws, 6, 8, 6, 8, '拍摄天数', { font: font(10.5, true), fill: LGREEN, left: true });
    merge(ws, 6, 9, 6, 9, M.lineDays(project), { font: font(10.5) });
    merge(ws, 6, 10, 6, 10, '编号', { font: font(10.5, true), fill: LGREEN, left: true });
    merge(ws, 6, 11, 6, 12, project.no || '', { font: font(10.5), left: true });
    ws.getRow(6).height = 22;

    merge(ws, 7, 1, 7, LAST, project.remark || '', { font: font(9.5, false, 'FF6B7280'), left: true, border: false });
    ws.getRow(7).height = 18;

    headerRow(ws, HEADER, HEADS, WIDTHS);
    var r = HEADER + 1, seq = 0, subtotal = 0;
    var priceKey = mode === 'approved' ? 'approved' : 'quote';

    (project.groups || []).forEach(function (g) {
      var gt = M.groupTotals(g, project);
      merge(ws, r, 1, r, LAST, '　' + g.name + '　｜　' + (g.pkg ? '整组报价 · ' + gt.count + ' 项明细' : gt.count + ' 项 / ' + gt.qty + ' 件'), {
        font: font(11, true, 'FFFFFFFF'), fill: GREEN, left: true
      });
      ws.getRow(r).height = 24;
      r += 1;
      if (g.pkg) {
        seq += 1;
        var pq = M.round2(g.pkgQuote), pa = M.round2(g.pkgApproved), pn = M.num(g.pkgQty) || 1;
        var pprice = mode === 'approved' ? pa : pq;
        var pamt = M.round2(pprice * pn);
        subtotal += pamt;
        cell(ws, r, 1, seq); cell(ws, r, 2, '整组', { font: font(9.5), left: true });
        cell(ws, r, 3, g.name + '（整组报价）', { font: font(10.5), left: true });
        cell(ws, r, 4, '整组', { font: font(9.5) }); cell(ws, r, 5, '组');
        cell(ws, r, 6, pn, { numFmt: '#,##0' }); cell(ws, r, 7, 1);
        cell(ws, r, 8, pprice, { numFmt: '#,##0.00' }); cell(ws, r, 9, 0, { numFmt: '#,##0.00' });
        cell(ws, r, 10, pprice, { numFmt: '#,##0.00' }); cell(ws, r, 11, pamt, { font: font(10.5, true), numFmt: '#,##0.00' });
        cell(ws, r, 12, '整组报价，明细见出库单', { font: font(9), left: true });
        ws.getRow(r).height = 24;
        r += 1;
        return;
      }
      (g.items || []).forEach(function (it) {
        seq += 1;
        var price = M.round2(it[priceKey]);
        var amount = M.round2(M.num(it.qty) * M.lineDays(project) * price);
        subtotal += amount;
        var isCrew = it.type === 'crew';
        cell(ws, r, 1, seq, { font: font(10.5) });
        cell(ws, r, 2, it.cat || '', { font: font(9.5), left: true });
        cell(ws, r, 3, it.name, { font: font(10.5), left: true });
        cell(ws, r, 4, isCrew ? '人员' : '器材', { font: font(9.5) });
        cell(ws, r, 5, it.unit || '个', { font: font(10.5) });
        cell(ws, r, 6, M.num(it.qty), { font: font(10.5), numFmt: '#,##0' });
        cell(ws, r, 7, M.lineDays(project), { font: font(10.5) });
        cell(ws, r, 8, isCrew ? 0 : price, { font: font(10.5), numFmt: '#,##0.00' });
        cell(ws, r, 9, isCrew ? price : 0, { font: font(10.5), numFmt: '#,##0.00' });
        cell(ws, r, 10, price, { font: font(10.5), numFmt: '#,##0.00' });
        cell(ws, r, 11, amount, { font: font(10.5, true), numFmt: '#,##0.00' });
        cell(ws, r, 12, it.note || '', { font: font(9), left: true });
        ws.getRow(r).height = rowHeight(it.name, it.note || '', NAME_W, NOTE_W);
        r += 1;
      });
    });

    r += 1;
    var taxRate = M.num(project.taxRate, 0);
    var tax = M.round2(subtotal * taxRate);
    merge(ws, r, 1, r, AMT_COL - 1, '（一）本页小计：材料费 + 人工费', { font: font(11, true), fill: LAMBER, align: { vertical: 'middle', horizontal: 'right' } });
    cell(ws, r, AMT_COL, M.round2(subtotal), { font: font(11, true), fill: LAMBER, numFmt: '#,##0.00' });
    cell(ws, r, LAST, '', { fill: LAMBER });
    ws.getRow(r).height = 24; r += 1;
    merge(ws, r, 1, r, AMT_COL - 1, '（二）税费（' + pct(taxRate) + '）', { font: font(11, true), fill: LAMBER, align: { vertical: 'middle', horizontal: 'right' } });
    cell(ws, r, AMT_COL, tax, { font: font(11, true), fill: LAMBER, numFmt: '#,##0.00' });
    cell(ws, r, LAST, '', { fill: LAMBER });
    ws.getRow(r).height = 24; r += 1;
    merge(ws, r, 1, r, AMT_COL - 1, '项目合计（一 + 二）', { font: font(12, true), fill: AMBER, align: { vertical: 'middle', horizontal: 'right' } });
    cell(ws, r, AMT_COL, M.round2(subtotal + tax), { font: font(12, true), fill: AMBER, numFmt: '#,##0.00' });
    cell(ws, r, LAST, '', { fill: AMBER });
    ws.getRow(r).height = 28; r += 2;

    merge(ws, r, 1, r, LAST, '制表人：' + (settings.preparer || '') + '　　　　复核：　　　　　　　　日期：　　　　年　　月　　日', { font: font(10), left: true, border: false });
    ws.getRow(r).height = 26;

    ws.views = [{ state: 'frozen', ySplit: HEADER, xSplit: 0 }];
    ws.pageSetup = {
      orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.25 }
    };
    ws.headerFooter = { oddFooter: '&C' + (project.name || sheetTitle) + '　第 &P 页 / 共 &N 页' };
  }

  function newWorkbook(ExcelJS, settings) {
    var wb = new ExcelJS.Workbook();
    wb.creator = settings.preparer || '拍摄器材报价系统';
    wb.created = new Date();
    return wb;
  }
  function buildQuoteWorkbook(ExcelJS, project, settings) {
    settings = settings || {};
    var wb = newWorkbook(ExcelJS, settings);
    fillSheet(wb.addWorksheet('报价单', { properties: { defaultRowHeight: 22 } }), 'quote', '活动项目报价单', project, settings);
    return wb;
  }
  function buildApprovedWorkbook(ExcelJS, project, settings) {
    settings = settings || {};
    var wb = newWorkbook(ExcelJS, settings);
    fillSheet(wb.addWorksheet('核价单', { properties: { defaultRowHeight: 22 } }), 'approved', '活动项目核价单', project, settings);
    return wb;
  }

  /* ---------- 利润测算（内部） ---------- */
  function buildProfitWorkbook(ExcelJS, project, settings) {
    settings = settings || {};
    var wb = newWorkbook(ExcelJS, settings);
    var ws = wb.addWorksheet('利润测算', { properties: { defaultRowHeight: 22 } });
    var heads = ['序号', '机位组', '项目', '单位', '数量', '天数', '底价', '底价合计', '报价', '报价合计', '核价', '核价合计', '返点', '利润', '利润率(对底价)'];
    var WW = [6, 15, 34, 8, 8, 7, 11, 13, 11, 13, 11, 13, 10, 13, 14];
    var tot = M.totals(project);
    title(ws, '项目利润测算（内部资料，请勿外发）', heads.length);
    infoRow(ws, 2, '项目名称', project.name || '', heads.length);
    infoRow(ws, 3, '拍摄日期', dateStr(project.shootDate) + '（' + M.lineDays(project) + ' 天）', heads.length);
    merge(ws, 4, 1, 4, heads.length,
      '规则：底价 → 报价 = 底价 × (1 + ' + pct(rate(project, 'markupRate', 0.30)) + ')　→　核价 = 报价 × (1 - ' + pct(rate(project, 'cutRate', 0.20)) + ')　；　返点 = 底价 × ' + pct(rate(project, 'rebateRate', 0.05)) + '　；　利润 = 核价 - 底价 + 返点',
      { font: font(9.5, false, 'FF6B7280'), left: true, border: false });
    ws.getRow(4).height = 30;
    headerRow(ws, 5, heads, WW);
    var r = 6, seq = 0;
    (project.groups || []).forEach(function (g) {
      if (g.pkg) {
        seq += 1;
        var pb = M.num(g.pkgBottom), pq2 = M.num(g.pkgQuote), pa2 = M.num(g.pkgApproved), pn2 = M.num(g.pkgQty) || 1;
        var pgt = M.groupTotals(g, project);
        var pvals = [seq, g.name, '整组报价（明细见出库单）', '组', pn2, 1, pb, M.round2(pb * pn2), pq2, M.round2(pq2 * pn2), pa2, M.round2(pa2 * pn2), pgt.rebate, pgt.profit, pgt.bottom > 0 ? M.round2(pgt.profit / pgt.bottom * 100) + '%' : '—'];
        var pfmts = [null, null, null, null, '#,##0', '0', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', null];
        pvals.forEach(function (v, i) {
          cell(ws, r, i + 1, v, { font: font(10, i === 13), numFmt: pfmts[i] || undefined, left: i === 1 || i === 2, fill: i === 13 ? REDBG : undefined });
        });
        ws.getRow(r).height = 24; r += 1;
        return;
      }
      (g.items || []).forEach(function (it) {
        seq += 1;
        var b = M.lineBottom(it, project), q = M.lineQuote(it, project), a = M.lineApproved(it, project);
        var rb = M.lineRebate(it, project), pf = M.lineProfit(it, project);
        var vals = [seq, g.name, it.name, it.unit || '个', M.num(it.qty), M.lineDays(project),
          M.round2(it.bottom), b, M.round2(it.quote), q, M.round2(it.approved), a, rb, pf,
          b > 0 ? M.round2(pf / b * 100) + '%' : '—'];
        var fmts = [null, null, null, null, '#,##0', '0', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', null];
        vals.forEach(function (v, i) {
          cell(ws, r, i + 1, v, {
            font: font(10, i === 13), numFmt: fmts[i] || undefined,
            left: i === 1 || i === 2, fill: i === 13 ? REDBG : undefined
          });
        });
        ws.getRow(r).height = rowHeight(it.name, '', 34, 10);
        r += 1;
      });
    });
    r += 1;
    merge(ws, r, 1, r, 6, '合计（未含税）', { font: font(11, true), fill: LAMBER, align: { vertical: 'middle', horizontal: 'right' } });
    cell(ws, r, 7, '', { fill: LAMBER });
    cell(ws, r, 8, tot.bottom, { font: font(11, true), fill: LAMBER, numFmt: '#,##0.00' });
    cell(ws, r, 9, '', { fill: LAMBER });
    cell(ws, r, 10, tot.quote, { font: font(11, true), fill: LAMBER, numFmt: '#,##0.00' });
    cell(ws, r, 11, '', { fill: LAMBER });
    cell(ws, r, 12, tot.approved, { font: font(11, true), fill: LAMBER, numFmt: '#,##0.00' });
    cell(ws, r, 13, tot.rebate, { font: font(11, true), fill: LAMBER, numFmt: '#,##0.00' });
    cell(ws, r, 14, tot.profit, { font: font(11, true), fill: LAMBER, numFmt: '#,##0.00' });
    cell(ws, r, 15, tot.profitRateBottom + '%', { font: font(11, true), fill: LAMBER });
    ws.getRow(r).height = 26; r += 1;
    merge(ws, r, 1, r, 14, '利润率（对核价）', { font: font(11, true), fill: AMBER, align: { vertical: 'middle', horizontal: 'right' } });
    cell(ws, r, 15, tot.profitRateApproved + '%', { font: font(11, true), fill: AMBER });
    ws.getRow(r).height = 26; r += 2;
    merge(ws, r, 1, r, heads.length, '注意：本页含内部价格数据，请勿对外发送。', { font: font(9.5, true, 'FF991B1B'), left: true, border: false });
    ws.views = [{ state: 'frozen', ySplit: 5 }];
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.25 } };
    ws.headerFooter = { oddFooter: '&C利润测算（内部）　第 &P 页 / 共 &N 页' };
    return wb;
  }

  /* ---------- 出库单 ---------- */
  function buildOutboundWorkbook(ExcelJS, project, settings) {
    settings = settings || {};
    var wb = newWorkbook(ExcelJS, settings);
    var ob = M.outbound(project);

    var ws = wb.addWorksheet('出库汇总', { properties: { defaultRowHeight: 22 } });
    title(ws, '器材出库汇总清单', 9);
    infoRow(ws, 2, '项目名称', project.name || '', 9);
    infoRow(ws, 3, '拍摄地点', project.location || '', 9);
    infoRow(ws, 4, '拍摄日期', dateStr(project.shootDate) + '（' + M.lineDays(project) + ' 天）', 9);
    merge(ws, 5, 1, 5, 9, '说明：数量按报价单口径汇总，同名器材跨机位合并；实发数量由仓管填写，差异 = 实发 - 应发。', { font: font(9, false, 'FF6B7280'), left: true, border: false });
    ws.getRow(5).height = 18;
    headerRow(ws, 6, ['序号', '分类', '器材名称', '单位', '数量', '分属机位及数量', '实发数量', '差异', '备注'],
      [6, 14, 44, 8, 8, 34, 10, 9, 26]);
    var r = 7, totalQty = 0, totalOut = 0, hasOut = false;
    ob.lines.forEach(function (l, i) {
      totalQty += l.qty;
      var dist = l.groups.map(function (g) { return g.name + ' ' + g.qty; }).join('；');
      var out = project.outbound && project.outbound[l.key] !== undefined && project.outbound[l.key] !== '' ? M.num(project.outbound[l.key]) : null;
      if (out !== null) { totalOut += out; hasOut = true; }
      cell(ws, r, 1, i + 1, { font: font(10) });
      cell(ws, r, 2, l.cat, { font: font(9.5), left: true });
      cell(ws, r, 3, l.name, { font: font(10.5), left: true });
      cell(ws, r, 4, l.unit, { font: font(10) });
      cell(ws, r, 5, l.qty, { font: font(10.5, true), numFmt: '#,##0' });
      cell(ws, r, 6, dist, { font: font(9), left: true });
      cell(ws, r, 7, out === null ? '' : out, { font: font(10.5), numFmt: '#,##0', fill: BLUEBG });
      cell(ws, r, 8, out === null ? '' : M.round2(out - l.qty), { font: font(10.5), numFmt: '#,##0', fill: BLUEBG });
      cell(ws, r, 9, '', { font: font(9), left: true, fill: BLUEBG });
      ws.getRow(r).height = Math.max(24, rowHeight(l.name, dist, 44, 34));
      r += 1;
    });
    r += 1;
    merge(ws, r, 1, r, 4, '合计：' + ob.lineCount + ' 项器材', { font: font(11, true), fill: LAMBER, align: { vertical: 'middle', horizontal: 'right' } });
    cell(ws, r, 5, totalQty, { font: font(11, true), fill: LAMBER, numFmt: '#,##0' });
    cell(ws, r, 6, '', { fill: LAMBER });
    cell(ws, r, 7, hasOut ? totalOut : '', { font: font(11, true), fill: LAMBER, numFmt: '#,##0' });
    cell(ws, r, 8, hasOut ? M.round2(totalOut - totalQty) : '', { font: font(11, true), fill: LAMBER, numFmt: '#,##0' });
    cell(ws, r, 9, '', { fill: LAMBER });
    ws.getRow(r).height = 26; r += 2;
    merge(ws, r, 1, r, 9, '出库人（签字）：　　　　　　　　　　复核人（签字）：　　　　　　　　　　日期：　　　　年　　月　　日　　（人员 ' + ob.crewQty + ' 人不计入器材出库）', { font: font(10), left: true, border: false });
    ws.views = [{ state: 'frozen', ySplit: 6 }];
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.25 } };
    ws.headerFooter = { oddFooter: '&C器材出库单　第 &P 页 / 共 &N 页' };

    var ws2 = wb.addWorksheet('分机位明细', { properties: { defaultRowHeight: 22 } });
    title(ws2, '分机位器材明细（按机位分箱 / 现场点数）', 6);
    headerRow(ws2, 2, ['序号', '器材名称（含型号）', '单位', '数量', '实发数量', '备注'], [6, 46, 8, 8, 10, 30]);
    var rr = 3;
    ob.groups.forEach(function (g) {
      var qty = g.items.reduce(function (s, i) { return s + i.qty; }, 0);
      merge(ws2, rr, 1, rr, 6, '　' + g.name + '　｜　' + g.items.length + ' 项 / ' + qty + ' 件', { font: font(11, true, 'FFFFFFFF'), fill: GREEN, left: true });
      ws2.getRow(rr).height = 24; rr += 1;
      g.items.forEach(function (it, i) {
        cell(ws2, rr, 1, i + 1, { font: font(10) });
        cell(ws2, rr, 2, it.name, { font: font(10.5), left: true });
        cell(ws2, rr, 3, it.unit, { font: font(10) });
        cell(ws2, rr, 4, it.qty, { font: font(10.5, true), numFmt: '#,##0' });
        cell(ws2, rr, 5, '', { fill: BLUEBG });
        cell(ws2, rr, 6, it.note || '', { font: font(9), left: true });
        ws2.getRow(rr).height = rowHeight(it.name, it.note || '', 46, 30);
        rr += 1;
      });
    });
    ws2.views = [{ state: 'frozen', ySplit: 2 }];
    ws2.pageSetup = { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.25 } };
    ws2.headerFooter = { oddFooter: '&C分机位明细　第 &P 页 / 共 &N 页' };
    return wb;
  }

  /* ---------- 下载 / 打印 ---------- */
  function safeName(s) { return String(s || '报价单').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80); }
  function downloadWorkbook(wb, filename) {
    return wb.xlsx.writeBuffer().then(function (buf) {
      var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return filename;
    });
  }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var PRINT_CSS = '@page{size:A4 landscape;margin:8mm}body{font-family:"宋体","PingFang SC",serif;color:#111827;margin:0;padding:10px}h1{font-size:20px;text-align:center;margin:0 0 10px}' +
    '.meta{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}.meta td{border:1px solid #999;padding:4px 6px}.meta .k{background:#e2efda;font-weight:700;width:9%}' +
    'table.q{width:100%;border-collapse:collapse;font-size:10.5px}table.q th{background:#ffc000;border:1px solid #999;padding:4px;font-weight:700}' +
    'table.q td{border:1px solid #999;padding:3px 4px;vertical-align:middle}table.q .num{text-align:right}table.q .band td{background:#9bbb59;color:#fff;font-weight:700}' +
    'table.q .sub td{background:#fff2cc;font-weight:700}table.q .grand td{background:#ffc000;font-weight:700}.foot{margin-top:14px;font-size:10.5px;display:flex;justify-content:space-between}' +
    '.note{font-size:9.5px;color:#6b7280;margin:4px 0 8px}';

  function printQuote(project, settings) {
    var rows = [], seq = 0, sub = 0;
    (project.groups || []).forEach(function (g) {
      var gt = M.groupTotals(g, project);
      rows.push('<tr class="band"><td colspan="8">' + esc(g.name) + '　｜　' + gt.count + ' 项 / ' + gt.qty + ' 件</td></tr>');
      (g.items || []).forEach(function (it) {
        seq += 1;
        var q = M.lineQuote(it, project); sub += q;
        rows.push('<tr><td class="num">' + seq + '</td><td>' + esc(it.cat || '') + '</td><td>' + esc(it.name) + '</td>' +
          '<td class="num">' + esc(it.unit || '个') + '</td><td class="num">' + M.num(it.qty) + '</td><td class="num">' + M.lineDays(project) + '</td>' +
          '<td class="num">' + M.round2(it.quote).toFixed(2) + '</td><td class="num">' + q.toFixed(2) + '</td></tr>');
      });
    });
    var tax = M.round2(sub * M.num(project.taxRate, 0));
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>报价单 - ' + esc(project.name) + '</title><style>' + PRINT_CSS + '</style></head><body>' +
      '<h1>活动项目报价单</h1>' +
      '<table class="meta"><tr><td class="k">承接单位</td><td colspan="3">' + esc(settings.company) + '</td><td class="k">报价日期</td><td>' + todayStr() + '</td></tr>' +
      '<tr><td class="k">活动名称</td><td colspan="3">' + esc(project.name) + '</td><td class="k">拍摄日期</td><td>' + esc(dateStr(project.shootDate)) + '（' + M.lineDays(project) + ' 天）</td></tr>' +
      '<tr><td class="k">活动地址</td><td colspan="3">' + esc(project.location) + '</td><td class="k">编号</td><td>' + esc(project.no || '') + '</td></tr></table>' +
      (project.remark ? '<div class="note">' + esc(project.remark) + '</div>' : '') +
      '<table class="q"><thead><tr><th>序号</th><th>项目编码</th><th>活动项目描述</th><th>计量单位</th><th>数量</th><th>天数</th><th>综合单价</th><th>合计</th></tr></thead><tbody>' +
      rows.join('') +
      '<tr class="sub"><td colspan="7">（一）本页小计</td><td class="num">' + sub.toFixed(2) + '</td></tr>' +
      '<tr class="sub"><td colspan="7">（二）税费（' + pct(M.num(project.taxRate, 0)) + '）</td><td class="num">' + tax.toFixed(2) + '</td></tr>' +
      '<tr class="grand"><td colspan="7">项目合计（一+二）</td><td class="num">' + (sub + tax).toFixed(2) + '</td></tr>' +
      '</tbody></table><div class="foot"><span>制表人：' + esc(settings.preparer || '') + '</span><span>复核：</span><span>日期：　　年　　月　　日</span></div></body></html>';
  }

  function printOutbound(project) {
    var ob = M.outbound(project);
    var rows = ob.lines.map(function (l, i) {
      var out = project.outbound && project.outbound[l.key] !== undefined && project.outbound[l.key] !== '' ? M.num(project.outbound[l.key]) : '';
      return '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(l.cat) + '</td><td>' + esc(l.name) + '</td><td class="num">' + esc(l.unit) + '</td>' +
        '<td class="num">' + l.qty + '</td><td>' + esc(l.groups.map(function (g) { return g.name + ' ' + g.qty; }).join('；')) + '</td><td class="num">' + (out === '' ? '' : out) + '</td><td class="num">' + (out === '' ? '' : (out - l.qty)) + '</td></tr>';
    }).join('');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>出库单 - ' + esc(project.name) + '</title><style>' + PRINT_CSS + '</style></head><body>' +
      '<h1>器材出库汇总清单</h1>' +
      '<table class="meta"><tr><td class="k">项目名称</td><td colspan="3">' + esc(project.name) + '</td><td class="k">拍摄日期</td><td>' + esc(dateStr(project.shootDate)) + '</td></tr>' +
      '<tr><td class="k">拍摄地点</td><td colspan="3">' + esc(project.location) + '</td><td class="k">器材项数</td><td>' + ob.lineCount + ' 项 / ' + ob.totalQty + ' 件</td></tr></table>' +
      '<table class="q"><thead><tr><th>序号</th><th>分类</th><th>器材名称</th><th>单位</th><th>数量</th><th>分属机位及数量</th><th>实发数量</th><th>差异</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="foot"><span>出库人（签字）：</span><span>复核人（签字）：</span><span>日期：　　年　　月　　日</span></div></body></html>';
  }
  function openPrint(html) {
    var w = root.open('', '_blank');
    if (!w) { alert('浏览器阻止了新窗口，请允许弹窗后重试。'); return false; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 300);
    return true;
  }


  /* ---------- 系统版式：报价 + 备注 + 核价 合并单 ---------- */
  function buildCombinedWorkbook(ExcelJS, project, settings) {
    settings = settings || {};
    var wb = newWorkbook(ExcelJS, settings);
    var ws = wb.addWorksheet('报价核价单', { properties: { defaultRowHeight: 22 } });
    var LAST = 16;
    var WIDTHS = [6, 15, 42, 7, 9, 8, 7, 11, 11, 12, 13, 28, 11, 11, 12, 13];
    var BLUE = solid('FF00B0F0');

    title(ws, '活动项目报价 / 核价单', LAST);
    infoRow(ws, 2, '承接单位', settings.company || '广州市灯龙影视器材租赁有限公司', LAST);
    infoRow(ws, 3, '单位地址', settings.address || '广州市海珠区华洲路170号自编0栋101室之一', LAST);
    infoRow(ws, 4, '活动名称', project.name || '', LAST);
    infoRow(ws, 5, '活动地址', project.location || '', LAST);
    merge(ws, 6, 1, 6, 2, '报价日期', { font: font(10.5, true), fill: LGREEN, left: true });
    merge(ws, 6, 3, 6, 4, todayStr(), { font: font(10.5), left: true });
    merge(ws, 6, 5, 6, 5, '拍摄日期', { font: font(10.5, true), fill: LGREEN, left: true });
    merge(ws, 6, 6, 6, 7, dateStr(project.shootDate), { font: font(10.5), left: true });
    merge(ws, 6, 8, 6, 8, '拍摄天数', { font: font(10.5, true), fill: LGREEN, left: true });
    merge(ws, 6, 9, 6, 10, M.lineDays(project), { font: font(10.5) });
    merge(ws, 6, 11, 6, 11, '编号', { font: font(10.5, true), fill: LGREEN, left: true });
    merge(ws, 6, 12, 6, 16, project.no || '', { font: font(10.5), left: true });
    ws.getRow(6).height = 22;
    merge(ws, 7, 1, 7, LAST, project.remark || '', { font: font(9.5, false, 'FF6B7280'), left: true, border: false });
    ws.getRow(7).height = 18;

    /* 两层表头：报价 | 备注 | 核价 */
    widths(ws, WIDTHS);
    merge(ws, 8, 1, 9, 1, '序号', { font: font(10.5, true), fill: AMBER });
    merge(ws, 8, 2, 9, 2, '项目编码', { font: font(10.5, true), fill: AMBER });
    merge(ws, 8, 3, 9, 3, '活动项目描述（活动工序工艺说明）', { font: font(10.5, true), fill: AMBER });
    merge(ws, 8, 4, 9, 4, '类型', { font: font(10.5, true), fill: AMBER });
    merge(ws, 8, 5, 9, 5, '计量单位', { font: font(10.5, true), fill: AMBER });
    merge(ws, 8, 6, 9, 6, '数量', { font: font(10.5, true), fill: AMBER });
    merge(ws, 8, 7, 9, 7, '天数', { font: font(10.5, true), fill: AMBER });
    merge(ws, 8, 8, 8, 11, '报价（元）', { font: font(11, true), fill: AMBER });
    merge(ws, 8, 12, 9, 12, '备注', { font: font(10.5, true), fill: AMBER });
    merge(ws, 8, 13, 8, 16, '核价（元）', { font: font(11, true), fill: BLUE });
    ['材料费', '人工费', '综合单价', '合计'].forEach(function (h, i) {
      cell(ws, 9, 8 + i, h, { font: font(10.5, true), fill: AMBER });
      cell(ws, 9, 13 + i, h, { font: font(10.5, true), fill: BLUE });
    });
    ws.getRow(8).height = 26; ws.getRow(9).height = 26;

    var r = 10, seq = 0, qSub = 0, cSub = 0;
    (project.groups || []).forEach(function (g) {
      var gt = M.groupTotals(g, project);
      merge(ws, r, 1, r, LAST, '　' + g.name + '　｜　' + (g.pkg ? '整组报价 · ' + gt.count + ' 项明细' : gt.count + ' 项 / ' + gt.qty + ' 件'), {
        font: font(11, true, 'FFFFFFFF'), fill: GREEN, left: true
      });
      ws.getRow(r).height = 24;
      r += 1;
      if (g.pkg) {
        seq += 1;
        var pq3 = M.round2(g.pkgQuote), pa3 = M.round2(g.pkgApproved), pn3 = M.num(g.pkgQty) || 1;
        qSub += M.round2(pq3 * pn3); cSub += M.round2(pa3 * pn3);
        cell(ws, r, 1, seq); cell(ws, r, 2, '整组', { left: true }); cell(ws, r, 3, g.name + '（整组报价）', { left: true });
        cell(ws, r, 4, '整组'); cell(ws, r, 5, '组'); cell(ws, r, 6, pn3, { numFmt: '#,##0' }); cell(ws, r, 7, 1);
        cell(ws, r, 8, pq3, { numFmt: '#,##0.00' }); cell(ws, r, 9, 0, { numFmt: '#,##0.00' });
        cell(ws, r, 10, pq3, { numFmt: '#,##0.00' }); cell(ws, r, 11, M.round2(pq3 * pn3), { font: font(10.5, true), numFmt: '#,##0.00' });
        cell(ws, r, 12, '整组报价，明细见出库单', { font: font(9), left: true });
        cell(ws, r, 13, pa3, { numFmt: '#,##0.00' }); cell(ws, r, 14, 0, { numFmt: '#,##0.00' });
        cell(ws, r, 15, pa3, { numFmt: '#,##0.00' }); cell(ws, r, 16, M.round2(pa3 * pn3), { font: font(10.5, true), numFmt: '#,##0.00' });
        ws.getRow(r).height = 24; r += 1;
        return;
      }
      (g.items || []).forEach(function (it) {
        seq += 1;
        var days = M.lineDays(project);
        var isCrew = it.type === 'crew';
        var q = M.round2(it.quote), c = M.round2(it.approved);
        var qa = M.round2(M.num(it.qty) * days * q), ca = M.round2(M.num(it.qty) * days * c);
        qSub += qa; cSub += ca;
        cell(ws, r, 1, seq); cell(ws, r, 2, it.cat || '', { left: true });
        cell(ws, r, 3, it.name, { left: true }); cell(ws, r, 4, isCrew ? '人员' : '器材');
        cell(ws, r, 5, it.unit || '个'); cell(ws, r, 6, M.num(it.qty), { numFmt: '#,##0' });
        cell(ws, r, 7, days);
        cell(ws, r, 8, isCrew ? 0 : q, { numFmt: '#,##0.00' });
        cell(ws, r, 9, isCrew ? q : 0, { numFmt: '#,##0.00' });
        cell(ws, r, 10, q, { numFmt: '#,##0.00' });
        cell(ws, r, 11, qa, { font: font(10.5, true), numFmt: '#,##0.00' });
        cell(ws, r, 12, it.note || '', { font: font(9), left: true });
        cell(ws, r, 13, isCrew ? 0 : c, { numFmt: '#,##0.00' });
        cell(ws, r, 14, isCrew ? c : 0, { numFmt: '#,##0.00' });
        cell(ws, r, 15, c, { numFmt: '#,##0.00' });
        cell(ws, r, 16, ca, { font: font(10.5, true), numFmt: '#,##0.00' });
        ws.getRow(r).height = rowHeight(it.name, it.note || '', 42, 28);
        r += 1;
      });
    });

    var taxRate = M.num(project.taxRate, 0);
    var qTax = M.round2(qSub * taxRate), cTax = M.round2(cSub * taxRate);
    r += 1;
    function totalRow(label, qv, cv, fill) {
      merge(ws, r, 1, r, 10, label, { font: font(11, true), fill: fill, align: { vertical: 'middle', horizontal: 'right' } });
      cell(ws, r, 11, M.round2(qv), { font: font(11, true), fill: fill, numFmt: '#,##0.00' });
      cell(ws, r, 12, '', { fill: fill });
      merge(ws, r, 13, r, 15, label, { font: font(11, true), fill: fill, align: { vertical: 'middle', horizontal: 'right' } });
      cell(ws, r, 16, M.round2(cv), { font: font(11, true), fill: fill, numFmt: '#,##0.00' });
      ws.getRow(r).height = 24;
      r += 1;
    }
    totalRow('（一）本页小计', qSub, cSub, LAMBER);
    totalRow('（二）税费（' + M.round2(taxRate * 100) + '%）', qTax, cTax, LAMBER);
    totalRow('项目合计（一 + 二）', qSub + qTax, cSub + cTax, AMBER);
    r += 1;
    merge(ws, r, 1, r, LAST, '制表人：' + (settings.preparer || '') + '　　　　复核：　　　　　　　　日期：　　　　年　　月　　日', { font: font(10), left: true, border: false });
    ws.getRow(r).height = 26;

    ws.print_area = 'A1:P' + r;
    ws.views = [{ state: 'frozen', ySplit: 9 }];
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.25 } };
    ws.headerFooter = { oddFooter: '&C' + (project.name || '报价核价单') + '　第 &P 页 / 共 &N 页' };
    return wb;
  }


  /* ---------- 加班费明细 ---------- */
  function buildOvertimeWorkbook(ExcelJS, project, settings) {
    settings = settings || {};
    var wb = newWorkbook(ExcelJS, settings);
    var ws = wb.addWorksheet('加班费明细', { properties: { defaultRowHeight: 20 } });
    var HEAD = ['日期', '序号', '职位 / 部门', '人数', '姓名', '加班费时间', '收工时间', '加班时长', '加班费单价', '合计', '备注'];
    var W = [13, 6, 13, 6, 18, 13, 15, 10, 11, 12, 34];
    var LAST = HEAD.length;
    title(ws, (project.name || '') + '　加班费明细', LAST);
    merge(ws, 2, 1, 2, LAST, dateStr(project.shootDate) + '　' + (project.location || ''), { font: font(10, false, 'FF6B7280'), left: true, border: false });
    widths(ws, W);
    HEAD.forEach(function (h, i) {
      cell(ws, 3, i + 1, h, { font: font(10, true), fill: AMBER, align: { horizontal: 'center', vertical: 'middle', wrapText: true } });
    });
    ws.getRow(3).height = 30;
    var rows = project.overtime || [], r = 4, total = 0;
    rows.forEach(function (row, i) {
      var amount = M.round2(M.num(row.hours) * M.num(row.rate));
      total += amount;
      var vals = [row.date || '', i + 1, row.dept || '', M.num(row.headcount), row.name || '', row.start || '', row.end || '', M.num(row.hours), M.num(row.rate), amount, row.note || ''];
      vals.forEach(function (v, c) {
        cell(ws, r, c + 1, v, { font: font(10), numFmt: c === 9 ? '#,##0.00' : undefined, left: c === 10, align: c === 10 ? { horizontal: 'left', vertical: 'middle', wrapText: true } : undefined });
      });
      ws.getRow(r).height = row.name && String(row.name).length > 12 ? 30 : 22;
      r += 1;
    });
    if (!rows.length) { merge(ws, r, 1, r, LAST, '暂无加班记录', { font: font(10, false, 'FF9CA3AF'), align: { horizontal: 'center' } }); r += 1; }
    merge(ws, r, 1, r, 9, '统计：', { font: font(11, true), fill: LAMBER, align: { horizontal: 'right', vertical: 'middle' } });
    cell(ws, r, 10, M.round2(total), { font: font(11, true), fill: LAMBER, numFmt: '#,##0.00' });
    cell(ws, r, 11, '', { fill: LAMBER });
    ws.getRow(r).height = 26;
    r += 2;
    merge(ws, r, 1, r, LAST, '制表人：' + (settings.preparer || '') + '　　　　复核：　　　　　　　　日期：　　　　年　　月　　日', { font: font(10), left: true, border: false });
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.25 } };
    ws.headerFooter = { oddFooter: '&C' + (project.name || '加班费明细') + '　第 &P 页 / 共 &N 页' };
    return wb;
  }

  /* ---------- 交通费报销 ---------- */
  function buildExpensesWorkbook(ExcelJS, project, settings) {
    settings = settings || {};
    var wb = newWorkbook(ExcelJS, settings);
    var ws = wb.addWorksheet('交通费报销', { properties: { defaultRowHeight: 20 } });
    var HEAD = ['日期', '序号', '职位 / 部门', '人数', '姓名', '费用类型', '同乘人', '前往时间', '离开时间', '前往费用', '停车费', '过路费', '离开费用', '小计', '备注'];
    var W = [13, 6, 13, 6, 16, 10, 16, 11, 13, 10, 8, 8, 10, 11, 30];
    var LAST = HEAD.length;
    title(ws, (project.name || '') + '　交通费报销明细', LAST);
    merge(ws, 2, 1, 2, LAST, dateStr(project.shootDate) + '　' + (project.location || ''), { font: font(10, false, 'FF6B7280'), left: true, border: false });
    widths(ws, W);
    HEAD.forEach(function (h, i) {
      cell(ws, 3, i + 1, h, { font: font(10, true), fill: AMBER, align: { horizontal: 'center', vertical: 'middle', wrapText: true } });
    });
    ws.getRow(3).height = 30;
    var rows = project.expenses || [], r = 4, total = 0;
    rows.forEach(function (row, i) {
      var sub = M.round2(M.num(row.goCost) + M.num(row.parking) + M.num(row.toll) + M.num(row.leaveCost));
      total += sub;
      var vals = [row.date || '', i + 1, row.dept || '', M.num(row.headcount), row.name || '', row.type === 'ride' ? '网约车' : '器材运输', row.passengers || '', row.goTime || '', row.leaveTime || '', M.num(row.goCost), M.num(row.parking), M.num(row.toll), M.num(row.leaveCost), sub, row.note || ''];
      vals.forEach(function (v, c) {
        cell(ws, r, c + 1, v, { font: font(10), numFmt: c >= 9 && c <= 13 ? '#,##0.00' : undefined, left: c === 14, align: c === 14 ? { horizontal: 'left', vertical: 'middle', wrapText: true } : undefined });
      });
      r += 1;
    });
    if (!rows.length) { merge(ws, r, 1, r, LAST, '暂无报销记录', { font: font(10, false, 'FF9CA3AF'), align: { horizontal: 'center' } }); r += 1; }
    merge(ws, r, 1, r, 13, '统计：', { font: font(11, true), fill: LAMBER, align: { horizontal: 'right', vertical: 'middle' } });
    cell(ws, r, 14, M.round2(total), { font: font(11, true), fill: LAMBER, numFmt: '#,##0.00' });
    cell(ws, r, 15, '', { fill: LAMBER });
    ws.getRow(r).height = 26;
    r += 2;
    merge(ws, r, 1, r, LAST, '制表人：' + (settings.preparer || '') + '　　　　复核：　　　　　　　　日期：　　　　年　　月　　日', { font: font(10), left: true, border: false });
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.25 } };
    ws.headerFooter = { oddFooter: '&C' + (project.name || '交通费报销') + '　第 &P 页 / 共 &N 页' };
    return wb;
  }


  /* ---------- 费用汇总（加班 + 报销） ---------- */
  function buildSummaryWorkbook(ExcelJS, projects, settings, scopeLabel) {
    settings = settings || {};
    var wb = newWorkbook(ExcelJS, settings);
    var ws = wb.addWorksheet('费用汇总', { properties: { defaultRowHeight: 20 } });
    var HEADS = ['项目', '拍摄日期', '加班条数', '加班时长', '加班费', '报销条数', '报销合计', '合计费用'];
    var W = [34, 13, 9, 10, 12, 9, 12, 12];
    title(ws, '项目费用汇总（加班 + 报销）', HEADS.length);
    merge(ws, 2, 1, 2, HEADS.length, (scopeLabel || '') + '　' + new Date().toLocaleDateString('zh-CN'), { font: font(10, false, 'FF6B7280'), left: true, border: false });
    widths(ws, W);
    var byProject = [], byDept = {}, byPerson = {};
    var tot = { hours: 0, otFee: 0, expense: 0, otCount: 0, exCount: 0 };
    projects.forEach(function (p) {
      var row = { name: p.name || '未命名项目', date: p.shootDate || '', hours: 0, otFee: 0, expense: 0, otCount: 0, exCount: 0 };
      (p.overtime || []).forEach(function (r) {
        var h = M.num(r.hours), fee = M.round2(h * M.num(r.rate));
        row.hours += h; row.otFee += fee; row.otCount += 1;
        var d = r.dept || '未分部门', n = (r.name || '') + (r.role ? '（' + r.role + '）' : '');
        byDept[d] = byDept[d] || { hours: 0, otFee: 0, expense: 0 };
        byDept[d].hours += h; byDept[d].otFee += fee;
        byPerson[n] = byPerson[n] || { dept: d, hours: 0, otFee: 0, expense: 0 };
        byPerson[n].hours += h; byPerson[n].otFee += fee;
      });
      (p.expenses || []).forEach(function (r) {
        var sub = M.round2(M.num(r.goCost) + M.num(r.parking) + M.num(r.toll) + M.num(r.leaveCost));
        row.expense += sub; row.exCount += 1;
        var d = r.dept || '未分部门', n = (r.name || '') + (r.role ? '（' + r.role + '）' : '');
        byDept[d] = byDept[d] || { hours: 0, otFee: 0, expense: 0 };
        byDept[d].expense += sub;
        byPerson[n] = byPerson[n] || { dept: d, hours: 0, otFee: 0, expense: 0 };
        byPerson[n].expense += sub;
      });
      byProject.push(row);
      tot.hours += row.hours; tot.otFee += row.otFee; tot.expense += row.expense; tot.otCount += row.otCount; tot.exCount += row.exCount;
    });
    var r = 3;
    function section(title) {
      merge(ws, r, 1, r, HEADS.length, title, { font: font(10.5, true), fill: LAMBER, left: true });
      ws.getRow(r).height = 22; r += 1;
    }
    function tableHeads(arr, widthsArr) {
      arr.forEach(function (h, i) { cell(ws, r, i + 1, h, { font: font(10, true), fill: AMBER, align: { horizontal: 'center' } }); });
      ws.getRow(r).height = 22; r += 1;
    }
    function tableRow(vals, fmts, bold) {
      vals.forEach(function (v, i) {
        cell(ws, r, i + 1, v, { font: font(10, !!bold), numFmt: fmts && fmts[i] || undefined, left: i === 0, align: i === 0 ? { horizontal: 'left' } : undefined });
      });
      r += 1;
    }
    section('一、汇总');
    tableHeads(['加班条数', '加班时长', '加班费', '报销条数', '报销合计', '合计费用'], null);
    tableRow([tot.otCount, M.round2(tot.hours), M.round2(tot.otFee), tot.exCount, M.round2(tot.expense), M.round2(tot.otFee + tot.expense)], [null, '#,##0', '#,##0.00', null, '#,##0.00', '#,##0.00'], true);
    r += 1;
    section('二、按项目');
    tableHeads(HEADS, W);
    byProject.forEach(function (row) {
      tableRow([row.name, row.date, row.otCount, M.round2(row.hours), M.round2(row.otFee), row.exCount, M.round2(row.expense), M.round2(row.otFee + row.expense)], [null, null, null, '#,##0', '#,##0.00', null, '#,##0.00', '#,##0.00']);
    });
    r += 1;
    section('三、按部门');
    tableHeads(['部门 / 组', '加班时长', '加班费', '报销合计', '合计'], null);
    Object.keys(byDept).sort().forEach(function (d) {
      var x = byDept[d];
      tableRow([d, M.round2(x.hours), M.round2(x.otFee), M.round2(x.expense), M.round2(x.otFee + x.expense)], [null, '#,##0', '#,##0.00', '#,##0.00', '#,##0.00']);
    });
    r += 1;
    section('四、按人员');
    tableHeads(['姓名', '部门', '加班时长', '加班费', '报销合计', '合计'], null);
    Object.keys(byPerson).sort(function (a, b) {
      var x = byPerson[a], y = byPerson[b];
      return (y.otFee + y.expense) - (x.otFee + x.expense);
    }).forEach(function (n) {
      var x = byPerson[n];
      tableRow([n, x.dept, M.round2(x.hours), M.round2(x.otFee), M.round2(x.expense), M.round2(x.otFee + x.expense)], [null, null, '#,##0', '#,##0.00', '#,##0.00', '#,##0.00']);
    });
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.25 } };
    return wb;
  }

  return {
    buildQuoteWorkbook: buildQuoteWorkbook,
    buildApprovedWorkbook: buildApprovedWorkbook,
    buildCombinedWorkbook: buildCombinedWorkbook,
    buildOvertimeWorkbook: buildOvertimeWorkbook,
    buildExpensesWorkbook: buildExpensesWorkbook,
    buildSummaryWorkbook: buildSummaryWorkbook,
    buildProfitWorkbook: buildProfitWorkbook,
    buildOutboundWorkbook: buildOutboundWorkbook,
    downloadWorkbook: downloadWorkbook,
    printQuote: function (project, settings) { return openPrint(printQuote(project, settings)); },
    printOutbound: function (project) { return openPrint(printOutbound(project)); },
    safeName: safeName
  };
});
