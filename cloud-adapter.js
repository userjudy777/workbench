/**
 * Cloud Adapter - Intercept all /api/ calls and handle them client-side
 * Enables the workbench to run as a pure static site (no backend needed)
 *
 * API access strategy:
 * - Sina stock list: Direct fetch (CORS supported, GBK encoded)
 * - Tencent K-line: Direct fetch (CORS supported, UTF-8)
 * - East Money datacenter: Direct fetch (CORS supported, UTF-8)
 * - Sina finance news: JSONP (CORS not supported, but JSONP works)
 * - East Money news: JSONP (CORS not supported, but JSONP works)
 * - Indices: Via Tencent K-line API (CORS supported)
 */

// ==================== Utility: JSONP Loader ====================
function jsonp(url, callbackParam) {
  callbackParam = callbackParam || 'callback';
  return new Promise(function(resolve, reject) {
    // 新浪接口只允许字母数字回调名（下划线会报 "callback illegal character"）
    var cbName = 'jsonpCb' + Date.now() + Math.floor(Math.random() * 100000);
    var script = document.createElement('script');
    script.async = true;
    // 东财接口拒绝跨域 Referer，必须去掉引用来源（新浪同测无副作用）
    script.referrerPolicy = 'no-referrer';
    var timeout = setTimeout(function() {
      cleanup();
      reject(new Error('JSONP timeout'));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = function(data) {
      cleanup();
      resolve(data);
    };

    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    script.src = url + sep + callbackParam + '=' + cbName;
    script.onerror = function() {
      cleanup();
      reject(new Error('JSONP load error'));
    };
    document.head.appendChild(script);
  });
}

// ==================== Utility: GBK Fetch ====================
async function fetchGBK(url) {
  var resp = await fetch(url);
  var buffer = await resp.arrayBuffer();
  return new TextDecoder('gbk').decode(buffer);
}

// ==================== Utility: Format Time ====================
function formatTime(timestamp) {
  if (!timestamp) return '';
  var d = new Date(timestamp * 1000);
  var now = new Date();
  var pad = function(n) { return String(n).padStart(2, '0'); };
  var isToday = d.toDateString() === now.toDateString();
  var time = pad(d.getHours()) + ':' + pad(d.getMinutes());
  return isToday ? time : pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + time;
}

// ==================== Sina Stock List (CORS + GBK) ====================
async function fetchAllSinaA() {
  var pages = 60;
  var tasks = [];
  for (var p = 1; p <= pages; p++) {
    var url = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?node=hs_a&num=100&page=' + p + '&sort=changepercent&order=desc&_s_r_a=page';
    tasks.push(
      fetch(url)
        .then(function(r) { return r.arrayBuffer(); })
        .then(function(buf) {
          try {
            var text = new TextDecoder('gbk').decode(buf);
            return JSON.parse(text) || [];
          } catch(e) { return []; }
        })
        .catch(function() { return []; })
    );
  }
  var results = await Promise.all(tasks);
  return results.flat();
}

// ==================== Tencent K-line (CORS, UTF-8) ====================
async function fetchStockKline(symbol) {
  var market = 'sh';
  var pureCode = symbol;
  if (symbol.startsWith('sh')) { market = 'sh'; pureCode = symbol.slice(2); }
  else if (symbol.startsWith('sz')) { market = 'sz'; pureCode = symbol.slice(2); }
  else if (symbol.startsWith('bj')) { market = 'bj'; pureCode = symbol.slice(2); }
  else {
    if (symbol.startsWith('6') || symbol.startsWith('9') || symbol.startsWith('5')) market = 'sh';
    else market = 'sz';
    pureCode = symbol;
  }
  var fullCode = market + pureCode;
  var end = new Date().toISOString().slice(0, 10);
  var begin = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  try {
    var url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + fullCode + ',day,' + begin + ',' + end + ',15,qfq';
    var resp = await fetch(url);
    var d = await resp.json();
    var klines = (d.data && d.data[fullCode] && (d.data[fullCode].qfqday || d.data[fullCode].day)) || [];
    return klines.map(function(k) {
      return {
        date: k[0], open: parseFloat(k[1]), close: parseFloat(k[2]),
        high: parseFloat(k[3]), low: parseFloat(k[4]), volume: parseFloat(k[5])
      };
    });
  } catch(e) { return []; }
}

// ==================== East Money Company Profile (CORS, UTF-8) ====================
async function fetchCompanyProfile(code) {
  try {
    var url = 'https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_BASIC_ORGINFO&columns=ALL&filter=(SECURITY_CODE=%22' + code + '%22)';
    var resp = await fetch(url);
    var d = await resp.json();
    if (!d.success || !d.result || !d.result.data || !d.result.data.length) return null;
    var v = d.result.data[0];
    return {
      fullName: v.ORG_NAME || '',
      mainBusiness: (v.MAIN_BUSINESS || '').trim(),
      profile: (v.ORG_PROFILE || '').trim(),
      industry: v.INDUSTRYCSRC1 || v.EM2016 || '',
      industryEM: v.BOARD_NAME_LEVEL || '',
      listingDate: v.LISTING_DATE ? v.LISTING_DATE.slice(0, 10) : '',
      foundedDate: v.FOUND_DATE ? v.FOUND_DATE.slice(0, 10) : '',
      employees: v.EMP_NUM || null,
      actualHolder: v.ACTUAL_HOLDER || '',
      legalPerson: v.LEGAL_PERSON || '',
      province: v.PROVINCE || '',
      chairman: v.CHAIRMAN || '',
    };
  } catch(e) { return null; }
}

// ==================== Indices (via Tencent K-line, CORS) ====================
async function fetchIndices() {
  var indices = [
    { name: '上证指数', code: 'sh000001' },
    { name: '深证成指', code: 'sz399001' },
    { name: '创业板指', code: 'sz399006' },
    { name: '科创50', code: 'sh000688' },
  ];
  var results = await Promise.all(indices.map(async function(idx) {
    try {
      var klines = await fetchStockKline(idx.code);
      if (klines.length < 2) return { name: idx.name, code: idx.code, current: 0, change: 0, changePercent: 0, prevClose: 0, open: 0, high: 0, low: 0, volume: 0, amount: 0 };
      var last = klines[klines.length - 1];
      var prev = klines[klines.length - 2];
      var change = last.close - prev.close;
      var changePercent = prev.close > 0 ? (change / prev.close * 100) : 0;
      return {
        name: idx.name, code: idx.code,
        current: +last.close.toFixed(2),
        prevClose: +prev.close.toFixed(2),
        open: +last.open.toFixed(2),
        high: +last.high.toFixed(2),
        low: +last.low.toFixed(2),
        change: +change.toFixed(2),
        changePercent: +changePercent.toFixed(2),
        volume: last.volume || 0,
        amount: 0,
      };
    } catch(e) {
      return { name: idx.name, code: idx.code, current: 0, change: 0, changePercent: 0 };
    }
  }));
  return results;
}

// ==================== News: Sina Finance (JSONP) ====================
async function fetchSinaNews() {
  var url = 'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&k=&num=30&page=1';
  var data = await jsonp(url);
  var items = (data.result && data.result.data) || [];
  return items.map(function(item) {
    return {
      id: item.docid || '',
      title: item.title || '',
      content: item.summary || '',
      ctime: parseInt(item.ctime) || 0,
      timeStr: formatTime(parseInt(item.ctime)),
      shareUrl: item.url || '',
      stocks: [],
      subjects: [],
      readingNum: 0,
      commentNum: 0,
      isImportant: item.level === '1' || item.level === '2',
    };
  });
}

// ==================== News: East Money (JSONP) ====================
async function fetchEMNews() {
  var reqTrace = Date.now().toString();
  var url = 'https://np-listapi.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102&sortEnd=&pageSize=30&type=0&req_trace=' + reqTrace;
  var data = await jsonp(url);
  if (data.code !== '1' && data.code !== 1) throw new Error(data.message || 'EM API error');
  return (data.data && data.data.fastNewsList || []).map(function(item) {
    return {
      id: item.code,
      title: item.title || '',
      content: item.summary || '',
      showTime: item.showTime || '',
      timeStr: item.showTime || '',
      stocks: (item.stockList || []).map(function(s) { return s; }),
      shareCount: item.share || 0,
      commentCount: item.pinglun_Num || 0,
      isImportant: item.titleColor === 1 || (item.share || 0) >= 10,
      // 东财快讯详情页 URL 规律：https://finance.eastmoney.com/a/{code}.html
      shareUrl: item.code ? ('https://finance.eastmoney.com/a/' + item.code + '.html') : '',
    };
  });
}

// ==================== Analysis Logic (ported from server.js) ====================

function isZhangTing(s) {
  var code = s.code;
  var ch = parseFloat(s.changepercent) || 0;
  var name = s.name || '';
  var isST = name.startsWith('ST') || name.startsWith('*ST');
  if (code.startsWith('8') || code.startsWith('920')) return ch >= 29.9;
  if (code.startsWith('300') || code.startsWith('301') || code.startsWith('688')) return ch >= 19.9;
  if (isST) return ch >= 4.9;
  return ch >= 9.9;
}

function isDieTing(s) {
  var code = s.code;
  var ch = parseFloat(s.changepercent) || 0;
  var name = s.name || '';
  var isST = name.startsWith('ST') || name.startsWith('*ST');
  if (code.startsWith('8') || code.startsWith('920')) return ch <= -29.9;
  if (code.startsWith('300') || code.startsWith('301') || code.startsWith('688')) return ch <= -19.9;
  if (isST) return ch <= -4.9;
  return ch <= -9.9;
}

function getBoard(code) {
  if (code.startsWith('920') || (code.startsWith('8') && code.length === 6)) return '北交所';
  if (code.startsWith('300') || code.startsWith('301')) return '创业板';
  if (code.startsWith('688')) return '科创板';
  if (code.startsWith('60') || code.startsWith('603') || code.startsWith('605')) return '沪市主板';
  if (code.startsWith('00') || code.startsWith('001') || code.startsWith('002') || code.startsWith('003')) return '深市主板';
  return '其他';
}

function extractConcept(stock) {
  var name = stock.name || '';
  var conceptMap = {
    'AI/智能': ['AI', '智能', '机器人', '算力', '大模型', 'ChatGPT', '信邦', '科大', '拓尔思', '万兴'],
    '芯片半导体': ['芯片', '半导体', '集成电路', '存储', '封测', '光刻', '兆日', '昀冢', '中晶', '紫光', '北方华创'],
    '新能源车': ['新能源', '锂电', '电池', '充电桩', '汽车', '整车', '领湃', '比亚迪', '宁德'],
    '光伏储能': ['光伏', '太阳能', '储能', '隆基', '通威', '阳光电源'],
    '军工': ['军工', '航空', '航天', '船舶', '兵器', '中航', '航发'],
    '医药医疗': ['医药', '医疗', '生物', '药', '医院', '诊断', '中红', '信邦', '迈瑞', '药明'],
    '食品消费': ['白酒', '食品', '饮料', '零售', '消费', '餐饮', '家电', '一鸣', '西麦', '紫燕', '南侨', '安记', '李子园', '三元', '均瑶', '华天酒店', '酒'],
    '金融': ['银行', '证券', '保险', '金融', '华林', '中信', '招商'],
    '地产建筑': ['地产', '房地产', '物业', '建筑', '荣丰', '控股'],
    '教育': ['教育', '培训', '全通', '中公', '传智'],
    '数字货币': ['数字货币', '区块链', '加密', '数字'],
    '5G通信': ['5G', '通信', '光通信', '联通', '移动', '电信'],
    '游戏传媒': ['游戏', '传媒', '欢瑞', '电魂', '科传', '影视', '文旅'],
    '化工新材料': ['材料', '化学', '化工', '天晟', '赤天化', '金牛', '中盐', '万华'],
    '钢铁有色': ['钢铁', '钢', '有色', '铝', '铜', '锂', '稀土', '柳钢', '宝钢'],
    '电力能源': ['电力', '发电', '能源', '中电', '核电', '风电', '水电', '火电'],
    '电子元件': ['电子', '晶', '东晶', '科技', '微', '芯'],
    '环保': ['环保', '节能', '碳', '绿', '启环'],
    '农业': ['农业', '种业', '化肥', '牧原', '温氏'],
  };
  for (var concept in conceptMap) {
    var keywords = conceptMap[concept];
    for (var i = 0; i < keywords.length; i++) {
      if (name.indexOf(keywords[i]) >= 0) return concept;
    }
  }
  return null;
}

function calcConsecutiveLimitUp(klines, code) {
  if (!klines.length) return 0;
  var pureCode = (code || '').replace(/^(sh|sz|bj)/, '');
  var threshold = 9.9;
  if (pureCode.startsWith('8') || pureCode.startsWith('920')) threshold = 29.9;
  else if (pureCode.startsWith('300') || pureCode.startsWith('301') || pureCode.startsWith('688')) threshold = 19.9;
  var count = 0;
  for (var i = klines.length - 1; i > 0; i--) {
    var k = klines[i];
    var prev = klines[i - 1];
    if (!prev || prev.close === 0) break;
    var change = ((k.close - prev.close) / prev.close) * 100;
    if (change >= threshold) count++;
    else break;
  }
  return count;
}

function judgeSentiment(opts) {
  var up = opts.up, down = opts.down, limitUp = opts.limitUp, limitDown = opts.limitDown, maxBaner = opts.maxBaner;
  if (limitDown > 30 && maxBaner <= 1) return { phase: '冰点', strategy: '只看低吸试错，控制仓位', color: '#6b7280' };
  if (limitUp > 30 && maxBaner >= 5 && limitDown >= 5) return { phase: '分歧', strategy: '控仓 + 去弱留强', color: '#f59e0b' };
  if (maxBaner >= 3 && limitUp >= 50) return { phase: '加速', strategy: '可以主动进攻，顺势而为', color: '#ef4444' };
  if (maxBaner >= 2) return { phase: '回调', strategy: '可以试探性参与', color: '#10b981' };
  if (limitUp >= 30) return { phase: '升温', strategy: '关注新题材，谨慎参与', color: '#3b82f6' };
  return { phase: '低迷', strategy: '观望为主', color: '#6b7280' };
}

function pickHotStock(allStocks, skipCodes) {
  skipCodes = skipCodes || [];
  var candidates = allStocks
    .filter(function(s) {
      var name = (s.name || '').trim();
      var code = (s.code || '').trim();
      return !name.startsWith('ST') && !name.startsWith('*ST') &&
             !name.startsWith('N') && !name.startsWith('C') &&
             code.length === 6 && skipCodes.indexOf(code) < 0 &&
             !code.startsWith('8') && !code.startsWith('920');
    })
    .filter(function(s) { return parseFloat(s.amount || 0) >= 5e8; })
    .filter(function(s) { return parseFloat(s.turnoverratio || 0) >= 3; })
    .filter(function(s) {
      var chg = parseFloat(s.changepercent) || 0;
      return chg > 0 || isZhangTing(s);
    })
    .map(function(s) {
      var chg = parseFloat(s.changepercent) || 0;
      var amt = parseFloat(s.amount) || 0;
      var turnover = Math.min(parseFloat(s.turnoverratio) || 0, 30);
      var isLimitUp = isZhangTing(s);
      var score = chg * 0.35 + Math.log(amt / 1e8) * 0.2 + turnover * 0.15 + (isLimitUp ? 15 : 0) * 0.3;
      return { stock: s, score: +score.toFixed(2), chg: chg, amt: amt, turnover: turnover, isLimitUp: isLimitUp };
    })
    .sort(function(a, b) { return b.score - a.score; });
  return candidates.length > 0 ? candidates[0] : null;
}

function calcMA(klines, period) {
  if (klines.length < period) return null;
  var slice = klines.slice(-period);
  return +(slice.reduce(function(sum, k) { return sum + k.close; }, 0) / period).toFixed(2);
}

function calcRSI(klines, period) {
  period = period || 14;
  if (klines.length < period + 1) return 50;
  var gains = 0, losses = 0;
  for (var i = klines.length - period; i < klines.length; i++) {
    var change = klines[i].close - klines[i - 1].close;
    if (change >= 0) gains += change;
    else losses -= change;
  }
  var avgGain = gains / period;
  var avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  var rs = avgGain / avgLoss;
  return +(100 - (100 / (1 + rs))).toFixed(2);
}

function detectKlinePattern(klines) {
  if (klines.length < 1) return { pattern: '未知', desc: '' };
  var k = klines[klines.length - 1];
  var body = Math.abs(k.close - k.open);
  var totalRange = k.high - k.low;
  var upperShadow = k.high - Math.max(k.open, k.close);
  var lowerShadow = Math.min(k.open, k.close) - k.low;
  var bodyPct = k.open > 0 ? (body / k.open * 100) : 0;
  if (totalRange === 0) return { pattern: '十字星', desc: '开盘价与收盘价几乎相同，多空分歧' };
  if (bodyPct > 5 && k.close > k.open) return { pattern: '大阳线', desc: '实体涨幅>5%，多头强势' };
  if (bodyPct > 5 && k.close < k.open) return { pattern: '大阴线', desc: '实体跌幅>5%，空头强势' };
  if (bodyPct < 0.5) return { pattern: '十字星', desc: '多空分歧，方向待选择' };
  if (lowerShadow > body * 2 && k.close > k.open) return { pattern: '长下影阳线', desc: '下方有支撑，多头反攻' };
  if (upperShadow > body * 2 && k.close < k.open) return { pattern: '长上影阴线', desc: '上方有压力，空头占优' };
  if (lowerShadow > body * 2) return { pattern: '锤头线', desc: '探底回升，下方可能有支撑' };
  if (upperShadow > body * 2) return { pattern: '射击之星', desc: '冲高回落，上方压力大' };
  return { pattern: '普通K线', desc: '无明显形态特征' };
}

function analyzeVolume(klines) {
  if (klines.length < 6) return { trend: '数据不足', ratio: 1, desc: '' };
  var todayVol = klines[klines.length - 1].volume;
  var last5 = klines.slice(-6, -1);
  var avg5Vol = last5.reduce(function(s, k) { return s + k.volume; }, 0) / 5;
  var ratio = avg5Vol > 0 ? todayVol / avg5Vol : 1;
  var trend, desc;
  if (ratio > 2) { trend = '巨量'; desc = '量比>2，资金大幅涌入'; }
  else if (ratio > 1.5) { trend = '放量'; desc = '量比>1.5，交投活跃'; }
  else if (ratio > 0.8) { trend = '平量'; desc = '成交量与近期持平'; }
  else { trend = '缩量'; desc = '量比<0.8，交投清淡'; }
  return { trend: trend, ratio: +ratio.toFixed(2), desc: desc };
}

function assessRisk(stock, technical, isLimitUp) {
  var factors = [];
  var riskLevel = '中风险';
  if (isLimitUp) factors.push('涨停板，追高风险大');
  if (technical.rsi > 80) { factors.push('RSI=' + technical.rsi + '，处于超买区域'); riskLevel = '高风险'; }
  else if (technical.rsi > 70) factors.push('RSI=' + technical.rsi + '，偏高');
  var turnover = parseFloat(stock.turnoverratio) || 0;
  if (turnover > 15) { factors.push('换手率' + turnover.toFixed(1) + '%，交投过热'); riskLevel = '高风险'; }
  else if (turnover > 10) factors.push('换手率' + turnover.toFixed(1) + '%，偏高');
  if (technical.volumeRatio.trend === '巨量') factors.push('成交量巨量放大，注意分歧');
  if (technical.upDays >= 5) { factors.push('连续上涨' + technical.upDays + '日，获利盘较多'); riskLevel = '高风险'; }
  var chg = parseFloat(stock.changepercent) || 0;
  if (chg > 15) { factors.push('涨幅' + chg.toFixed(1) + '%，短期涨幅过大'); riskLevel = '高风险'; }
  if (factors.length === 0) factors.push('暂无明显风险信号');
  return { level: riskLevel, factors: factors };
}

function generateStockConclusion(stock, technical, isLimitUp, banCount, risk) {
  var bullPoints = [];
  var bearPoints = [];
  var chg = parseFloat(stock.changepercent) || 0;
  var turnover = parseFloat(stock.turnoverratio) || 0;
  var currentPrice = parseFloat(stock.trade) || 0;

  if (chg > 0) bullPoints.push('今日上涨' + chg.toFixed(2) + '%，资金积极做多');
  if (isLimitUp) bullPoints.push((banCount > 1 ? banCount + '连板' : '首板涨停') + '，市场情绪高涨');
  if (technical.ma5 && technical.ma10 && technical.ma20 && currentPrice > technical.ma5 && technical.ma5 > technical.ma10 && technical.ma10 > technical.ma20)
    bullPoints.push('均线多头排列，短期趋势向上');
  if (technical.rsi >= 50 && technical.rsi < 70) bullPoints.push('RSI=' + technical.rsi + '，健康偏强区间');
  if (technical.volumeRatio.trend === '放量' || technical.volumeRatio.trend === '巨量')
    bullPoints.push(technical.volumeRatio.trend + '上涨，量价配合');
  if (turnover > 5) bullPoints.push('换手率' + turnover.toFixed(1) + '%，交投活跃');
  if (technical.upDays >= 3) bullPoints.push('连续上涨' + technical.upDays + '日，趋势明确');

  if (technical.rsi > 80) bearPoints.push('RSI=' + technical.rsi + '，严重超买');
  else if (technical.rsi > 70) bearPoints.push('RSI=' + technical.rsi + '，偏高');
  if (turnover > 15) bearPoints.push('换手率' + turnover.toFixed(1) + '%，过热风险');
  if (technical.upDays >= 5) bearPoints.push('连续上涨' + technical.upDays + '日，回调压力增大');
  if (chg > 15) bearPoints.push('涨幅' + chg.toFixed(1) + '%，短期获利盘较多');
  if (technical.ma5 && currentPrice < technical.ma5) bearPoints.push('跌破5日均线，短期走弱');
  if (technical.klinePattern.pattern === '大阴线') bearPoints.push('大阴线，空头强势');

  if (bullPoints.length === 0) bullPoints.push('暂无明显利好信号');
  if (bearPoints.length === 0) bearPoints.push('暂无明显利空信号');

  var operation;
  if (risk.level === '高风险') {
    operation = '短期涨幅过大或过热，建议观望为主，不宜追高。如已持有可考虑逐步减仓锁定利润。';
  } else if (risk.level === '中高风险') {
    operation = '短期走势偏强，可轻仓关注，设好止损位。注意控制仓位，不宜重仓追涨。';
  } else {
    operation = '走势相对健康，可适当关注。如趋势确认可逢低布局，注意量能配合和止损纪律。';
  }

  var summary = stock.name + '（' + stock.code + '）今日' + (chg >= 0 ? '上涨' : '下跌') + Math.abs(chg).toFixed(2) + '%，' +
    '成交' + (parseFloat(stock.amount || 0) / 1e8).toFixed(1) + '亿，换手率' + turnover.toFixed(1) + '%。' +
    technical.klinePattern.pattern + '，' + technical.volumeRatio.trend + '，RSI=' + technical.rsi + '。综合评估：' + risk.level + '。' + operation;

  return { summary: summary, bullPoints: bullPoints, bearPoints: bearPoints, operation: operation };
}

function generateConclusion(opts) {
  var indices = opts.indices, upCount = opts.upCount, downCount = opts.downCount;
  var limitUpStocks = opts.limitUpStocks, limitDownStocks = opts.limitDownStocks;
  var maxBan = opts.maxBan, sentiment = opts.sentiment, mainThemes = opts.mainThemes;
  var shIdx = indices.find(function(i) { return i.code === 'sh000001'; });
  var shChange = shIdx ? shIdx.changePercent : 0;
  var trend = '';
  if (shChange > 1) trend = '强势上涨';
  else if (shChange > 0.3) trend = '震荡偏强';
  else if (shChange > -0.3) trend = '窄幅震荡';
  else if (shChange > -1) trend = '震荡偏弱';
  else trend = '明显下跌';
  var zt = limitUpStocks.length;
  var dt = limitDownStocks.length;
  var mainLine = '今日市场无明显主线';
  if (mainThemes.length > 0 && mainThemes[0].count >= 3) {
    mainLine = '主线方向：**' + mainThemes[0].name + '**（' + mainThemes[0].count + '只涨停）';
    if (mainThemes.length > 1 && mainThemes[1].count >= 3)
      mainLine += '，次主线：' + mainThemes[1].name + '（' + mainThemes[1].count + '只）';
  }
  return {
    trend: trend, shChange: shChange, mainLine: mainLine, sentiment: sentiment.phase,
    summary: '今日上证指数' + (shChange >= 0 ? '涨' : '跌') + Math.abs(shChange).toFixed(2) + '%，' + trend + '。' +
      '全市场' + upCount + '家涨、' + downCount + '家跌，涨停' + zt + '只、跌停' + dt + '只，最高' + maxBan + '板。' +
      '市场处于【' + sentiment.phase + '】阶段，' + sentiment.strategy + '。' + mainLine + '。'
  };
}

// ==================== Market Review Generation ====================
async function generateMarketReview() {
  var startTime = Date.now();
  var indices = await fetchIndices();
  var allStocks = await fetchAllSinaA();

  var upCount = allStocks.filter(function(s) { return parseFloat(s.changepercent) > 0; }).length;
  var downCount = allStocks.filter(function(s) { return parseFloat(s.changepercent) < 0; }).length;
  var flatCount = allStocks.filter(function(s) { return parseFloat(s.changepercent) === 0; }).length;
  var limitUpStocks = allStocks.filter(isZhangTing);
  var limitDownStocks = allStocks.filter(isDieTing);

  var topLimitUp = limitUpStocks.filter(function(s) { return !(s.name || '').startsWith('N'); }).slice(0, 30);
  var klineTasks = topLimitUp.map(async function(s) {
    var klines = await fetchStockKline(s.symbol);
    var banCount = calcConsecutiveLimitUp(klines, s.symbol);
    return Object.assign({}, s, { banCount: banCount });
  });
  var limitUpWithBan = await Promise.all(klineTasks);
  var maxBan = limitUpWithBan.reduce(function(m, s) { return Math.max(m, s.banCount); }, 0);
  var topBaners = limitUpWithBan.filter(function(s) { return s.banCount >= 2; })
    .sort(function(a, b) { return b.banCount - a.changepercent; }).slice(0, 5);

  var sentiment = judgeSentiment({ up: upCount, down: downCount, limitUp: limitUpStocks.length, limitDown: limitDownStocks.length, maxBaner: maxBan });

  var conceptMap = {};
  var unmatchedCount = 0;
  for (var i = 0; i < limitUpStocks.length; i++) {
    var concept = extractConcept(limitUpStocks[i]);
    if (concept) {
      if (!conceptMap[concept]) conceptMap[concept] = [];
      conceptMap[concept].push(limitUpStocks[i]);
    } else unmatchedCount++;
  }
  var mainThemes = Object.entries(conceptMap)
    .map(function(entry) { return { name: entry[0], count: entry[1].length, stocks: entry[1].slice(0, 5).map(function(s) { return s.name; }) }; })
    .filter(function(t) { return t.count >= 1; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 5);
  if (unmatchedCount > 0 && mainThemes.length < 5) mainThemes.push({ name: '其他', count: unmatchedCount, stocks: [] });

  var limitUpList = limitUpStocks.slice(0, 30).map(function(s) {
    var banMatch = limitUpWithBan.find(function(x) { return x.code === s.code; });
    return {
      code: s.code, name: s.name, change: s.changepercent, price: s.trade,
      amount: Math.round(s.amount / 1e8 * 10) / 10, turnover: s.turnoverratio,
      board: getBoard(s.code), banCount: (banMatch && banMatch.banCount) || 1
    };
  });
  var limitDownList = limitDownStocks.slice(0, 20).map(function(s) {
    return { code: s.code, name: s.name, change: s.changepercent, price: s.trade };
  });
  var coreStocks = topBaners.slice(0, 5).map(function(s) {
    return { name: s.name, code: s.code, banCount: s.banCount, change: s.changepercent, price: s.trade, note: s.banCount + '板龙头' };
  });

  var conclusion = generateConclusion({ indices: indices, upCount: upCount, downCount: downCount, limitUpStocks: limitUpStocks, limitDownStocks: limitDownStocks, maxBan: maxBan, sentiment: sentiment, mainThemes: mainThemes });

  var report = {
    date: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    elapsed: Date.now() - startTime,
    marketStructure: {
      indices: indices,
      advanceDecline: { up: upCount, down: downCount, flat: flatCount, ratio: downCount > 0 ? +(upCount / downCount).toFixed(2) : 0 },
      limitUpDown: { up: limitUpStocks.length, down: limitDownStocks.length },
      limitUpHeight: { max: maxBan, topBaners: topBaners.map(function(s) { return { name: s.name, code: s.code, ban: s.banCount }; }) }
    },
    sentiment: sentiment,
    mainThemes: mainThemes,
    coreStocks: coreStocks,
    limitUpList: limitUpList,
    limitDownList: limitDownList,
    conclusion: conclusion
  };

  localStorage.setItem('cloud_marketReview', JSON.stringify(report));
  return report;
}

// ==================== Hot Stock Analysis Generation ====================
async function generateHotStockAnalysis(skipCodes) {
  skipCodes = skipCodes || [];
  var startTime = Date.now();
  var allStocks = await fetchAllSinaA();
  var picked = pickHotStock(allStocks, skipCodes);
  if (!picked) throw new Error('未找到合适的热门股');

  var hotStock = picked.stock;
  var klines = await fetchStockKline(hotStock.symbol);
  var companyProfile = await fetchCompanyProfile(hotStock.code);

  var currentPrice = parseFloat(hotStock.trade) || 0;
  var ma5 = calcMA(klines, 5);
  var ma10 = calcMA(klines, 10);
  var ma20 = calcMA(klines, 20);
  var ma60 = calcMA(klines, 60);
  var rsi = calcRSI(klines, 14);
  var klinePattern = detectKlinePattern(klines);
  var volumeRatio = analyzeVolume(klines);

  var last20 = klines.slice(-20);
  var support = last20.length > 0 ? +Math.min.apply(null, last20.map(function(k) { return k.low; })).toFixed(2) : 0;
  var resistance = last20.length > 0 ? +Math.max.apply(null, last20.map(function(k) { return k.high; })).toFixed(2) : 0;

  var upDays = 0;
  for (var i = klines.length - 1; i > 0; i--) {
    if (klines[i].close > klines[i - 1].close) upDays++;
    else break;
  }

  var trendLabels = [], trendDescs = [];
  if (ma5 && ma10 && ma20) {
    if (currentPrice > ma5 && ma5 > ma10 && ma10 > ma20) { trendLabels.push('多头排列'); trendDescs.push('均线多头排列，短期趋势向上'); }
    else if (currentPrice < ma5 && ma5 < ma10 && ma10 < ma20) { trendLabels.push('空头排列'); trendDescs.push('均线空头排列，短期趋势向下'); }
    else { trendLabels.push('交叉排列'); trendDescs.push('均线纠缠，趋势不明'); }
  }
  if (ma20) {
    if (currentPrice > ma20) { trendLabels.push('价在20日线上方'); trendDescs.push('中期趋势偏多'); }
    else { trendLabels.push('价在20日线下方'); trendDescs.push('中期趋势偏空'); }
  }
  if (upDays >= 3) { trendLabels.push('连涨' + upDays + '日'); trendDescs.push('近期连续上涨' + upDays + '日'); }

  var turnover = parseFloat(hotStock.turnoverratio) || 0;
  var isLimitUp = isZhangTing(hotStock);
  var banCount = calcConsecutiveLimitUp(klines, hotStock.symbol);

  var turnoverLevel = '正常';
  if (turnover > 15) turnoverLevel = '极高换手';
  else if (turnover > 10) turnoverLevel = '高换手';
  else if (turnover > 5) turnoverLevel = '活跃换手';

  var momentumScore = 50;
  if (isLimitUp) momentumScore += 20;
  if (turnover > 10) momentumScore += 15;
  if (volumeRatio.ratio > 2) momentumScore += 15;
  if (ma5 && currentPrice > ma5) momentumScore += 10;
  if (rsi > 70) momentumScore += 10;
  if (rsi > 80) momentumScore -= 10;
  momentumScore = Math.min(100, Math.max(0, momentumScore));

  var pe = parseFloat(hotStock.per) || 0;
  var pb = parseFloat(hotStock.pb) || 0;
  var marketCapWan = parseFloat(hotStock.mktcap) || 0;
  var marketCapYi = marketCapWan > 0 ? +(marketCapWan / 1e4).toFixed(0) : null;
  var nmcWan = parseFloat(hotStock.nmc) || 0;
  var circulatingMarketCapYi = nmcWan > 0 ? +(nmcWan / 1e4).toFixed(0) : null;

  var valuation = '合理估值';
  if (pe > 0 && pe < 15) valuation = '低估值';
  else if (pe > 0 && pe < 30) valuation = '合理估值';
  else if (pe > 0 && pe < 60) valuation = '偏高估值';
  else if (pe > 0) valuation = '高估值';
  if (pe <= 0) valuation = '亏损/无盈利';

  var concept = extractConcept(hotStock) || '未分类';

  var technical = {
    ma5: ma5, ma10: ma10, ma20: ma20, ma60: ma60, rsi: rsi,
    klinePattern: klinePattern, volumeRatio: volumeRatio,
    support: support, resistance: resistance, upDays: upDays,
    trendLabels: trendLabels, trendDescs: trendDescs,
    recentKlines: klines.slice(-30).map(function(k) {
      return { date: k.date, open: +k.open.toFixed(2), close: +k.close.toFixed(2), high: +k.high.toFixed(2), low: +k.low.toFixed(2), volume: k.volume };
    })
  };

  var sentimentObj = {
    turnoverLevel: turnoverLevel, isLimitUp: isLimitUp, banCount: banCount,
    volumeSurge: volumeRatio.ratio > 1.5, momentumScore: momentumScore,
    description: isLimitUp ? (banCount > 1 ? banCount + '连板' : '首板涨停') + '，市场关注度极高' : '成交活跃，市场关注度较高',
  };

  var fundamentals = {
    pe: pe > 0 ? +pe.toFixed(2) : null, pb: pb > 0 ? +pb.toFixed(2) : null,
    marketCap: marketCapYi, circulatingMarketCap: circulatingMarketCapYi,
    industry: (companyProfile && companyProfile.industry) || null,
    concept: concept, board: getBoard(hotStock.code), valuation: valuation,
    roe: null, grossMargin: null, netMargin: null,
  };

  var risk = assessRisk(hotStock, technical, isLimitUp);
  var conclusion = generateStockConclusion(hotStock, technical, isLimitUp, banCount, risk);

  var chg = parseFloat(hotStock.changepercent) || 0;
  var selectionRationale = '综合热度评分' + picked.score + '/100：涨幅' + chg.toFixed(2) + '%，成交' + (parseFloat(hotStock.amount || 0) / 1e8).toFixed(1) + '亿，换手率' + turnover.toFixed(1) + '%' + (isLimitUp ? '，涨停' : '');

  var report = {
    date: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    elapsed: Date.now() - startTime,
    selectionRationale: selectionRationale,
    stock: { name: hotStock.name, code: hotStock.code, symbol: hotStock.symbol, concept: fundamentals.concept, board: fundamentals.board },
    marketData: {
      current: +currentPrice.toFixed(2), changePercent: +chg.toFixed(2),
      change: +(currentPrice - (parseFloat(hotStock.settlement || 0))).toFixed(2),
      open: +(parseFloat(hotStock.open) || 0).toFixed(2), high: +(parseFloat(hotStock.high) || 0).toFixed(2),
      low: +(parseFloat(hotStock.low) || 0).toFixed(2), prevClose: +(parseFloat(hotStock.settlement) || 0).toFixed(2),
      volume: parseInt(hotStock.volume) || 0, amount: +(parseFloat(hotStock.amount || 0) / 1e8).toFixed(2),
      turnoverRate: +turnover.toFixed(2),
    },
    technical: technical, fundamentals: fundamentals, companyProfile: companyProfile,
    sentiment: sentimentObj, risk: risk, conclusion: conclusion,
  };

  localStorage.setItem('cloud_hotStock', JSON.stringify(report));
  return report;
}

// ==================== Fetch Interceptor ====================
(function() {
  var originalFetch = window.fetch;
  window.fetch = async function(url, options) {
    if (typeof url === 'string' && url.indexOf('/api/kpl/') === 0) {
      // 开盘啦数据：GitHub Pages 无服务端，改读 Actions 定时抓取的静态快照
      var kplName = url.indexOf('/api/kpl/emotion') === 0 ? 'kpl-emotion'
                  : url.indexOf('/api/kpl/ladder') === 0 ? 'kpl-ladder'
                  : 'kpl-reasons';
      return originalFetch.call(this, 'data/' + kplName + '.json?t=' + Date.now());
    }
    if (typeof url === 'string' && url.indexOf('/api/') === 0) {
      return handleCloudApi(url);
    }
    return originalFetch.call(this, url, options);
  };

  async function handleCloudApi(url) {
    try {
      var data;
      if (url.indexOf('/api/cls-news') === 0) {
        var clsNews = await fetchSinaNews();
        data = { success: true, data: clsNews };
      } else if (url.indexOf('/api/eastmoney-news') === 0) {
        var emNews = await fetchEMNews();
        data = { success: true, data: emNews };
      } else if (url.indexOf('/api/market-review/generate') === 0) {
        var review = await generateMarketReview();
        data = { success: true, data: review };
      } else if (url.indexOf('/api/market-review/latest') === 0) {
        var storedReview = localStorage.getItem('cloud_marketReview');
        data = storedReview ? { success: true, data: JSON.parse(storedReview) } : { success: false, error: '暂无复盘报告，请先点击生成', data: null };
      } else if (url.indexOf('/api/hot-stock/generate') === 0) {
        var skipMatch = url.match(/skip=([^&]*)/);
        var skipCodes = skipMatch ? skipMatch[1].split(',').filter(Boolean) : [];
        var hotReport = await generateHotStockAnalysis(skipCodes);
        data = { success: true, data: hotReport };
      } else if (url.indexOf('/api/hot-stock/latest') === 0) {
        var storedHot = localStorage.getItem('cloud_hotStock');
        data = storedHot ? { success: true, data: JSON.parse(storedHot) } : { success: false, error: '暂无分析报告，请点击生成', data: null };
      } else if (url.indexOf('/api/qrcode') === 0) {
        var qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=' + encodeURIComponent(location.href);
        data = { success: true, url: location.href, ip: 'cloud', svg: '<img src="' + qrApiUrl + '" width="240" height="240" alt="QR Code" style="border-radius:12px" />' };
      } else if (url.indexOf('/api/indices') === 0) {
        var indices = await fetchIndices();
        data = { success: true, data: indices };
      } else {
        return new Response(JSON.stringify({ error: 'Unknown API: ' + url }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch(err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }
})();
