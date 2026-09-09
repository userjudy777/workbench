/* 主升浪选股模块（云端版专用）
 * 读取随云端一起发布的静态报告 JSON（reports/index.json → screen_result_YYYYMMDD.json）
 * 无需后端脚本，Mac 关机也能查看最近一期报告
 */
(function () {
  'use strict';

  var MIN_SCORE = 59;

  // 10 条主升浪条件 → JSON 字段映射
  var CONDITIONS = [
    { key: 'ma_bullish',       label: '所有均线多头排列（9条线）' },
    { key: 'rising_3d',        label: '连涨三天' },
    { key: 'vol_3x_maintain',  label: '成交量放大3倍以上并维持' },
    { key: 'macd_golden',      label: 'MACD金叉向上' },
    { key: 'macd_near_zero',   label: 'MACD位于0轴附近' },
    { key: 'sar_red',          label: 'SAR红点（多头趋势）' },
    { key: 'break_resistance', label: '突破前期阻力位（近一年高位）' },
    { key: 'along_boll_upper', label: '沿布林上轨运行' },
    { key: 'zjtj_purple',      label: '庄家抬轿指标高度控盘（ZJTJ）' },
    { key: 'limit_up',         label: '涨停板启动' },
    { key: 'multi_resonance',  label: '日线/周线/月线共振向上' },
    { key: 'leader_hotspot',   label: '强势龙头与持续热点' }
  ];

  var reports = [];       // [{date, file}] 按日期降序
  var currentData = null; // 当前加载的报告

  // ---------- 工具 ----------
  function $(id) { return document.getElementById(id); }

  function fmtDate(dateStr) {
    var p = dateStr.split('-');
    return parseInt(p[0], 10) + '年' + parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
  }

  function todayStr() {
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function isWeekday(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var w = d.getDay();
    return w >= 1 && w <= 5;
  }

  function pctClass(v) { return v > 0 ? 'mm-up' : (v < 0 ? 'mm-down' : ''); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- 注入样式 ----------
  var css = [
    '.mm-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;}',
    '.mm-date-select{padding:6px 10px;border:1px solid var(--border,#e2e8f0);border-radius:8px;background:var(--bg-card,#fff);color:var(--text,#1e293b);font-size:14px;}',
    '.mm-refresh-btn{padding:6px 14px;border:1px solid var(--primary,#4f46e5);border-radius:8px;background:var(--primary-light,#eef2ff);color:var(--primary,#4f46e5);font-size:13px;cursor:pointer;}',
    '.mm-meta{font-size:13px;color:var(--text-secondary,#64748b);}',
    '.mm-stale{background:#fff7ed;border:1px solid #fdba74;color:#9a3412;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:14px;line-height:1.6;}',
    '.mm-qualified{background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:14px;font-weight:600;}',
    '.mm-none{background:#f8fafc;border:1px dashed var(--border,#cbd5e1);color:var(--text-secondary,#64748b);border-radius:10px;padding:14px;font-size:14px;margin-bottom:14px;text-align:center;}',
    '.mm-card{background:var(--bg-card,#fff);border:1px solid var(--border,#e2e8f0);border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);}',
    '.mm-card-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;}',
    '.mm-name{font-size:17px;font-weight:700;color:var(--text,#1e293b);}',
    '.mm-code{font-size:12px;color:var(--text-secondary,#94a3b8);font-family:monospace;}',
    '.mm-score{margin-left:auto;font-size:20px;font-weight:800;color:#dc2626;}',
    '.mm-score small{font-size:11px;font-weight:400;color:var(--text-secondary,#94a3b8);}',
    '.mm-quote{font-size:13px;width:100%;color:var(--text-secondary,#64748b);margin-bottom:10px;}',
    '.mm-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
    '@media(max-width:600px){.mm-cols{grid-template-columns:1fr;}}',
    '.mm-col{border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.9;}',
    '.mm-col-hit{background:#fef2f2;border:1px solid #fecaca;}',
    '.mm-col-miss{background:#f8fafc;border:1px solid var(--border,#e2e8f0);}',
    '.mm-col-title{font-weight:700;margin-bottom:4px;}',
    '.mm-col-hit .mm-col-title{color:#dc2626;}',
    '.mm-col-miss .mm-col-title{color:#64748b;}',
    '.mm-li{display:flex;gap:6px;}',
    '.mm-li .ico{flex-shrink:0;}',
    '.mm-loading{padding:30px;text-align:center;color:var(--text-secondary,#94a3b8);font-size:14px;}',
    '.mm-error{padding:30px;text-align:center;color:#dc2626;font-size:14px;line-height:1.8;}'
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ---------- 渲染 ----------
  function renderStockCard(s) {
    var c = s.conditions || {};
    var hits = [], miss = [];
    CONDITIONS.forEach(function (cond) {
      if (c[cond.key]) hits.push(cond.label);
      else miss.push(cond.label);
    });
    var change = s.change_percent || c.change_pct || 0;
    var hitHtml = hits.length
      ? hits.map(function (t) { return '<div class="mm-li"><span class="ico">✅</span><span>' + esc(t) + '</span></div>'; }).join('')
      : '<div class="mm-li">（无）</div>';
    var missHtml = miss.length
      ? miss.map(function (t) { return '<div class="mm-li"><span class="ico">❌</span><span>' + esc(t) + '</span></div>'; }).join('')
      : '<div class="mm-li">（无）</div>';
    return '' +
      '<div class="mm-card">' +
        '<div class="mm-card-head">' +
          '<span class="mm-name">' + esc(s.name) + '</span>' +
          '<span class="mm-code">' + esc(s.code) + '</span>' +
          '<span class="mm-score">' + (c.score || 0) + ' <small>/ 100 分</small></span>' +
        '</div>' +
        '<div class="mm-quote">' +
          '现价 <b>' + esc(s.price) + '</b>　' +
          '涨幅 <b class="' + pctClass(change) + '">' + (change > 0 ? '+' : '') + change + '%</b>　' +
          '换手 ' + esc(s.turnover_rate) + '%　' +
          '成交额 ' + (typeof s.amount_yi === 'number' ? s.amount_yi.toFixed(2) : esc(s.amount_yi)) + ' 亿' +
        '</div>' +
        '<div class="mm-cols">' +
          '<div class="mm-col mm-col-hit"><div class="mm-col-title">命中条件（' + hits.length + '）</div>' + hitHtml + '</div>' +
          '<div class="mm-col mm-col-miss"><div class="mm-col-title">不命中条件（' + miss.length + '）</div>' + missHtml + '</div>' +
        '</div>' +
      '</div>';
  }

  function renderReport(data) {
    currentData = data;
    var container = $('momentumContainer');
    var repDate = data.date || (reports[0] && reports[0].date) || '';
    var stocks = data.stocks || [];
    var qualified = stocks.filter(function (s) { return (s.conditions && s.conditions.score || 0) >= MIN_SCORE; });

    var html = '';

    // 报告新鲜度提示：报告日期早于今天（且今天是工作日）→ 提示为最近一期
    var today = todayStr();
    if (repDate && repDate !== today && isWeekday(today)) {
      html += '<div class="mm-stale">⏰ 当前展示的是 <b>' + fmtDate(repDate) + '</b> 的最近一期报告。今日（' + fmtDate(today) + '）报告尚未更新——可能是电脑未开机，选股任务还没跑。这份报告仍可作为参考，开机联网后任务会自动补跑并更新到云端。</div>';
    }

    html += '<div class="mm-qualified">🎯 ' + fmtDate(repDate) + ' 达标标的（得分 ≥ ' + MIN_SCORE + '）：<b>' + qualified.length + '</b> 只 / 候选池 ' + (data.candidate_count || stocks.length) + ' 只</div>';

    if (qualified.length) {
      qualified.forEach(function (s) { html += renderStockCard(s); });
    } else {
      html += '<div class="mm-none">今日无达标标的（得分 ≥ ' + MIN_SCORE + '），以下为得分最高的前 3 名供参考：</div>';
      stocks.slice(0, 3).forEach(function (s) { html += renderStockCard(s); });
    }
    container.innerHTML = html;
    $('momentumUpdateTime').textContent = '报告日期 ' + repDate;
  }

  function loadReport(idx) {
    var container = $('momentumContainer');
    var rep = reports[idx];
    if (!rep) return;
    container.innerHTML = '<div class="mm-loading">加载 ' + fmtDate(rep.date) + ' 报告中...</div>';
    // index.json 里存的是纯文件名，实际文件位于 reports/ 目录下
    var url = rep.file.indexOf('/') >= 0 ? rep.file : 'reports/' + rep.file;
    fetch(url + '?t=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(renderReport)
      .catch(function (e) {
        container.innerHTML = '<div class="mm-error">报告加载失败：' + esc(e.message) + '<br>请点击"重新加载"重试</div>';
      });
  }

  function loadIndex() {
    var container = $('momentumContainer');
    container.innerHTML = '<div class="mm-loading">加载主升浪选股报告中...</div>';
    fetch('reports/index.json?t=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        reports = (data.reports || []).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        if (!reports.length) throw new Error('云端暂无任何报告');
        // 填充日期选择器
        var sel = $('momentumDateSelect');
        sel.innerHTML = reports.map(function (r, i) {
          return '<option value="' + i + '">' + r.date + (i === 0 ? '（最新）' : '') + '</option>';
        }).join('');
        loadReport(0);
      })
      .catch(function (e) {
        container.innerHTML = '<div class="mm-error">暂无报告数据（' + esc(e.message) + '）<br>报告由电脑端 09:45 自动化任务生成并发布到云端，开机联网后即可更新。</div>';
      });
  }

  // ---------- 入口（懒加载） ----------
  function init() {
    var navBtn = document.querySelector('.nav-item[data-view="momentum"]');
    if (!navBtn) return;
    var loaded = false;
    navBtn.addEventListener('click', function () {
      if (!loaded) { loaded = true; loadIndex(); }
    });
    var sel = $('momentumDateSelect');
    if (sel) sel.addEventListener('change', function () { loadReport(parseInt(sel.value, 10)); });
    var btn = $('momentumReloadBtn');
    if (btn) btn.addEventListener('click', loadIndex);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
