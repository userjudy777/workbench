// ==================== 工具函数 ====================
const $ = id => document.getElementById(id);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== 时钟 ====================
function updateClock() {
  const now = new Date();
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${days[now.getDay()]}`;
  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  $('dateText').textContent = dateStr;
  $('timeText').textContent = timeStr;
}
updateClock();
setInterval(updateClock, 1000);

// ==================== 导航切换 ====================
let currentView = 'plan';
const loadedViews = new Set();

// ==================== 手机端侧边栏抽屉 ====================
const sidebar = document.querySelector('.sidebar');
const sidebarOverlay = $('sidebarOverlay');
const menuToggle = $('menuToggle');

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
}

if (menuToggle) menuToggle.addEventListener('click', openSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

// ==================== PWA 安装二维码 ====================
const installBtn = $('installBtn');
const qrModalOverlay = $('qrModalOverlay');
const qrModalClose = $('qrModalClose');
const qrCodeWrapper = $('qrCodeWrapper');
const qrUrl = $('qrUrl');

async function showQRCode() {
  if (!qrModalOverlay) return;
  qrModalOverlay.classList.add('show');
  if (qrCodeWrapper) qrCodeWrapper.innerHTML = '<div class="qr-loading">生成二维码中...</div>';
  if (qrUrl) qrUrl.textContent = '';

  try {
    const resp = await fetch('/api/qrcode');
    const data = await resp.json();
    if (data.success && data.svg) {
      if (qrCodeWrapper) qrCodeWrapper.innerHTML = data.svg;
      if (qrUrl) qrUrl.textContent = data.url;
    } else {
      if (qrCodeWrapper) qrCodeWrapper.innerHTML = '<div class="qr-error">二维码生成失败: ' + (data.error || '未知错误') + '</div>';
    }
  } catch (e) {
    if (qrCodeWrapper) qrCodeWrapper.innerHTML = '<div class="qr-error">请求失败: ' + e.message + '</div>';
  }
}

function hideQRCode() {
  if (qrModalOverlay) qrModalOverlay.classList.remove('show');
}

if (installBtn) installBtn.addEventListener('click', showQRCode);
if (qrModalClose) qrModalClose.addEventListener('click', hideQRCode);
if (qrModalOverlay) qrModalOverlay.addEventListener('click', (e) => {
  if (e.target === qrModalOverlay) hideQRCode();
});

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === currentView) {
      closeSidebar();
      return;
    }

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $(`view-${view}`).classList.add('active');

    currentView = view;
    closeSidebar();

    // 首次进入时加载数据
    if (!loadedViews.has(view)) {
      loadedViews.add(view);
      if (view === 'cls') loadNews('cls');
      else if (view === 'eastmoney') loadNews('eastmoney');
      else if (view === 'kpl') loadKPL();
      else if (view === 'market-review') loadReview();
      else if (view === 'meditation') renderMeditationHistory();
      else if (view === 'reading') renderReadingView();
      else if (view === 'hot-stock') loadHotStock();
    }
  });
});

// ==================== 预设任务 ====================
const PRESET_TASKS = [
  { text: '爬飞书数据', icon: '📊', priority: 'high' },
  { text: '抄心经', icon: '📿', priority: 'medium' },
  { text: '冥想30分钟', icon: '🧘', priority: 'medium', link: 'meditation' },
  { text: '看书30分钟', icon: '📖', priority: 'low', link: 'reading' }
];
const PRESET_FLAG_KEY = 'workbench_preset_date';

function ensurePresetTasks() {
  const todayKey = getTodayKey();
  const lastPresetDate = localStorage.getItem(PRESET_FLAG_KEY);

  if (lastPresetDate !== todayKey) {
    tasks = tasks.filter(t => t.date === todayKey);
    for (const preset of PRESET_TASKS) {
      const exists = tasks.some(t => t.text === preset.text && t.date === todayKey && t.isPreset);
      if (!exists) {
        tasks.push({
          id: Date.now() + Math.random(),
          text: `${preset.icon} ${preset.text}`,
          priority: preset.priority,
          done: false,
          date: todayKey,
          isPreset: true,
          link: preset.link || null
        });
      }
    }
    localStorage.setItem(PRESET_FLAG_KEY, todayKey);
    saveTasks();
  }
}

// ==================== 任务管理 ====================
const STORAGE_KEY = 'workbench_tasks';
let tasks = [];

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    tasks = stored ? JSON.parse(stored) : [];
  } catch {
    tasks = [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function addTask() {
  const input = $('taskInput');
  const text = input.value.trim();
  if (!text) return;

  tasks.push({
    id: Date.now() + Math.random(),
    text: text,
    priority: $('taskPriority').value,
    done: false,
    date: getTodayKey(),
    isPreset: false,
    link: null
  });

  saveTasks();
  input.value = '';
  renderTasks();
}

function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.done = !task.done;
    saveTasks();
    renderTasks();
    // 如果任务有链接，且被勾选完成，跳转过去
    if (task.done && task.link) {
      const navBtn = document.querySelector(`.nav-item[data-view="${task.link}"]`);
      if (navBtn) navBtn.click();
    }
  }
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
}

function renderTasks() {
  const todayKey = getTodayKey();
  const todayTasks = tasks.filter(t => t.date === todayKey);

  const presetTasks = todayTasks.filter(t => t.isPreset && !t.done);
  const todoTasks = todayTasks.filter(t => !t.isPreset && !t.done);
  const doneTasks = todayTasks.filter(t => t.done);

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sortByPriority = (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority];

  const sortedPreset = [...presetTasks].sort(sortByPriority);
  const sortedTodo = [...todoTasks].sort(sortByPriority);
  const sortedDone = [...doneTasks].sort((a, b) => {
    if (a.isPreset !== b.isPreset) return a.isPreset ? -1 : 1;
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // 渲染三列
  $('presetColumn').innerHTML = sortedPreset.length > 0
    ? sortedPreset.map(task => renderTaskCard(task)).join('')
    : '<div class="kanban-empty-col"><span>🎉</span><p>日课全部完成！</p></div>';

  $('todoColumn').innerHTML = sortedTodo.length > 0
    ? sortedTodo.map(task => renderTaskCard(task)).join('')
    : '<div class="kanban-empty-col"><span>📝</span><p>暂无待办任务</p></div>';

  $('doneColumn').innerHTML = sortedDone.length > 0
    ? sortedDone.map(task => renderTaskCard(task)).join('')
    : '<div class="kanban-empty-col"><span>🎯</span><p>完成任务将显示在此</p></div>';

  // 更新统计
  const total = todayTasks.length;
  const done = doneTasks.length;
  const pending = total - done;
  const rate = total > 0 ? Math.round(done / total * 100) : 0;

  $('statTotal').textContent = total;
  $('statDone').textContent = done;
  $('statPending').textContent = pending;
  $('statRate').textContent = rate + '%';
  $('presetCount').textContent = sortedPreset.length;
  $('todoCount').textContent = sortedTodo.length;
  $('doneCount').textContent = sortedDone.length;
  $('kanbanProgressFill').style.width = rate + '%';
}

function renderTaskCard(task) {
  const priorityLabels = { high: '高', medium: '中', low: '低' };
  const linkLabels = { meditation: '冥想课程', reading: '看书任务' };

  const linkBadge = task.link
    ? `<span class="kanban-card-link">→ ${linkLabels[task.link] || ''}</span>`
    : '';

  return `
    <div class="kanban-task-card ${task.done ? 'done' : ''} ${task.isPreset ? 'preset' : ''}" onclick="toggleTask(${task.id})">
      <div class="kanban-card-checkbox"></div>
      <div class="kanban-card-body">
        <div class="kanban-card-text">${escapeHtml(task.text)}</div>
        <div class="kanban-card-meta">
          <span class="kanban-card-priority ${task.priority}">${priorityLabels[task.priority]}</span>
          ${linkBadge}
        </div>
      </div>
      ${!task.isPreset ? `<button class="kanban-card-delete" onclick="event.stopPropagation(); deleteTask(${task.id})" title="删除">×</button>` : ''}
    </div>
  `;
}

$('taskInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

loadTasks();
ensurePresetTasks();
renderTasks();

// ==================== 新闻模块 ====================
const newsCache = { cls: null, eastmoney: null };
let newsAutoRefreshTimer = null;

async function fetchNews(source) {
  const url = source === 'cls' ? '/api/cls-news?rn=30' : '/api/eastmoney-news?pageSize=30';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json.success) throw new Error(json.error || '获取失败');
  return json.data;
}

function renderNews(news, source) {
  const listId = source === 'cls' ? 'clsNewsList' : 'emNewsList';
  const timeId = source === 'cls' ? 'clsUpdateTime' : 'emUpdateTime';
  const list = $(listId);

  if (!news || news.length === 0) {
    list.innerHTML = '<div class="news-loading">暂无新闻</div>';
    return;
  }

  list.innerHTML = news.map(item => {
    const sourceName = source === 'cls' ? '财联社' : '东财';
    const badges = [];
    if (item.isImportant) badges.push('<span class="news-badge important">重要</span>');
    if ((item.readingNum || 0) >= 5000 || (item.shareCount || 0) >= 10 || (item.commentCount || 0) >= 20) {
      badges.push('<span class="news-badge hot">🔥 热门</span>');
    }

    const stocks = (item.stocks || []).slice(0, 5).map(s =>
      `<span class="news-stock-tag">${escapeHtml(s)}</span>`
    ).join('');

    let stats = '';
    if (source === 'cls') {
      stats = `<span class="news-stat">👁 ${item.readingNum || 0}</span><span class="news-stat">💬 ${item.commentNum || 0}</span>`;
    } else {
      stats = `<span class="news-stat">📤 ${item.shareCount || 0}</span><span class="news-stat">💬 ${item.commentCount || 0}</span>`;
    }

    const link = item.shareUrl ? `<a class="news-link" href="${escapeHtml(item.shareUrl)}" target="_blank">查看原文 →</a>` : '';

    return `
      <div class="news-card ${item.isImportant ? 'important' : ''}">
        <div class="news-card-header">
          <span class="news-time">${escapeHtml(item.timeStr || '')}</span>
          ${badges.join('')}
          <span class="news-source-tag">${sourceName}</span>
        </div>
        <div class="news-title">${escapeHtml(item.title || '无标题')}</div>
        <div class="news-content">${escapeHtml(item.content || '')}</div>
        <div class="news-footer">${stocks}${stats}${link}</div>
      </div>
    `;
  }).join('');

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  $(timeId).textContent = `更新于 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

async function loadNews(source) {
  const listId = source === 'cls' ? 'clsNewsList' : 'emNewsList';
  $(listId).innerHTML = '<div class="news-loading">加载中...</div>';
  try {
    const news = await fetchNews(source);
    newsCache[source] = news;
    renderNews(news, source);
  } catch (err) {
    $(listId).innerHTML = `<div class="news-loading" style="color:var(--red)">加载失败: ${escapeHtml(err.message)}<br><button class="btn-refresh" style="margin-top:12px" onclick="loadNews('${source}')">重试</button></div>`;
  }
}

// ==================== 开盘啦情绪 ====================
async function loadKPL() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  $( 'kplUpdateTime').textContent = `更新于 ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // 情绪仪表盘 + 历史趋势
  fetch('/api/kpl/emotion?st=10').then(r => r.json()).then(j => {
    if (j.success) renderKPLEmotion(j.data);
  }).catch(() => {});
  // 涨停天梯
  fetch('/api/kpl/ladder').then(r => r.json()).then(j => {
    if (j.success) renderKPLLadder(j.data);
    else $('kplLadder').innerHTML = '<div class="news-loading">加载失败</div>';
  }).catch(() => { $('kplLadder').innerHTML = '<div class="news-loading">加载失败，请稍后重试</div>'; });
  // 题材风口
  fetch('/api/kpl/reasons').then(r => r.json()).then(j => {
    if (j.success) renderKPLReasons(j.data);
    else $('kplReasons').innerHTML = '<div class="news-loading">加载失败</div>';
  }).catch(() => { $('kplReasons').innerHTML = '<div class="news-loading">加载失败，请稍后重试</div>'; });
}

function renderKPLEmotion(data) {
  const info = (data && data.info) || [];
  const tip = (data && data.tip) || '';
  if (!info.length) return;
  const bar = (v, max, color) => `<div style="height:6px;border-radius:3px;background:var(--border,#eee);overflow:hidden;"><div style="height:100%;width:${Math.min(100, Math.round(v / max * 100))}%;background:${color};"></div></div>`;
  const rows = info.map(d => `
    <tr>
      <td style="padding:6px 8px;color:var(--text-muted);">${d.Day}</td>
      <td style="padding:6px 8px;"><span style="font-weight:700;color:${d.strong >= 60 ? 'var(--red)' : d.strong >= 40 ? 'var(--amber, #d97706)' : 'var(--green)'};">${d.strong}</span></td>
      <td style="padding:6px 8px;color:var(--red);font-weight:600;">${d.ztjs}</td>
      <td style="padding:6px 8px;font-weight:600;">${d.lbgd}板</td>
      <td style="padding:6px 8px;color:var(--green);">${d.df_num}</td>
      <td style="padding:6px 8px;">${bar(d.strong, 100, d.strong >= 60 ? 'var(--red)' : '#d97706')}</td>
    </tr>`).join('');
  $('kplEmotionBar').innerHTML = `
    <div style="background:var(--card,#fff);border:1px solid var(--border,#eee);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
        <strong>🌡️ 市场情绪（近 ${info.length} 个交易日）</strong>
        <span style="font-size:0.85rem;color:var(--text-muted);">情绪指数 / 涨停 / 连板高度 / 大面</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
        <thead><tr style="color:var(--text-muted);font-size:0.8rem;text-align:left;">
          <th style="padding:4px 8px;">日期</th><th style="padding:4px 8px;">情绪指数</th><th style="padding:4px 8px;">涨停家数</th><th style="padding:4px 8px;">连板高度</th><th style="padding:4px 8px;">大面</th><th style="padding:4px 8px;">热度</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${tip ? `<div style="margin-top:10px;padding:8px 12px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:6px;font-size:0.85rem;color:#92400e;">💡 ${tip}</div>` : ''}
    </div>`;
}

function renderKPLLadder(data) {
  const groups = (data && data.StockList) || [];
  if (!groups.length) { $('kplLadder').innerHTML = '<div class="news-loading">今日暂无涨停数据</div>'; return; }
  const html = groups.map(group => {
    if (!group || !group.length) return '';
    // 组内股票字段: [code, name, ?, ts, plateCode, plateName, ..., "7天6板", ..., 高度, 高度]
    const label = group[0][11] || (group[0][13] ? `${group[0][13]}板` : '');
    const stocks = group.map(s => {
      const code = s[0], name = s[1], plate = s[5] || '';
      return `<span style="display:inline-block;margin:4px 6px 2px 0;padding:4px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:0.88rem;">
        <strong style="color:var(--red);">${name}</strong>
        <small style="color:var(--text-muted);">${code}</small>
        ${plate ? `<small style="color:#92400e;"> · ${plate}</small>` : ''}
      </span>`;
    }).join('');
    return `<div style="margin-bottom:12px;">
      <div style="font-size:0.85rem;color:#92400e;font-weight:700;margin-bottom:2px;">${label || '涨停'}</div>
      <div>${stocks}</div>
    </div>`;
  }).join('');
  $('kplLadder').innerHTML = `<div style="background:var(--card,#fff);border:1px solid var(--border,#eee);border-radius:12px;padding:16px;">${html}</div>`;
}

function renderKPLReasons(data) {
  const nums = (data && data.nums) || {};
  const list = (data && data.list) || [];
  const stat = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <span style="padding:6px 12px;border-radius:8px;background:#fef2f2;color:var(--red);font-weight:600;font-size:0.85rem;">涨停 ${nums.ZT ?? '-'}</span>
      <span style="padding:6px 12px;border-radius:8px;background:#f0fdf4;color:var(--green);font-weight:600;font-size:0.85rem;">跌停 ${nums.DT ?? '-'}</span>
      <span style="padding:6px 12px;border-radius:8px;background:#eff6ff;color:var(--blue,#2563eb);font-weight:600;font-size:0.85rem;">上涨 ${nums.SZJS ?? '-'}</span>
      <span style="padding:6px 12px;border-radius:8px;background:#f8fafc;color:var(--text-muted);font-weight:600;font-size:0.85rem;">下跌 ${nums.XDJS ?? '-'}</span>
      <span style="padding:6px 12px;border-radius:8px;background:#fffbeb;color:#d97706;font-weight:600;font-size:0.85rem;">炸板率 ${nums.ZBL ?? '-'}%</span>
    </div>`;
  if (!list.length) { $('kplReasons').innerHTML = stat + '<div class="news-loading">今日暂无题材数据</div>'; return; }
  const themes = list.map(t => {
    const stocks = (t.StockList || []).map(s => {
      const code = s[0], name = s[1], reason = s[11] || s[16] || '';
      return `<span style="display:inline-block;margin:4px 6px 2px 0;padding:4px 10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:0.85rem;" title="${String(reason).replace(/"/g, '&quot;')}">
        <strong>${name}</strong><small style="color:var(--text-muted);">${code}</small>
      </span>`;
    }).join('');
    return `<div style="margin-bottom:12px;">
      <div style="font-size:0.9rem;font-weight:700;color:#9a3412;margin-bottom:2px;">${t.ZSName || ''} <small style="color:var(--text-muted);font-weight:400;">(${(t.StockList || []).length} 只涨停)</small></div>
      ${t.TCExplain ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:2px;">${t.TCExplain}</div>` : ''}
      <div>${stocks}</div>
    </div>`;
  }).join('');
  $('kplReasons').innerHTML = `<div style="background:var(--card,#fff);border:1px solid var(--border,#eee);border-radius:12px;padding:16px;">${stat}${themes}</div>`;
}

// 自动刷新新闻
function startAutoRefresh() {
  if (newsAutoRefreshTimer) clearInterval(newsAutoRefreshTimer);
  newsAutoRefreshTimer = setInterval(() => {
    if (currentView === 'cls' || currentView === 'eastmoney') {
      loadNews(currentView);
    }
  }, 3 * 60 * 1000);
}
startAutoRefresh();

// ==================== 股市复盘模块 ====================
async function fetchWithTimeout(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

async function loadReview() {
  const container = $('reviewContainer');
  container.innerHTML = `<div class="review-loading"><div class="review-spinner"></div>正在加载复盘报告...</div>`;

  try {
    const resp = await fetchWithTimeout('/api/market-review/latest', 10000);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.success || !json.data) {
      container.innerHTML = `
        <div class="review-empty">
          <span class="empty-icon">📈</span>
          <p>暂无复盘报告</p>
          <p class="review-empty-hint">每天下午 15:01 自动生成，也可点击上方按钮手动生成</p>
          <button class="btn-review-gen-lg" onclick="generateReview()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/><polyline points="21 4 21 10 15 10"/></svg>
            立即生成今日复盘
          </button>
        </div>`;
      return;
    }
    try {
      renderReview(json.data);
    } catch (renderErr) {
      console.error('渲染复盘报告失败:', renderErr);
      container.innerHTML = `<div class="review-error">渲染失败: ${escapeHtml(renderErr.message)}<br><span style="font-size:12px;color:var(--text-3)">数据已获取，但前端渲染出错</span></div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="review-error">加载失败: ${escapeHtml(err.message)}<br><button class="btn-review-gen-lg" style="margin-top:12px" onclick="loadReview()">重试</button></div>`;
  }
}

async function generateReview() {
  const container = $('reviewContainer');
  const btn = $('genReviewBtn');
  if (btn) btn.disabled = true;
  container.innerHTML = `<div class="review-loading"><div class="review-spinner"></div>正在生成复盘报告，预计需要5-10秒...</div>`;

  try {
    const resp = await fetchWithTimeout('/api/market-review/generate', 60000);
    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try { const errJson = await resp.json(); errMsg = errJson.error || errMsg; } catch {}
      throw new Error(errMsg);
    }
    const json = await resp.json();
    if (json.success && json.data) {
      try {
        renderReview(json.data);
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        $('reviewUpdateTime').textContent = `生成于 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      } catch (renderErr) {
        console.error('渲染复盘报告失败:', renderErr, '\n数据:', JSON.stringify(json.data).substring(0, 500));
        container.innerHTML = `<div class="review-error">数据已生成，但渲染出错: ${escapeHtml(renderErr.message)}<br><span style="font-size:12px;color:var(--text-3)">请刷新页面重试</span></div>`;
      }
    } else {
      container.innerHTML = `<div class="review-error">生成失败: ${escapeHtml(json.error || '未知错误')}</div>`;
    }
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    container.innerHTML = `<div class="review-error">生成失败: ${escapeHtml(isTimeout ? '请求超时（60秒），请重试' : err.message)}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderReview(data) {
  const container = $('reviewContainer');
  const r = data;

  const sentimentColors = {
    '冰点': '#6b7280', '分歧': '#f59e0b', '加速': '#ef4444',
    '回调': '#10b981', '升温': '#3b82f6', '低迷': '#6b7280', '高潮': '#ef4444'
  };
  const sentColor = sentimentColors[r.sentiment?.phase] || '#6b7280';
  const colorUp = '#ef4444';
  const colorDown = '#10b981';
  const colorVal = v => v >= 0 ? colorUp : colorDown;
  const sign = v => v >= 0 ? '+' : '';

  const idxCards = (r.marketStructure?.indices || []).map(idx => {
    const chgPct = parseFloat(idx.changePercent) || 0;
    const current = parseFloat(idx.current) || 0;
    const amount = parseFloat(idx.amount) || 0;
    const chgColor = colorVal(chgPct);
    return `
      <div class="idx-card">
        <div class="idx-name">${escapeHtml(idx.name || '')}</div>
        <div class="idx-price">${current > 0 ? current.toFixed(2) : '--'}</div>
        <div class="idx-change" style="color:${chgColor}">${sign(chgPct)}${chgPct.toFixed(2)}%</div>
        <div class="idx-amount">成交 ${amount > 0 ? amount.toFixed(0) : '--'}亿</div>
      </div>
    `;
  }).join('');

  const adv = r.marketStructure?.advanceDecline || {};
  const lu = r.marketStructure?.limitUpDown || {};
  const lh = r.marketStructure?.limitUpHeight || {};

  const limitUpList = (r.limitUpList || []).slice(0, 20).map((s, i) => {
    const change = parseFloat(s.change) || 0;
    const price = parseFloat(s.price) || 0;
    const amount = parseFloat(s.amount) || 0;
    return `
    <tr>
      <td class="col-rank">${i + 1}</td>
      <td class="col-name">${escapeHtml(s.name || '')}</td>
      <td class="col-code">${s.code || ''}</td>
      <td class="col-change" style="color:${colorUp}">${sign(change)}${change.toFixed(2)}%</td>
      <td class="col-price">${price > 0 ? price.toFixed(2) : '--'}</td>
      <td class="col-amount">${amount > 0 ? amount.toFixed(1) : '--'}亿</td>
      <td class="col-board">${escapeHtml(s.board || '')}</td>
      <td class="col-ban">${(s.banCount || 1) > 1 ? `<span class="ban-badge">${s.banCount}板</span>` : '—'}</td>
    </tr>
  `}).join('');

  const themesHtml = (r.mainThemes || []).map(t => `
    <div class="theme-card">
      <div class="theme-header">
        <span class="theme-name">${escapeHtml(t.name)}</span>
        <span class="theme-count">${t.count}只涨停</span>
      </div>
      <div class="theme-stocks">${(t.stocks || []).map(s => `<span class="theme-stock-tag">${escapeHtml(s)}</span>`).join('')}</div>
    </div>
  `).join('');

  const coreStocksHtml = (r.coreStocks || []).map(s => {
    const change = parseFloat(s.change) || 0;
    return `
    <div class="core-stock-card">
      <div class="core-stock-ban">${s.banCount || 1}板</div>
      <div class="core-stock-info">
        <div class="core-stock-name">${escapeHtml(s.name || '')}</div>
        <div class="core-stock-code">${s.code || ''}</div>
      </div>
      <div class="core-stock-change" style="color:${colorUp}">+${change.toFixed(2)}%</div>
      <div class="core-stock-note">${escapeHtml(s.note || '')}</div>
    </div>
  `}).join('');

  container.innerHTML = `
    <div class="review-scroll">
      <div class="review-section review-conclusion">
        <div class="review-section-title">📋 综合结论</div>
        <div class="conclusion-box">
          <div class="conclusion-sentiment" style="background:${sentColor}1a;border-color:${sentColor}">
            <span class="sentiment-label">情绪周期</span>
            <span class="sentiment-value" style="color:${sentColor}">${escapeHtml(r.sentiment?.phase || '--')}</span>
            <span class="sentiment-strategy">${escapeHtml(r.sentiment?.strategy || '')}</span>
          </div>
          <div class="conclusion-summary">${escapeHtml(r.conclusion?.summary || '')}</div>
          <div class="conclusion-meta">
            <span>📊 ${escapeHtml(r.conclusion?.trend || '')}</span>
            <span>🕐 生成耗时 ${r.elapsed || 0}ms</span>
            <span>📅 ${r.date || ''}</span>
          </div>
        </div>
      </div>
      <div class="review-section">
        <div class="review-section-title">📈 市场结构 · 指数概览</div>
        <div class="idx-grid">${idxCards}</div>
      </div>
      <div class="review-section">
        <div class="review-section-title">📊 涨跌统计</div>
        <div class="stats-grid">
          <div class="stat-card stat-up"><div class="stat-value" style="color:${colorUp}">${adv.up || 0}</div><div class="stat-label">上涨</div></div>
          <div class="stat-card stat-down"><div class="stat-value" style="color:${colorDown}">${adv.down || 0}</div><div class="stat-label">下跌</div></div>
          <div class="stat-card"><div class="stat-value">${adv.flat || 0}</div><div class="stat-label">平盘</div></div>
          <div class="stat-card"><div class="stat-value" style="color:${colorUp}">${adv.ratio || 0}</div><div class="stat-label">涨跌比</div></div>
          <div class="stat-card stat-up"><div class="stat-value" style="color:${colorUp}">${lu.up || 0}</div><div class="stat-label">涨停</div></div>
          <div class="stat-card stat-down"><div class="stat-value" style="color:${colorDown}">${lu.down || 0}</div><div class="stat-label">跌停</div></div>
          <div class="stat-card stat-highlight"><div class="stat-value" style="color:${colorUp}">${lh.max || 0}<span class="stat-unit">板</span></div><div class="stat-label">连板高度</div></div>
        </div>
      </div>
      ${themesHtml ? `<div class="review-section"><div class="review-section-title">💰 主线资金方向</div><div class="theme-list">${themesHtml}</div></div>` : ''}
      ${coreStocksHtml ? `<div class="review-section"><div class="review-section-title">🏆 核心个股 · 龙头识别</div><div class="core-stock-list">${coreStocksHtml}</div></div>` : ''}
      ${limitUpList ? `<div class="review-section"><div class="review-section-title">📋 涨停股清单 (Top 20)</div><div class="review-table-wrap"><table class="review-table"><thead><tr><th class="col-rank">#</th><th class="col-name">名称</th><th class="col-code">代码</th><th class="col-change">涨幅</th><th class="col-price">现价</th><th class="col-amount">成交额</th><th class="col-board">板块</th><th class="col-ban">连板</th></tr></thead><tbody>${limitUpList}</tbody></table></div></div>` : ''}
    </div>
  `;
}

$('genReviewBtn').addEventListener('click', generateReview);

// 顶部刷新按钮
$('refreshNews').addEventListener('click', async function() {
  this.classList.add('spinning');
  if (currentView === 'cls' || currentView === 'eastmoney') {
    await loadNews(currentView);
  } else if (currentView === 'market-review') {
    await loadReview();
  } else if (currentView === 'plan') {
    renderTasks();
  } else if (currentView === 'meditation') {
    renderMeditationHistory();
  } else if (currentView === 'reading') {
    renderReadingView();
  } else if (currentView === 'hot-stock') {
    loadHotStock();
  }
  setTimeout(() => this.classList.remove('spinning'), 800);
});

// ==================== 冥想课程模块 ====================
const MED_STORAGE_KEY = 'workbench_meditation';
let meditationState = {
  mode: 'breathing',
  minutes: 30,
  secondsLeft: 30 * 60,
  running: false,
  paused: false,
  timerId: null,
  breathPhase: 0
};

function loadMeditationHistory() {
  try {
    return JSON.parse(localStorage.getItem(MED_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveMeditationHistory(history) {
  localStorage.setItem(MED_STORAGE_KEY, JSON.stringify(history));
}

function getTodayKeyFull() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateMeditationDisplay() {
  $('medTime').textContent = formatDuration(meditationState.secondsLeft);
  if (meditationState.running) {
    $('medLabel').textContent = meditationState.paused ? '已暂停' : '冥想中...';
  } else if (meditationState.secondsLeft < meditationState.minutes * 60) {
    $('medLabel').textContent = '已结束';
  } else {
    $('medLabel').textContent = '准备开始';
  }
}

function updateMeditationStreak() {
  const history = loadMeditationHistory();
  const today = getTodayKeyFull();
  const todaySession = history.find(h => h.date === today);
  if (todaySession) {
    $('meditationStreak').textContent = `今日已冥想 ${todaySession.minutes} 分钟`;
  } else {
    $('meditationStreak').textContent = '今日尚未冥想';
  }
}

function startMeditation() {
  if (meditationState.running && !meditationState.paused) return;

  if (!meditationState.running) {
    meditationState.secondsLeft = meditationState.minutes * 60;
  }

  meditationState.running = true;
  meditationState.paused = false;

  $('medStart').style.display = 'none';
  $('medPause').style.display = 'inline-block';
  $('medStop').style.display = 'inline-block';

  updateMeditationDisplay();
  document.getElementById('meditationCircleInner').classList.add('breathing');

  meditationState.timerId = setInterval(() => {
    if (meditationState.paused) return;
    meditationState.secondsLeft--;
    updateMeditationDisplay();

    if (meditationState.secondsLeft <= 0) {
      completeMeditation();
    }
  }, 1000);
}

function pauseMeditation() {
  if (meditationState.paused) {
    meditationState.paused = false;
    $('medPause').textContent = '暂停';
    document.getElementById('meditationCircleInner').classList.add('breathing');
  } else {
    meditationState.paused = true;
    $('medPause').textContent = '继续';
    document.getElementById('meditationCircleInner').classList.remove('breathing');
  }
  updateMeditationDisplay();
}

function stopMeditation() {
  if (meditationState.timerId) clearInterval(meditationState.timerId);
  const elapsed = meditationState.minutes * 60 - meditationState.secondsLeft;
  meditationState.running = false;
  meditationState.paused = false;
  meditationState.secondsLeft = meditationState.minutes * 60;

  $('medStart').style.display = 'inline-block';
  $('medPause').style.display = 'none';
  $('medStop').style.display = 'none';
  $('medPause').textContent = '暂停';

  document.getElementById('meditationCircleInner').classList.remove('breathing');

  // 如果冥想超过1分钟，保存记录
  if (elapsed >= 60) {
    saveMeditationRecord(Math.floor(elapsed / 60));
  }

  updateMeditationDisplay();
  renderMeditationHistory();
}

function completeMeditation() {
  if (meditationState.timerId) clearInterval(meditationState.timerId);
  meditationState.running = false;
  meditationState.paused = false;
  meditationState.secondsLeft = meditationState.minutes * 60;

  $('medStart').style.display = 'inline-block';
  $('medPause').style.display = 'none';
  $('medStop').style.display = 'none';

  document.getElementById('meditationCircleInner').classList.remove('breathing');

  saveMeditationRecord(meditationState.minutes);
  updateMeditationDisplay();
  renderMeditationHistory();
  alert('冥想完成！感觉怎么样？');
}

function saveMeditationRecord(minutes) {
  const history = loadMeditationHistory();
  const today = getTodayKeyFull();
  const existing = history.find(h => h.date === today);

  if (existing) {
    existing.minutes += minutes;
    existing.sessions = (existing.sessions || 1) + 1;
    existing.lastMode = meditationState.mode;
  } else {
    history.push({
      date: today,
      minutes: minutes,
      sessions: 1,
      lastMode: meditationState.mode
    });
  }

  saveMeditationHistory(history);
  updateMeditationStreak();
}

function renderMeditationHistory() {
  renderMeditationPlan();

  const history = loadMeditationHistory().sort((a, b) => b.date.localeCompare(a.date));
  const list = $('medHistoryList');

  if (history.length === 0) {
    list.innerHTML = '<div class="med-empty">暂无记录，开始你的第一次冥想吧</div>';
    updateMeditationStreak();
    return;
  }

  const modeNames = {
    'breathing': '呼吸冥想',
    'body-scan': '身体扫描',
    'mindfulness': '正念冥想',
    'custom': '自定义'
  };

  list.innerHTML = history.slice(0, 10).map(h => `
    <div class="med-history-item">
      <div class="med-history-date">${h.date}</div>
      <div class="med-history-info">
        <span class="med-history-minutes">${h.minutes} 分钟</span>
        <span class="med-history-sessions">${h.sessions} 次</span>
        ${h.lastMode ? `<span class="med-history-mode">${modeNames[h.lastMode] || h.lastMode}</span>` : ''}
      </div>
    </div>
  `).join('');

  updateMeditationStreak();
}

// 冥想模式选择
document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    if (meditationState.running) {
      alert('请先结束当前冥想');
      return;
    }
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    const mode = card.dataset.mode;
    const minutes = parseInt(card.dataset.minutes);

    meditationState.mode = mode;

    if (mode === 'custom') {
      $('medCustomTime').style.display = 'flex';
    } else {
      $('medCustomTime').style.display = 'none';
      meditationState.minutes = minutes;
      meditationState.secondsLeft = minutes * 60;
      updateMeditationDisplay();
    }
  });
});

$('medSetCustom').addEventListener('click', () => {
  const val = parseInt($('medCustomMinutes').value);
  if (val >= 1 && val <= 120) {
    meditationState.minutes = val;
    meditationState.secondsLeft = val * 60;
    updateMeditationDisplay();
  } else {
    alert('请输入1-120之间的分钟数');
  }
});

$('medStart').addEventListener('click', startMeditation);
$('medPause').addEventListener('click', pauseMeditation);
$('medStop').addEventListener('click', stopMeditation);

// ==================== 21天初学者冥想计划 ====================
const MED_PLAN_PROGRESS_KEY = 'workbench_med_plan';

const MED_PLAN_DATA = {
  title: '21天初学者冥想计划',
  subtitle: '从5分钟到20分钟，循序渐进建立冥想习惯',
  phases: [
    { name: '第一阶段 · 基础入门', range: '第1-7天', desc: '学会坐定与呼吸', color: '#534AB7', bg: '#EEEDFE' },
    { name: '第二阶段 · 稳步提升', range: '第8-14天', desc: '建立专注力与觉察', color: '#0F6E56', bg: '#E1F5EE' },
    { name: '第三阶段 · 深化练习', range: '第15-21天', desc: '深入冥想体验', color: '#854F0B', bg: '#FAEEDA' },
  ],
  days: [
    { day: 1, phase: 0, title: '找到舒适的坐姿', minutes: 5, focus: '盘腿或坐在椅子上，脊柱挺直，双手放膝上', technique: '姿势调整' },
    { day: 2, phase: 0, title: '关注你的呼吸', minutes: 5, focus: '自然呼吸，注意空气进出鼻孔的感觉', technique: '呼吸觉察' },
    { day: 3, phase: 0, title: '数息法 1-10', minutes: 5, focus: '吸气数1，呼气数2...到10再重来', technique: '数息法' },
    { day: 4, phase: 0, title: '呼吸的进出', minutes: 7, focus: '感受吸气时的清凉与呼气时的温暖', technique: '呼吸觉察' },
    { day: 5, phase: 0, title: '身体放松扫描', minutes: 7, focus: '从头顶到脚趾，逐部位放松', technique: '身体扫描' },
    { day: 6, phase: 0, title: '放松与呼吸结合', minutes: 7, focus: '呼吸时感受身体的放松感', technique: '综合练习' },
    { day: 7, phase: 0, title: '第一周回顾', minutes: 10, focus: '回顾这一周的感受变化，记录你的体验', technique: '复盘反思' },
    { day: 8, phase: 1, title: '身体扫描入门', minutes: 10, focus: '系统地从脚到头扫描身体感受', technique: '身体扫描' },
    { day: 9, phase: 1, title: '完整的身体扫描', minutes: 10, focus: '不评判任何感受，只是观察', technique: '身体扫描' },
    { day: 10, phase: 1, title: '感受身体能量', minutes: 10, focus: '觉察身体内的能量流动与温度变化', technique: '能量觉察' },
    { day: 11, phase: 1, title: '情绪的觉察', minutes: 12, focus: '观察情绪的升起与消逝，不追随', technique: '情绪觉察' },
    { day: 12, phase: 1, title: '念头的来去', minutes: 12, focus: '将念头视为天空中的云，来去自如', technique: '念头觉察' },
    { day: 13, phase: 1, title: '不评判的觉察', minutes: 12, focus: '对一切体验保持平等心', technique: '正念觉察' },
    { day: 14, phase: 1, title: '第二周回顾', minutes: 15, focus: '回顾专注力的提升，记录进步', technique: '复盘反思' },
    { day: 15, phase: 2, title: '慈心冥想入门', minutes: 15, focus: '对自己说：愿我快乐，愿我平安', technique: '慈心冥想' },
    { day: 16, phase: 2, title: '扩展慈心', minutes: 15, focus: '将慈心扩展到你在乎的人', technique: '慈心冥想' },
    { day: 17, phase: 2, title: '对所有生命的慈心', minutes: 15, focus: '将慈心扩展到所有众生', technique: '慈心冥想' },
    { day: 18, phase: 2, title: '开放觉察', minutes: 18, focus: '不聚焦特定对象，觉察一切升起的体验', technique: '开放觉察' },
    { day: 19, phase: 2, title: '安住于当下', minutes: 18, focus: '完全安住在此刻，不追忆不期待', technique: '安住当下' },
    { day: 20, phase: 2, title: '无选择的觉察', minutes: 18, focus: '心如明镜，映照一切而不执取', technique: '无拣择觉察' },
    { day: 21, phase: 2, title: '21天回顾与展望', minutes: 20, focus: '回顾整个旅程，制定后续冥想计划', technique: '复盘反思' },
  ]
};

function loadMedPlanProgress() {
  try {
    return JSON.parse(localStorage.getItem(MED_PLAN_PROGRESS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveMedPlanProgress(progress) {
  localStorage.setItem(MED_PLAN_PROGRESS_KEY, JSON.stringify(progress));
}

function toggleMedPlanDay(day) {
  const progress = loadMedPlanProgress();
  const key = String(day);
  progress[key] = !progress[key];
  saveMedPlanProgress(progress);
  renderMeditationPlan();
}

function getMedPlanStats() {
  const progress = loadMedPlanProgress();
  const completedDays = MED_PLAN_DATA.days.filter(d => progress[String(d.day)]);
  const completedCount = completedDays.length;
  const totalDays = MED_PLAN_DATA.days.length;
  const pct = totalDays > 0 ? Math.round(completedCount / totalDays * 100) : 0;
  const currentDayData = MED_PLAN_DATA.days.find(d => !progress[String(d.day)]);
  const currentDayNum = currentDayData ? currentDayData.day : 21;
  const totalMinutes = completedDays.reduce((sum, d) => sum + d.minutes, 0);
  return { completedCount, totalDays, pct, currentDayNum, totalMinutes };
}

function renderMeditationPlan() {
  const container = $('medPlanContainer');
  if (!container) return;

  const progress = loadMedPlanProgress();
  const stats = getMedPlanStats();

  let html = '';

  // 概览
  html += '<div class="plan-overview">';
  html += `<div class="plan-progress-ring" style="background:conic-gradient(var(--primary) ${stats.pct * 3.6}deg, var(--border-light) 0deg)">`;
  html += `<div class="plan-progress-inner"><span class="plan-pct">${stats.pct}%</span></div>`;
  html += '</div>';
  html += '<div class="plan-overview-stats">';
  html += `<div class="plan-stat"><span class="plan-stat-val">${stats.completedCount}</span><span class="plan-stat-lbl">已完成</span></div>`;
  html += `<div class="plan-stat"><span class="plan-stat-val">${stats.totalDays - stats.completedCount}</span><span class="plan-stat-lbl">待完成</span></div>`;
  html += `<div class="plan-stat"><span class="plan-stat-val">D${stats.currentDayNum}</span><span class="plan-stat-lbl">当前天数</span></div>`;
  html += `<div class="plan-stat"><span class="plan-stat-val">${stats.totalMinutes}</span><span class="plan-stat-lbl">累计分钟</span></div>`;
  html += '</div>';
  html += '</div>';

  // 各阶段
  for (let pi = 0; pi < MED_PLAN_DATA.phases.length; pi++) {
    const phase = MED_PLAN_DATA.phases[pi];
    const phaseDays = MED_PLAN_DATA.days.filter(d => d.phase === pi);

    html += `<div class="plan-phase" style="border-color:${phase.color}40">`;
    html += `<div class="plan-phase-header" style="background:${phase.bg}">`;
    html += `<span class="plan-phase-name" style="color:${phase.color}">${phase.name}</span>`;
    html += `<span class="plan-phase-range">${phase.range} · ${phase.desc}</span>`;
    const phaseDone = phaseDays.filter(d => progress[String(d.day)]).length;
    html += `<span class="plan-phase-count">${phaseDone}/${phaseDays.length}</span>`;
    html += '</div>';

    html += '<div class="plan-days">';
    for (const d of phaseDays) {
      const isDone = progress[String(d.day)];
      const isCurrent = stats.currentDayNum === d.day;

      html += `<div class="plan-day-card ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}" onclick="toggleMedPlanDay(${d.day})">`;
      html += `<div class="plan-day-num" style="background:${phase.bg};color:${phase.color}">D${d.day}</div>`;
      html += `<div class="plan-day-content">`;
      html += `<div class="plan-day-lesson">第${d.day}天 · ${escapeHtml(d.title)}</div>`;
      html += `<div class="plan-day-task">⏱ ${d.minutes}分钟 · ${escapeHtml(d.technique)}</div>`;
      html += `<div class="plan-day-focus">${escapeHtml(d.focus)}</div>`;
      if (isCurrent && !isDone) {
        html += `<button class="med-plan-start-btn" onclick="event.stopPropagation(); startMedPlanDay(${d.day})">开始练习 →</button>`;
      }
      html += `</div>`;
      html += `<div class="plan-day-check">${isDone ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>`;
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
  }

  container.innerHTML = html;
}

function startMedPlanDay(day) {
  const dayData = MED_PLAN_DATA.days.find(d => d.day === day);
  if (!dayData) return;

  if (meditationState.running) {
    alert('请先结束当前冥想');
    return;
  }

  meditationState.minutes = dayData.minutes;
  meditationState.secondsLeft = dayData.minutes * 60;
  meditationState.mode = 'custom';

  updateMeditationDisplay();
  document.querySelector('.meditation-timer-section').scrollIntoView({ behavior: 'smooth', block: 'center' });

  startMeditation();
}

// ==================== 看书任务模块 ====================
const READ_STORAGE_KEY = 'workbench_reading';
const BOOK_STORAGE_KEY = 'workbench_books';
const PLAN_PROGRESS_KEY = 'workbench_book_plan';

// ==================== 第一性原理阅读计划 ====================
const BOOK_PLAN_DATA = {
  title: '第一性原理',
  author: '萧亮',
  lessons: [
    { n: 1, title: '什么是第一性原理', theme: '认知第一性原理的本质与起源，从亚里士多德到马斯克' },
    { n: 2, title: '如何用第一性原理思考', theme: '掌握拆解、溯源与批判性思维的实操方法' },
    { n: 3, title: '学习中的第一性原理', theme: '用第一性原理重塑学习方法，从知识搬运到知识生成' },
    { n: 4, title: '工作中的第一性原理', theme: '用第一性原理突破职业瓶颈，成为不可替代的专业人士' },
    { n: 5, title: '生活中的第一性原理', theme: '用第一性原理重构幸福、健康、消费与关系的底层逻辑' },
    { n: 6, title: '人生中的第一性原理', theme: '用第一性原理设计人生游戏规则，实现终身成长' },
  ],
  reviews: [
    { afterLesson: 2, title: '阶段复习 · 认知奠基', desc: '回顾第1-2章核心概念，整理第一性原理认知框架' },
    { afterLesson: 4, title: '阶段复习 · 方法实践', desc: '回顾第3-4章核心方法，梳理学习与工作中的应用体系' },
    { afterLesson: 6, title: '结语 + 全书总复习', desc: '阅读结语 + 回顾全书6章体系 + 制定个人行动计划' },
  ],
  dailyTemplate: [
    { day: 1, task: '通读本章全文', focus: '了解本章核心概念与整体框架' },
    { day: 2, task: '精读上半部分', focus: '标注重点，理解关键论述与案例' },
    { day: 3, task: '精读下半部分', focus: '深化理解，记录核心观点' },
    { day: 4, task: '思考与实践练习', focus: '将本章方法应用到自身场景' },
    { day: 5, task: '复盘总结+写笔记', focus: '整理笔记，记录感悟与行动计划' },
  ],
  phases: [
    { name: '第一阶段 · 认知奠基', range: '第1-2章', color: '#534AB7', bg: '#EEEDFE' },
    { name: '第二阶段 · 方法实践', range: '第3-4章', color: '#0F6E56', bg: '#E1F5EE' },
    { name: '第三阶段 · 生活应用', range: '第5-6章', color: '#854F0B', bg: '#FAEEDA' },
  ],
};

function generatePlanDays() {
  const days = [];
  let dayCounter = 0;
  let phaseIdx = 0;

  for (const lesson of BOOK_PLAN_DATA.lessons) {
    const lessonNum = lesson.n;
    if (lessonNum <= 2) phaseIdx = 0;
    else if (lessonNum <= 4) phaseIdx = 1;
    else phaseIdx = 2;

    for (const tpl of BOOK_PLAN_DATA.dailyTemplate) {
      dayCounter++;
      days.push({
        globalDay: dayCounter,
        lessonNum: lessonNum,
        lessonTitle: lesson.title,
        theme: lesson.theme,
        dayInLesson: tpl.day,
        task: tpl.task,
        focus: tpl.focus,
        type: 'lesson',
        phase: phaseIdx,
      });
    }

    const review = BOOK_PLAN_DATA.reviews.find(r => r.afterLesson === lessonNum);
    if (review) {
      dayCounter++;
      days.push({
        globalDay: dayCounter,
        lessonNum: lessonNum,
        lessonTitle: review.title,
        theme: review.desc,
        dayInLesson: 0,
        task: review.title,
        focus: review.desc,
        type: 'review',
        phase: phaseIdx,
      });
    }
  }

  return days;
}

const PLAN_DAYS = generatePlanDays();

function loadPlanProgress() {
  try {
    return JSON.parse(localStorage.getItem(PLAN_PROGRESS_KEY) || '{}');
  } catch {
    return {};
  }
}

function savePlanProgress(progress) {
  localStorage.setItem(PLAN_PROGRESS_KEY, JSON.stringify(progress));
}

function togglePlanDay(dayIdx) {
  const progress = loadPlanProgress();
  const key = String(dayIdx);
  progress[key] = !progress[key];
  savePlanProgress(progress);
  renderBookPlan();
}

function getPlanStats() {
  const progress = loadPlanProgress();
  const completed = PLAN_DAYS.filter(d => progress[String(d.globalDay)]);
  const completedCount = completed.length;
  const totalDays = PLAN_DAYS.length;
  const pct = totalDays > 0 ? Math.round(completedCount / totalDays * 100) : 0;

  const currentDay = PLAN_DAYS.find(d => !progress[String(d.globalDay)]);
  const currentLesson = currentDay ? currentDay.lessonNum : 6;

  return { completedCount, totalDays, pct, currentDay, currentLesson };
}

function toggleBranch(header) {
  const branch = header.parentElement;
  branch.classList.toggle('collapsed');
}

function renderBookPlan() {
  const container = $('bookPlanContainer');
  if (!container) return;

  const progress = loadPlanProgress();
  const stats = getPlanStats();
  const currentDayType = stats.currentDay ? stats.currentDay.dayInLesson : 1;

  let html = '';

  // 概览
  html += '<div class="plan-overview">';
  html += `<div class="plan-progress-ring" style="background:conic-gradient(var(--primary) ${stats.pct * 3.6}deg, var(--border-light) 0deg)">`;
  html += `<div class="plan-progress-inner"><span class="plan-pct">${stats.pct}%</span></div>`;
  html += '</div>';
  html += '<div class="plan-overview-stats">';
  html += `<div class="plan-stat"><span class="plan-stat-val">${stats.completedCount}</span><span class="plan-stat-lbl">已完成</span></div>`;
  html += `<div class="plan-stat"><span class="plan-stat-val">${stats.totalDays - stats.completedCount}</span><span class="plan-stat-lbl">待完成</span></div>`;
  html += `<div class="plan-stat"><span class="plan-stat-val">第${stats.currentLesson}章</span><span class="plan-stat-lbl">当前章节</span></div>`;
  html += `<div class="plan-stat"><span class="plan-stat-val">${stats.totalDays}</span><span class="plan-stat-lbl">总天数</span></div>`;
  html += '</div>';
  html += '</div>';

  // D1-D5 分支
  for (const tpl of BOOK_PLAN_DATA.dailyTemplate) {
    const dayDays = PLAN_DAYS.filter(d => d.type === 'lesson' && d.dayInLesson === tpl.day);
    const dayDone = dayDays.filter(d => progress[String(d.globalDay)]).length;
    const isCurrentBranch = currentDayType === tpl.day;
    const collapsed = isCurrentBranch ? '' : 'collapsed';

    html += `<div class="plan-branch ${collapsed}">`;
    html += `<div class="plan-branch-header" onclick="toggleBranch(this)">`;
    html += `<span class="plan-branch-toggle">▾</span>`;
    html += `<span class="plan-branch-num">D${tpl.day}</span>`;
    html += `<div class="plan-branch-info">`;
    html += `<div class="plan-branch-title">${escapeHtml(tpl.task)}</div>`;
    html += `<div class="plan-branch-focus">${escapeHtml(tpl.focus)}</div>`;
    html += `</div>`;
    html += `<span class="plan-branch-count ${dayDone === dayDays.length ? 'all-done' : ''}">${dayDone}/${dayDays.length}</span>`;
    html += `</div>`;

    html += '<div class="plan-branch-body">';
    for (const d of dayDays) {
      const isDone = progress[String(d.globalDay)];
      const isCurrent = stats.currentDay && d.globalDay === stats.currentDay.globalDay;
      const phase = BOOK_PLAN_DATA.phases[d.phase];

      html += `<div class="plan-day-card ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}" onclick="togglePlanDay(${d.globalDay})">`;
      html += `<div class="plan-day-num" style="background:${phase.bg};color:${phase.color}">C${d.lessonNum}</div>`;
      html += `<div class="plan-day-content">`;
      html += `<div class="plan-day-lesson">第${d.lessonNum}章 · ${escapeHtml(d.lessonTitle)}</div>`;
      html += `<div class="plan-day-task">${escapeHtml(d.theme)}</div>`;
      html += `</div>`;
      html += `<div class="plan-day-check">${isDone ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>`;
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
  }

  // 阶段复习
  const reviewDays = PLAN_DAYS.filter(d => d.type === 'review');
  if (reviewDays.length > 0) {
    const reviewDone = reviewDays.filter(d => progress[String(d.globalDay)]).length;
    html += `<div class="plan-branch collapsed">`;
    html += `<div class="plan-branch-header review-branch" onclick="toggleBranch(this)">`;
    html += `<span class="plan-branch-toggle">▾</span>`;
    html += `<span class="plan-branch-num review">★</span>`;
    html += `<div class="plan-branch-info">`;
    html += `<div class="plan-branch-title">阶段复习</div>`;
    html += `<div class="plan-branch-focus">每2章一次复习 · 整理笔记 + 回顾核心概念</div>`;
    html += `</div>`;
    html += `<span class="plan-branch-count ${reviewDone === reviewDays.length ? 'all-done' : ''}">${reviewDone}/${reviewDays.length}</span>`;
    html += `</div>`;

    html += '<div class="plan-branch-body">';
    for (const d of reviewDays) {
      const isDone = progress[String(d.globalDay)];
      const phase = BOOK_PLAN_DATA.phases[d.phase];

      html += `<div class="plan-day-card ${isDone ? 'done' : ''} review" onclick="togglePlanDay(${d.globalDay})">`;
      html += `<div class="plan-day-num" style="background:${phase.bg};color:${phase.color}">★</div>`;
      html += `<div class="plan-day-content">`;
      html += `<div class="plan-day-task">${escapeHtml(d.lessonTitle)}</div>`;
      html += `<div class="plan-day-focus">${escapeHtml(d.focus)}</div>`;
      html += '</div>';
      html += `<div class="plan-day-check">${isDone ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</div>`;
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
  }

  container.innerHTML = html;
}

function initBookPlan() {
  const books = loadBooks();
  const exists = books.some(b => b.name === BOOK_PLAN_DATA.title);
  if (!exists) {
    books.unshift({
      id: Date.now() + Math.random(),
      name: BOOK_PLAN_DATA.title,
      currentPage: 0,
      totalPages: 242,
      status: 'reading',
      createdAt: getTodayKeyFull(),
      isPlanBook: true,
    });
    saveBooks(books);
  }
}

let readingState = {
  minutes: 30,
  secondsLeft: 30 * 60,
  running: false,
  paused: false,
  timerId: null
};

function loadReadingHistory() {
  try {
    return JSON.parse(localStorage.getItem(READ_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveReadingHistory(history) {
  localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(history));
}

function loadBooks() {
  try {
    return JSON.parse(localStorage.getItem(BOOK_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveBooks(books) {
  localStorage.setItem(BOOK_STORAGE_KEY, JSON.stringify(books));
}

function updateReadingDisplay() {
  $('readingTimeDisplay').textContent = formatDuration(readingState.secondsLeft);
  if (readingState.running) {
    $('readingTimerLabel').textContent = readingState.paused ? '已暂停' : '阅读中...';
  } else if (readingState.secondsLeft < readingState.minutes * 60) {
    $('readingTimerLabel').textContent = '已结束';
  } else {
    $('readingTimerLabel').textContent = '准备开始';
  }
}

function updateReadingStreak() {
  const history = loadReadingHistory();
  const today = getTodayKeyFull();
  const todaySession = history.find(h => h.date === today);
  if (todaySession) {
    $('readingStreak').textContent = `今日已阅读 ${todaySession.minutes} 分钟`;
  } else {
    $('readingStreak').textContent = '今日尚未阅读';
  }
}

function startReading() {
  if (readingState.running && !readingState.paused) return;
  if (!readingState.running) {
    readingState.secondsLeft = readingState.minutes * 60;
  }
  readingState.running = true;
  readingState.paused = false;
  $('readStart').style.display = 'none';
  $('readPause').style.display = 'inline-block';
  $('readStop').style.display = 'inline-block';
  updateReadingDisplay();

  readingState.timerId = setInterval(() => {
    if (readingState.paused) return;
    readingState.secondsLeft--;
    updateReadingDisplay();
    if (readingState.secondsLeft <= 0) {
      completeReading();
    }
  }, 1000);
}

function pauseReading() {
  if (readingState.paused) {
    readingState.paused = false;
    $('readPause').textContent = '暂停';
  } else {
    readingState.paused = true;
    $('readPause').textContent = '继续';
  }
  updateReadingDisplay();
}

function stopReading() {
  if (readingState.timerId) clearInterval(readingState.timerId);
  const elapsed = readingState.minutes * 60 - readingState.secondsLeft;
  readingState.running = false;
  readingState.paused = false;
  readingState.secondsLeft = readingState.minutes * 60;
  $('readStart').style.display = 'inline-block';
  $('readPause').style.display = 'none';
  $('readStop').style.display = 'none';
  $('readPause').textContent = '暂停';

  if (elapsed >= 60) {
    saveReadingRecord(Math.floor(elapsed / 60));
  }
  updateReadingDisplay();
  renderReadingView();
}

function completeReading() {
  if (readingState.timerId) clearInterval(readingState.timerId);
  readingState.running = false;
  readingState.paused = false;
  readingState.secondsLeft = readingState.minutes * 60;
  $('readStart').style.display = 'inline-block';
  $('readPause').style.display = 'none';
  $('readStop').style.display = 'none';
  saveReadingRecord(readingState.minutes);
  updateReadingDisplay();
  renderReadingView();
  alert('阅读完成！继续保持这个好习惯');
}

function saveReadingRecord(minutes) {
  const history = loadReadingHistory();
  const today = getTodayKeyFull();
  const existing = history.find(h => h.date === today);
  if (existing) {
    existing.minutes += minutes;
    existing.sessions = (existing.sessions || 1) + 1;
  } else {
    history.push({ date: today, minutes: minutes, sessions: 1 });
  }
  saveReadingHistory(history);
  updateReadingStreak();
}

function addBook() {
  const name = $('bookInput').value.trim();
  const page = parseInt($('bookPageInput').value) || 0;
  const total = parseInt($('bookTotalInput').value) || 0;

  if (!name) {
    alert('请输入书名');
    return;
  }
  if (total > 0 && page > total) {
    alert('当前页不能超过总页数');
    return;
  }

  const books = loadBooks();
  books.push({
    id: Date.now() + Math.random(),
    name: name,
    currentPage: page,
    totalPages: total,
    status: 'reading',
    createdAt: getTodayKeyFull()
  });
  saveBooks(books);

  $('bookInput').value = '';
  $('bookPageInput').value = '';
  $('bookTotalInput').value = '';
  renderBooks();
}

function updateBookPage(id, page) {
  const books = loadBooks();
  const book = books.find(b => b.id === id);
  if (book) {
    book.currentPage = parseInt(page) || 0;
    if (book.totalPages > 0 && book.currentPage >= book.totalPages) {
      book.status = 'finished';
    }
    saveBooks(books);
    renderBooks();
  }
}

function deleteBook(id) {
  let books = loadBooks();
  books = books.filter(b => b.id !== id);
  saveBooks(books);
  renderBooks();
}

function renderBooks() {
  const books = loadBooks();
  const list = $('bookList');

  if (books.length === 0) {
    list.innerHTML = '<div class="med-empty">还没有添加书籍</div>';
    return;
  }

  list.innerHTML = books.map(book => {
    const pct = book.totalPages > 0 ? Math.min(100, Math.round(book.currentPage / book.totalPages * 100)) : 0;
    const isFinished = book.status === 'finished';
    return `
      <div class="book-card ${isFinished ? 'finished' : ''}">
        <div class="book-info">
          <div class="book-name">${escapeHtml(book.name)}</div>
          <div class="book-progress-text">
            第 ${book.currentPage} / ${book.totalPages || '?'} 页
            ${isFinished ? '<span class="book-finished-tag">已读完</span>' : ''}
          </div>
          ${book.totalPages > 0 ? `<div class="book-progress-bar"><div class="book-progress-fill" style="width:${pct}%"></div></div>` : ''}
        </div>
        <div class="book-controls">
          <input type="number" class="book-page-update" value="${book.currentPage}" min="0" max="${book.totalPages || 9999}" onchange="updateBookPage(${book.id}, this.value)" title="更新页码">
          <button class="book-delete-btn" onclick="deleteBook(${book.id})" title="删除">×</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderReadingStats() {
  const history = loadReadingHistory();
  const totalSessions = history.reduce((sum, h) => sum + (h.sessions || 1), 0);
  const totalMinutes = history.reduce((sum, h) => sum + h.minutes, 0);

  // 连续阅读天数
  const sortedDates = history.map(h => h.date).sort().reverse();
  let streak = 0;
  if (sortedDates.length > 0) {
    const today = getTodayKeyFull();
    const yesterday = new Date(Date.now() - 86400000);
    const yPad = n => String(n).padStart(2, '0');
    const yesterdayKey = `${yesterday.getFullYear()}-${yPad(yesterday.getMonth() + 1)}-${yPad(yesterday.getDate())}`;

    if (sortedDates.includes(today) || sortedDates.includes(yesterdayKey)) {
      let checkDate = sortedDates.includes(today) ? new Date() : yesterday;
      for (let i = 0; i < 365; i++) {
        const dPad = n => String(n).padStart(2, '0');
        const checkKey = `${checkDate.getFullYear()}-${dPad(checkDate.getMonth() + 1)}-${dPad(checkDate.getDate())}`;
        if (sortedDates.includes(checkKey)) {
          streak++;
          checkDate = new Date(checkDate.getTime() - 86400000);
        } else {
          break;
        }
      }
    }
  }

  $('totalReadSessions').textContent = totalSessions;
  $('totalReadMinutes').textContent = totalMinutes;
  $('readStreakDays').textContent = streak;
}

function renderReadingView() {
  initBookPlan();
  renderBookPlan();
  renderBooks();
  renderReadingHistory();
  renderReadingStats();
  updateReadingStreak();
}

function renderReadingHistory() {
  const history = loadReadingHistory().sort((a, b) => b.date.localeCompare(a.date));
  const list = $('readHistoryList');

  if (history.length === 0) {
    list.innerHTML = '<div class="med-empty">暂无记录</div>';
    return;
  }

  list.innerHTML = history.slice(0, 10).map(h => `
    <div class="med-history-item">
      <div class="med-history-date">${h.date}</div>
      <div class="med-history-info">
        <span class="med-history-minutes">${h.minutes} 分钟</span>
        <span class="med-history-sessions">${h.sessions} 次</span>
      </div>
    </div>
  `).join('');
}

$('readStart').addEventListener('click', startReading);
$('readPause').addEventListener('click', pauseReading);
$('readStop').addEventListener('click', stopReading);
$('addBookBtn').addEventListener('click', addBook);
$('bookInput').addEventListener('keydown', e => { if (e.key === 'Enter') addBook(); });

// ==================== 热门股分析模块 ====================
let currentHotStockCode = null;

async function loadHotStock() {
  const container = $('hotStockContainer');
  container.innerHTML = `<div class="review-loading"><div class="review-spinner"></div>正在加载热门股分析...</div>`;
  try {
    const resp = await fetchWithTimeout('/api/hot-stock/latest', 10000);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    if (!json.success || !json.data) {
      container.innerHTML = `
        <div class="review-empty">
          <span class="empty-icon">🔥</span>
          <p>暂无热门股分析报告</p>
          <p class="review-empty-hint">每天下午 15:05 自动生成，也可点击上方按钮手动生成</p>
          <button class="btn-review-gen-lg" onclick="generateHotStock()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 011-6.219-8.56"/><polyline points="21 4 21 10 15 10"/></svg>
            立即生成分析
          </button>
        </div>`;
      return;
    }
    try {
      renderHotStock(json.data);
    } catch (renderErr) {
      console.error('渲染热门股分析失败:', renderErr);
      container.innerHTML = `<div class="review-error">渲染失败: ${escapeHtml(renderErr.message)}</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="review-error">加载失败: ${escapeHtml(err.message)}<br><button class="btn-review-gen-lg" style="margin-top:12px" onclick="loadHotStock()">重试</button></div>`;
  }
}

async function generateHotStock(skipCode) {
  const container = $('hotStockContainer');
  const btn = $('genHotStockBtn');
  if (btn) btn.disabled = true;
  container.innerHTML = `<div class="review-loading"><div class="review-spinner"></div>正在分析市场热门股，预计需要5-10秒...</div>`;
  try {
    const skipParam = skipCode ? `?skip=${skipCode}` : '';
    const resp = await fetchWithTimeout(`/api/hot-stock/generate${skipParam}`, 60000);
    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try { const errJson = await resp.json(); errMsg = errJson.error || errMsg; } catch {}
      throw new Error(errMsg);
    }
    const json = await resp.json();
    if (json.success && json.data) {
      try {
        renderHotStock(json.data);
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        $('hotStockUpdateTime').textContent = `生成于 ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      } catch (renderErr) {
        console.error('渲染热门股分析失败:', renderErr);
        container.innerHTML = `<div class="review-error">数据已生成，但渲染出错: ${escapeHtml(renderErr.message)}</div>`;
      }
    } else {
      container.innerHTML = `<div class="review-error">生成失败: ${escapeHtml(json.error || '未知错误')}</div>`;
    }
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    container.innerHTML = `<div class="review-error">生成失败: ${escapeHtml(isTimeout ? '请求超时，请重试' : err.message)}</div>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderHotStock(data) {
  const container = $('hotStockContainer');
  const r = data;
  currentHotStockCode = r.stock?.code || null;

  const colorUp = '#ef4444';
  const colorDown = '#10b981';
  const chg = r.marketData?.changePercent || 0;
  const chgColor = chg >= 0 ? colorUp : colorDown;
  const sign = v => v >= 0 ? '+' : '';

  const t = r.technical || {};
  const f = r.fundamentals || {};
  const cp = r.companyProfile || null;
  const s = r.sentiment || {};
  const risk = r.risk || {};
  const c = r.conclusion || {};

  const riskColors = { '高风险': '#ef4444', '中高风险': '#f59e0b', '中风险': '#3b82f6', '低风险': '#10b981' };
  const riskColor = riskColors[risk.level] || '#6b7280';

  const bullHtml = (c.bullPoints || []).map(p => `<li class="analysis-bull">${escapeHtml(p)}</li>`).join('');
  const bearHtml = (c.bearPoints || []).map(p => `<li class="analysis-bear">${escapeHtml(p)}</li>`).join('');

  const riskFactorsHtml = (risk.factors || []).map(fac => `<li>${escapeHtml(fac)}</li>`).join('');
  const trendHtml = (t.trendLabels || []).map((label, i) => `<span class="analysis-tag">${escapeHtml(label)}</span>`).join('');

  const klineChart = renderKlineChart(t.recentKlines, t.ma5, t.ma20);

  container.innerHTML = `
    <div class="hot-stock-scroll">
      <!-- 选股理由 -->
      <div class="hs-rationale">
        <span class="hs-rationale-label">📊 选股理由</span>
        <span class="hs-rationale-text">${escapeHtml(r.selectionRationale || '')}</span>
      </div>

      <!-- 股票头部 -->
      <div class="hs-header-card">
        <div class="hs-header-left">
          <div class="hs-stock-name">${escapeHtml(r.stock?.name || '')}</div>
          <div class="hs-stock-code">${r.stock?.code || ''} · ${escapeHtml(r.stock?.board || '')} · ${escapeHtml(r.stock?.concept || '')}</div>
        </div>
        <div class="hs-header-right">
          <div class="hs-price">${r.marketData?.current ? r.marketData.current.toFixed(2) : '--'}</div>
          <div class="hs-change" style="color:${chgColor}">${sign(chg)}${chg.toFixed(2)}%</div>
        </div>
      </div>

      ${cp ? `
      <!-- 公司介绍 -->
      <div class="hs-company-profile">
        <div class="hs-card-title">🏢 公司简介</div>
        ${cp.mainBusiness ? `<div class="hs-main-business">${escapeHtml(cp.mainBusiness)}</div>` : ''}
        ${cp.profile ? `<div class="hs-profile-text">${escapeHtml(cp.profile)}</div>` : ''}
        <div class="hs-profile-grid">
          ${cp.fullName ? `<div class="hs-profile-item"><span class="hs-profile-label">全称</span><span class="hs-profile-value">${escapeHtml(cp.fullName)}</span></div>` : ''}
          ${cp.industry ? `<div class="hs-profile-item"><span class="hs-profile-label">行业</span><span class="hs-profile-value">${escapeHtml(cp.industry)}</span></div>` : ''}
          ${cp.industryEM ? `<div class="hs-profile-item"><span class="hs-profile-label">所属板块</span><span class="hs-profile-value">${escapeHtml(cp.industryEM)}</span></div>` : ''}
          ${cp.listingDate ? `<div class="hs-profile-item"><span class="hs-profile-label">上市日期</span><span class="hs-profile-value">${cp.listingDate}</span></div>` : ''}
          ${cp.foundedDate ? `<div class="hs-profile-item"><span class="hs-profile-label">成立日期</span><span class="hs-profile-value">${cp.foundedDate}</span></div>` : ''}
          ${cp.employees ? `<div class="hs-profile-item"><span class="hs-profile-label">员工人数</span><span class="hs-profile-value">${cp.employees}人</span></div>` : ''}
          ${cp.actualHolder ? `<div class="hs-profile-item"><span class="hs-profile-label">实际控制人</span><span class="hs-profile-value">${escapeHtml(cp.actualHolder)}</span></div>` : ''}
          ${cp.chairman ? `<div class="hs-profile-item"><span class="hs-profile-label">董事长</span><span class="hs-profile-value">${escapeHtml(cp.chairman)}</span></div>` : ''}
          ${cp.province ? `<div class="hs-profile-item"><span class="hs-profile-label">所在省份</span><span class="hs-profile-value">${escapeHtml(cp.province)}</span></div>` : ''}
        </div>
      </div>
      ` : ''}

      <!-- 市场数据 -->
      <div class="hs-data-grid">
        <div class="hs-data-item"><span class="hs-data-label">今开</span><span class="hs-data-value">${r.marketData?.open ? r.marketData.open.toFixed(2) : '--'}</span></div>
        <div class="hs-data-item"><span class="hs-data-label">最高</span><span class="hs-data-value" style="color:${colorUp}">${r.marketData?.high ? r.marketData.high.toFixed(2) : '--'}</span></div>
        <div class="hs-data-item"><span class="hs-data-label">最低</span><span class="hs-data-value" style="color:${colorDown}">${r.marketData?.low ? r.marketData.low.toFixed(2) : '--'}</span></div>
        <div class="hs-data-item"><span class="hs-data-label">昨收</span><span class="hs-data-value">${r.marketData?.prevClose ? r.marketData.prevClose.toFixed(2) : '--'}</span></div>
        <div class="hs-data-item"><span class="hs-data-label">成交额</span><span class="hs-data-value">${r.marketData?.amount ? r.marketData.amount.toFixed(1) + '亿' : '--'}</span></div>
        <div class="hs-data-item"><span class="hs-data-label">换手率</span><span class="hs-data-value">${r.marketData?.turnoverRate ? r.marketData.turnoverRate.toFixed(1) + '%' : '--'}</span></div>
      </div>

      <!-- 分析卡片 2x2 -->
      <div class="hs-analysis-grid">
        <!-- 技术面 -->
        <div class="hs-analysis-card">
          <div class="hs-card-title">📈 技术分析</div>
          <div class="hs-card-body">
            <div class="hs-tech-row"><span>MA5</span><span style="color:${t.ma5 && r.marketData?.current > t.ma5 ? colorUp : colorDown}">${t.ma5 || '--'}</span></div>
            <div class="hs-tech-row"><span>MA10</span><span style="color:${t.ma10 && r.marketData?.current > t.ma10 ? colorUp : colorDown}">${t.ma10 || '--'}</span></div>
            <div class="hs-tech-row"><span>MA20</span><span style="color:${t.ma20 && r.marketData?.current > t.ma20 ? colorUp : colorDown}">${t.ma20 || '--'}</span></div>
            <div class="hs-tech-row"><span>MA60</span><span style="color:${t.ma60 && r.marketData?.current > t.ma60 ? colorUp : colorDown}">${t.ma60 || '--'}</span></div>
            <div class="hs-tech-row"><span>RSI(14)</span><span style="color:${t.rsi > 70 ? '#ef4444' : t.rsi < 30 ? '#10b981' : 'var(--text-1)'}">${t.rsi || '--'}</span></div>
            <div class="hs-tech-row"><span>K线形态</span><span style="font-weight:600">${t.klinePattern ? escapeHtml(t.klinePattern.pattern) : '--'}</span></div>
            <div class="hs-tech-row"><span>量能</span><span style="color:${t.volumeRatio?.trend === '巨量' || t.volumeRatio?.trend === '放量' ? colorUp : 'var(--text-2)'}">${t.volumeRatio ? escapeHtml(t.volumeRatio.trend) : '--'} (×${t.volumeRatio?.ratio || 1})</span></div>
            <div class="hs-tech-row"><span>支撑位</span><span style="color:${colorDown}">${t.support || '--'}</span></div>
            <div class="hs-tech-row"><span>压力位</span><span style="color:${colorUp}">${t.resistance || '--'}</span></div>
            ${t.klinePattern ? `<div class="hs-pattern-desc">${escapeHtml(t.klinePattern.desc)}</div>` : ''}
            ${trendHtml ? `<div class="hs-trend-tags">${trendHtml}</div>` : ''}
          </div>
        </div>

        <!-- 基本面 -->
        <div class="hs-analysis-card">
          <div class="hs-card-title">💰 基本面</div>
          <div class="hs-card-body">
            <div class="hs-tech-row"><span>市盈率(PE)</span><span style="font-weight:600">${f.pe !== null && f.pe !== undefined ? f.pe : '亏损'}</span></div>
            <div class="hs-tech-row"><span>市净率(PB)</span><span style="font-weight:600">${f.pb !== null && f.pb !== undefined ? f.pb : '--'}</span></div>
            <div class="hs-tech-row"><span>总市值</span><span>${f.marketCap ? f.marketCap + '亿' : '--'}</span></div>
            <div class="hs-tech-row"><span>流通市值</span><span>${f.circulatingMarketCap ? f.circulatingMarketCap + '亿' : '--'}</span></div>
            <div class="hs-tech-row"><span>板块</span><span>${f.board ? escapeHtml(f.board) : '--'}</span></div>
            <div class="hs-tech-row"><span>概念</span><span>${f.concept ? escapeHtml(f.concept) : '--'}</span></div>
            ${f.roe !== null && f.roe !== undefined ? `<div class="hs-tech-row"><span>ROE</span><span>${f.roe}%</span></div>` : ''}
            ${f.grossMargin !== null && f.grossMargin !== undefined ? `<div class="hs-tech-row"><span>毛利率</span><span>${f.grossMargin}%</span></div>` : ''}
            ${f.netMargin !== null && f.netMargin !== undefined ? `<div class="hs-tech-row"><span>净利率</span><span>${f.netMargin}%</span></div>` : ''}
            <div class="hs-valuation-badge" style="background:${f.valuation === '低估值' ? 'var(--green-light)' : f.valuation === '高估值' ? 'var(--red-light)' : f.valuation === '偏高估值' ? 'var(--amber-light)' : 'var(--blue-light)'};color:${f.valuation === '低估值' ? 'var(--green)' : f.valuation === '高估值' ? 'var(--red)' : f.valuation === '偏高估值' ? 'var(--amber)' : 'var(--blue)'}">${escapeHtml(f.valuation || '--')}</div>
          </div>
        </div>

        <!-- 市场情绪 -->
        <div class="hs-analysis-card">
          <div class="hs-card-title">🔥 市场情绪</div>
          <div class="hs-card-body">
            <div class="hs-momentum-bar">
              <div class="hs-momentum-label">动量评分</div>
              <div class="hs-momentum-track"><div class="hs-momentum-fill" style="width:${s.momentumScore || 0}%"></div></div>
              <div class="hs-momentum-score">${s.momentumScore || 0}/100</div>
            </div>
            <div class="hs-tech-row"><span>换手级别</span><span style="font-weight:600">${s.turnoverLevel ? escapeHtml(s.turnoverLevel) : '--'}</span></div>
            ${s.isLimitUp ? `<div class="hs-tech-row"><span>涨停</span><span style="color:${colorUp};font-weight:700">${s.banCount > 1 ? s.banCount + '连板' : '首板涨停'}</span></div>` : ''}
            <div class="hs-tech-row"><span>量能</span><span style="color:${s.volumeSurge ? colorUp : 'var(--text-2)'}">${s.volumeSurge ? '放量' : '平量'}</span></div>
            <div class="hs-sentiment-desc">${escapeHtml(s.description || '')}</div>
          </div>
        </div>

        <!-- 风险评估 -->
        <div class="hs-analysis-card">
          <div class="hs-card-title">⚠️ 风险评估</div>
          <div class="hs-card-body">
            <div class="hs-risk-badge" style="background:${riskColor}1a;color:${riskColor};border-color:${riskColor}">${escapeHtml(risk.level || '--')}</div>
            <ul class="hs-risk-list">${riskFactorsHtml || '<li>暂无风险数据</li>'}</ul>
          </div>
        </div>
      </div>

      <!-- K线走势图 -->
      ${klineChart ? `
      <div class="hs-kline-section">
        <div class="hs-card-title">📊 近30日K线走势</div>
        <div class="hs-kline-chart">${klineChart}</div>
      </div>` : ''}

      <!-- 综合结论 -->
      <div class="hs-conclusion">
        <div class="hs-card-title">📋 综合结论</div>
        <div class="hs-conclusion-summary">${escapeHtml(c.summary || '')}</div>
        <div class="hs-conclusion-points">
          <div class="hs-points-col">
            <div class="hs-points-title" style="color:${colorUp}">看多因素</div>
            <ul class="hs-points-list">${bullHtml}</ul>
          </div>
          <div class="hs-points-col">
            <div class="hs-points-title" style="color:${colorDown}">看空因素</div>
            <ul class="hs-points-list">${bearHtml}</ul>
          </div>
        </div>
        <div class="hs-operation">
          <span class="hs-operation-label">操作建议</span>
          <span class="hs-operation-text">${escapeHtml(c.operation || '')}</span>
        </div>
        <div class="hs-meta">
          <span>📅 ${r.date || ''}</span>
          <span>⏱ 生成耗时 ${r.elapsed || 0}ms</span>
        </div>
      </div>
    </div>
  `;
}

function renderKlineChart(klines, ma5, ma20) {
  if (!klines || klines.length === 0) return '';

  const candleWidth = 12;
  const candleGap = 4;
  const leftPad = 40;
  const chartWidth = klines.length * (candleWidth + candleGap) + leftPad + 10;
  const chartHeight = 160;
  const volumeHeight = 40;
  const totalHeight = chartHeight + volumeHeight + 25;

  const prices = klines.flatMap(k => [k.high, k.low]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;
  const padding = priceRange * 0.1;
  const scaledMin = minPrice - padding;
  const scaledMax = maxPrice + padding;
  const scaledRange = scaledMax - scaledMin;

  const volumes = klines.map(k => k.volume);
  const maxVol = Math.max(...volumes) || 1;

  const yScale = chartHeight / scaledRange;

  let svg = `<svg viewBox="0 0 ${chartWidth} ${totalHeight}" class="kline-svg" preserveAspectRatio="xMidYMid meet">`;

  // Price grid lines
  for (let i = 0; i <= 4; i++) {
    const y = (i / 4) * chartHeight;
    const price = scaledMax - (i / 4) * scaledRange;
    svg += `<line x1="${leftPad}" y1="${y}" x2="${chartWidth - 10}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="2,2"/>`;
    svg += `<text x="2" y="${y + 3}" font-size="9" fill="#9ca3af">${price.toFixed(2)}</text>`;
  }

  // MA20 line
  if (ma20 && klines.length >= 20) {
    const ma20Points = [];
    for (let i = 0; i < klines.length; i++) {
      if (i >= 19) {
        const slice = klines.slice(i - 19, i + 1);
        const avg = slice.reduce((s, k) => s + k.close, 0) / 20;
        const x = leftPad + i * (candleWidth + candleGap) + candleGap + candleWidth / 2;
        const y = (scaledMax - avg) * yScale;
        ma20Points.push(`${x},${y}`);
      }
    }
    if (ma20Points.length > 1) {
      svg += `<polyline points="${ma20Points.join(' ')}" fill="none" stroke="#3b82f6" stroke-width="1" opacity="0.6"/>`;
    }
  }

  // Candles
  klines.forEach((k, i) => {
    const x = leftPad + i * (candleWidth + candleGap) + candleGap;
    const isUp = k.close >= k.open;
    const color = isUp ? '#ef4444' : '#10b981';
    const bodyTop = (scaledMax - Math.max(k.open, k.close)) * yScale;
    const bodyBottom = (scaledMax - Math.min(k.open, k.close)) * yScale;
    const bodyHeight = Math.max(1, bodyBottom - bodyTop);
    const wickTop = (scaledMax - k.high) * yScale;
    const wickBottom = (scaledMax - k.low) * yScale;

    svg += `<line x1="${x + candleWidth / 2}" y1="${wickTop}" x2="${x + candleWidth / 2}" y2="${wickBottom}" stroke="${color}" stroke-width="1"/>`;
    svg += `<rect x="${x}" y="${bodyTop}" width="${candleWidth}" height="${bodyHeight}" fill="${color}" rx="1"/>`;

    const volY = chartHeight + 8 + (1 - k.volume / maxVol) * volumeHeight;
    svg += `<rect x="${x}" y="${volY}" width="${candleWidth}" height="${k.volume / maxVol * volumeHeight}" fill="${color}" opacity="0.25" rx="1"/>`;
  });

  // Date labels
  const labelInterval = Math.ceil(klines.length / 5);
  klines.forEach((k, i) => {
    if (i % labelInterval === 0 || i === klines.length - 1) {
      const x = leftPad + i * (candleWidth + candleGap) + candleGap + candleWidth / 2;
      const date = (k.date || '').slice(5);
      svg += `<text x="${x}" y="${totalHeight - 3}" font-size="8" fill="#9ca3af" text-anchor="middle">${date}</text>`;
    }
  });

  // MA legend
  svg += `<text x="${leftPad}" y="${totalHeight - 3}" font-size="8" fill="#3b82f6">— MA20 ${ma20 || ''}</text>`;

  svg += '</svg>';
  return svg;
}

$('genHotStockBtn').addEventListener('click', () => generateHotStock());
$('changeStockBtn').addEventListener('click', () => {
  if (currentHotStockCode) generateHotStock(currentHotStockCode);
  else generateHotStock();
});

// 暴露给内联事件
window.generateHotStock = generateHotStock;
window.loadHotStock = loadHotStock;
window.toggleTask = toggleTask;
window.deleteTask = deleteTask;
window.loadNews = loadNews;
window.generateReview = generateReview;
window.loadReview = loadReview;
window.updateBookPage = updateBookPage;
window.deleteBook = deleteBook;
window.togglePlanDay = togglePlanDay;
window.toggleBranch = toggleBranch;
window.toggleMedPlanDay = toggleMedPlanDay;
window.startMedPlanDay = startMedPlanDay;
