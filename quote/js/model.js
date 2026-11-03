/* model.js — 纯计算逻辑：三套价（底价/报价/核价）+ 返点 + 利润（浏览器 + node 通用） */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EQModel = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var round2 = function (n) {
    var x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
  };
  var num = function (v, d) {
    var n = Number(v);
    return isFinite(n) ? n : (d === undefined ? 0 : d);
  };
  var toInt = function (v, d) { return Math.round(num(v, d)); };

  function normalizeName(s) {
    return String(s || '')
      .replace(/[（(]/g, '(')
      .replace(/[）)]/g, ')')
      .replace(/＋/g, '+')
      .replace(/[＊]/g, '*')
      .replace(/[－]/g, '-')
      .replace(/[\s\u3000]+/g, '')
      .toLowerCase();
  }

  function money(n, withSymbol) {
    var v = round2(n);
    var s = v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (withSymbol === false ? '' : '¥') + s;
  }

  function lineDays(project) { return Math.max(1, toInt(project && project.days, 1)); }

  /* 价格链：底价 → 报价（+加价率）→ 核价（-核价砍价率） */
  function qtyDays(project, item) { return num(item.qty) * lineDays(project); }
  function lineBottom(item, project) { return round2(qtyDays(project, item) * num(item.bottom)); }
  function lineQuote(item, project) { return round2(qtyDays(project, item) * num(item.quote)); }
  function lineApproved(item, project) { return round2(qtyDays(project, item) * num(item.approved)); }

  function rebateRateOf(item, project) {
    var r = item.rebateRate;
    if (r === undefined || r === null || r === '') r = project.rebateRate;
    return num(r, 0);
  }
  function lineRebate(item, project) { return round2(lineBottom(item, project) * rebateRateOf(item, project)); }
  /* 我的利润 = 公司核价 - 底价 + 供应商返点 */
  function lineProfit(item, project) { return round2(lineApproved(item, project) - lineBottom(item, project) + lineRebate(item, project)); }

  /* 按项目默认比例，从底价推导报价和核价 */
  function derivePrices(item, project) {
    var bottom = num(item.bottom);
    var markup = project.markupRate === undefined ? 0.30 : num(project.markupRate);
    var cut = project.cutRate === undefined ? 0.20 : num(project.cutRate);
    item.quote = round2(bottom * (1 + markup));
    item.approved = round2(item.quote * (1 - cut));
    return item;
  }

  function groupTotals(group, project) {
    var t = { bottom: 0, quote: 0, approved: 0, profit: 0, rebate: 0, qty: 0, count: 0 };
    if (group.pkg) {
      var q = pkgQty(group);
      t.quote = round2(num(group.pkgQuote) * q);
      t.bottom = round2(num(group.pkgBottom) * q);
      t.approved = round2(num(group.pkgApproved) * q);
      t.rebate = round2(num(group.pkgBottom) * q * num(project.rebateRate));
      t.profit = round2(t.approved - t.bottom + t.rebate);
      t.qty = q; t.count = (group.items || []).length; t.pkg = true;
      return t;
    }
    (group.items || []).forEach(function (it) {
      t.bottom += lineBottom(it, project);
      t.quote += lineQuote(it, project);
      t.approved += lineApproved(it, project);
      t.profit += lineProfit(it, project);
      t.qty += num(it.qty);
      t.count += 1;
    });
    ['bottom', 'quote', 'approved', 'profit', 'rebate'].forEach(function (k) { t[k] = round2(t[k]); });
    return t;
  }

  function pkgQty(g) { return num(g.pkgQty, 1) || 1; }
  function totals(project) {
    var t = { bottom: 0, quote: 0, approved: 0, rebate: 0, profit: 0, qty: 0, lines: 0, crewQty: 0 };
    (project.groups || []).forEach(function (g) {
      if (g.pkg) {
        var gt = groupTotals(g, project);
        t.bottom += gt.bottom; t.quote += gt.quote; t.approved += gt.approved;
        t.rebate += gt.rebate; t.profit += gt.profit;
        t.qty += gt.qty; t.lines += 1;
        (g.items || []).forEach(function (it) { if (it.type === 'crew') t.crewQty += num(it.qty); });
        return;
      }
      (g.items || []).forEach(function (it) {
        t.bottom += lineBottom(it, project);
        t.quote += lineQuote(it, project);
        t.approved += lineApproved(it, project);
        t.rebate += lineRebate(it, project);
        t.profit += lineProfit(it, project);
        t.qty += num(it.qty);
        t.lines += 1;
        if (it.type === 'crew') t.crewQty += num(it.qty);
      });
    });
    var taxRate = num(project.taxRate, 0);
    var tax = round2(t.quote * taxRate);
    ['bottom', 'quote', 'approved', 'rebate', 'profit'].forEach(function (k) { t[k] = round2(t[k]); });
    t.taxRate = taxRate;
    t.tax = tax;
    t.quoteTotal = round2(t.quote + tax);
    t.profitRateBottom = t.bottom > 0 ? round2(t.profit / t.bottom * 100) : 0;   // 对底价的利润率
    t.profitRateApproved = t.approved > 0 ? round2(t.profit / t.approved * 100) : 0; // 对核价的利润率
    t.profitRateQuote = t.quote > 0 ? round2(t.profit / t.quote * 100) : 0;
    t.groupCount = (project.groups || []).length;
    return t;
  }

  /* 出库合并：同型号器材跨机位合并，人员不计入出库 */
  function outbound(project) {
    var map = new Map();
    var crewQty = 0;
    var groups = [];
    (project.groups || []).forEach(function (g) {
      var gLines = [];
      (g.items || []).forEach(function (it) {
        if (it.type === 'crew') { crewQty += num(it.qty); return; }
        var key = normalizeName(it.name);
        var o = map.get(key);
        if (!o) {
          o = { key: key, name: it.name, unit: it.unit || '个', cat: it.cat || '其他', qty: 0, groups: [] };
          map.set(key, o);
        }
        o.qty += num(it.qty);
        var hit = o.groups.filter(function (x) { return x.name === g.name; })[0];
        if (hit) hit.qty += num(it.qty);
        else o.groups.push({ name: g.name, qty: num(it.qty) });
        gLines.push({ name: it.name, unit: it.unit || '个', qty: num(it.qty), note: it.note || '' });
      });
      groups.push({ name: g.name, items: gLines });
    });
    var lines = Array.from(map.values()).sort(function (a, b) {
      var c = String(a.cat).localeCompare(String(b.cat), 'zh');
      return c !== 0 ? c : b.qty - a.qty;
    });
    return {
      lines: lines, groups: groups,
      totalQty: lines.reduce(function (s, l) { return s + l.qty; }, 0),
      crewQty: crewQty, lineCount: lines.length
    };
  }

  /* 库存校验：仅当器材库里的 stock 有值时才提示 */
  function stockIssues(project, catalog) {
    var byName = new Map();
    (catalog || []).forEach(function (e) { byName.set(normalizeName(e.name), e); });
    var agg = new Map();
    (project.groups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) {
        if (it.type === 'crew') return;
        var key = normalizeName(it.name);
        agg.set(key, (agg.get(key) || 0) + num(it.qty));
      });
    });
    var issues = [];
    agg.forEach(function (qty, key) {
      var e = byName.get(key);
      if (!e) return;
      if (e.stock === null || e.stock === undefined || e.stock === '') return;
      var st = num(e.stock);
      if (qty > st) issues.push({ name: e.name, need: qty, stock: st, short: qty - st });
    });
    return issues;
  }

  function zeroPriceLines(project) {
    var out = [];
    (project.groups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) {
        if (!(num(it.quote) > 0)) out.push({ group: g.name, name: it.name, qty: it.qty });
      });
    });
    return out;
  }

  function sumQty(project) {
    return (project.groups || []).reduce(function (s, g) {
      return s + (g.items || []).reduce(function (x, i) { return x + num(i.qty); }, 0);
    }, 0);
  }


  /* ---------- 器材分类识别 ---------- */
  var CAT_RULES = [
    [/(遮光斗|matte ?box)/i, '遮光斗/配件'],
    [/(滤镜|镜片|nd\b|\bnd\d|偏振|偏光|柔光镜|黑柔|白柔|拉丝|黑魔法|棱镜|菱镜|渐变|星光|放大镜|柔焦|雾镜|红外|清玻璃|玻璃)/i, '滤镜'],
    [/(内存卡|存储卡|cfexpress|sd卡|a卡|ssd|读卡器|tough|cf卡|固态硬盘)/i, '存储卡'],
    [/(电池|v口|bp-|电瓶|充电器|移动电源|电小二)/i, '电池'],
    [/(监视器|监视屏|录机|small ?hd|atomos|阿童木|shogun|导演.*(监视|电视)|电视|大监视)/i, '监视器'],
    [/(图传|图存|transmission|vaxis|威固|致讯|猛玛|hollyland|无线视频)/i, '图传'],
    [/(如影4d|4d-6k|4d-8k)/i, '摄影机'],
    [/(控台)/i, '灯光控台'],
    [/(节摇|钢脚|海螺拉|万向脚|04脚|灯脚|布架脚|魔术腿|吊灯杆|炮脚|摇脚|绞脚|矮脚|钢架|铝脚|c-stand|灯架)/i, '灯架/钢脚'],
    [/(旗板|柔光布|柔光罩|反光板|柔光屏|柔光箱|抛物线|深口|蛋格|打影板|成像头|透镜)/i, '柔光/旗板'],
    [/(黑布|布架|遮光布|沙包|散黑布|格仔布|蓝布|绿布|反布|反光布|单纱|双纱|丝布|太阳伞)/i, '布景/沙包'],
    [/(skypanel|sky ?panel|gemini|s360|布灯|气垫|柔光灯)/i, '柔光灯'],
    [/(led|rgb|灯管|灯箱|筒灯|头灯|爱图仕|南光|神牛|aputure|arri-s|s60|p600|600x|600d|300x|300d|1200x|2400|mg6k|6k|xt52|xt26|700x|b600c|60b|spotlight|泰坦|4尺4支)/i, 'LED灯'],
    [/(\bm\d{2,3}\b|\d+(\.\d+)?k(hf|s)?\b|\d{3,4}(hf|s|p|wpf)\b|镝|钨丝|聚光灯)/i, '聚光灯/镝灯'],
    [/(灯|调光)/i, '灯光设备'],
    [/(电箱|大蛇|电源线|32a|16a|过线板|电缆|飞机头|插头|配电|dc[ -]?\d|发电机)/i, '电源/线材'],
    [/(稳定器|如影|ronin|rs ?[234]|rs[234]|movi|智云|斯坦尼康|飞宇|gimbal|三轴)/i, '稳定器/承载'],
    [/(三脚架|脚架|云台|轨道|滑轨|车拍|板车|摇臂|伸缩炮|飞猫|索道|高脚|低脚|平衡车|滑板|脚轮|底座|支架|液压|快装|兔笼|套件|肩托|背心|手柄|摇轮车|高台|铝梯|撑杆|横梁|九头蛇|移动|航架|伸缩杆|oconnor|2575)/i, '支撑/移动'],
    [/(跟焦|wcu|focus|摇轮|控制器|马达|手轮|控制手柄)/i, '跟焦/控制'],
    [/(摄影机|机身|相机|camera|alexa|amira|venice|komodo|raptor|fx3|fx5|fx6|fx9|fx30|c300|c400|c500|c70|bmpcc|ursa|z ?cam|如影4d|4d-6k|a7s|a7m|a7r|5d[234]|f55|f5\b|scarlet|raven|小武器|红乌鸦|atrion|御 ?[34]|osmo|pocket|cinema|eos|cine ?alta)/i, '摄影机'],
    [/(镜头|lens|定焦|变焦|广角|微距|长焦|鱼眼|变形宽银幕|anamorphic|master prime|mp\b|pl\b|summicron|summilux|angenieux|安琴|zeiss|蔡司|leica|莱卡|g大师|cn-e|art\b|cooke|库克|optimo|老蛙|三阳|图丽|适马|sigma|contax|增倍镜|\d+\s*mm|\d+-\d+)/i, '镜头'],
    [/(录音|麦克风|话筒|挑杆|时码|时间码|同步器|音频|声卡|无线麦|小蜜蜂|通话|对讲|猛犸|三方)/i, '录音/音频'],
    [/(胶带|大力胶|黑卡纸|泡沫板|白卡|色卡|耗材)/i, '耗材']
  ];
  function classifyName(name, type) {
    if (type === 'crew') return '人员';
    var n = String(name || '');
    for (var i = 0; i < CAT_RULES.length; i++) {
      if (CAT_RULES[i][0].test(n)) return CAT_RULES[i][1];
    }
    return '其他配件';
  }

  return {
    round2: round2,
    classifyName: classifyName, num: num, int: toInt, normalizeName: normalizeName, money: money,
    lineDays: lineDays,
    lineBottom: lineBottom, lineQuote: lineQuote, lineApproved: lineApproved,
    lineRebate: lineRebate, lineProfit: lineProfit, rebateRateOf: rebateRateOf,
    derivePrices: derivePrices,
    groupTotals: groupTotals, totals: totals, outbound: outbound,
    stockIssues: stockIssues, zeroPriceLines: zeroPriceLines, sumQty: sumQty
  };
});
