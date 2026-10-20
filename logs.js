// Visitor Logs Viewer JavaScript for issei-desu/ichiHP
const GITHUB_OWNER = 'issei-desu';
const GITHUB_REPO = 'ichiHP';
const VISITOR_LOG_TOPIC = 'ichihp_logs_8f4e2a9c1b7d';
const VISITOR_LOGS_ARCHIVE_KEY = 'hp_visitor_logs_archive';
const VISITOR_LOGS_CLEARED_AT_KEY = 'hp_logs_cleared_at';

let currentVisitorLogs = [];
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkAuthAndInitialize();
});

function getAuthHeader(token) {
  return `Bearer ${token.trim()}`;
}

async function verifyToken(token) {
  if (!token || !token.trim()) {
    return { valid: false, message: 'トークンが入力されていません' };
  }
  const cleanToken = token.trim();
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': getAuthHeader(cleanToken),
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (userRes.status === 401) {
      return { valid: false, message: '認証コード（トークン）が無効です' };
    }
    if (!userRes.ok) {
      return { valid: false, message: `認証エラー (${userRes.status})` };
    }

    const userData = await userRes.json();
    if (userData.login.toLowerCase() !== GITHUB_OWNER.toLowerCase()) {
      return { valid: false, message: `アカウント不一致: @${userData.login} はこのリポジトリの管理者ではありません` };
    }

    return { valid: true, user: userData };
  } catch (err) {
    return { valid: false, message: `通信エラー: ${err.message}` };
  }
}

async function checkAuthAndInitialize() {
  const token = localStorage.getItem('gh_token');
  if (token) {
    const verification = await verifyToken(token);
    if (verification.valid) {
      unlockLogsScreen();
      return;
    } else {
      localStorage.removeItem('gh_token');
    }
  }
  lockLogsScreen();
}

function unlockLogsScreen() {
  document.getElementById('auth-lock-screen').style.display = 'none';
  document.getElementById('admin-content').style.display = 'flex';
  document.getElementById('header-logout-btn').style.display = 'inline-block';

  if (localStorage.getItem('hp_ignore_my_visits') === null) {
    localStorage.setItem('hp_ignore_my_visits', '1');
  }
  const ignoreCheckbox = document.getElementById('ignore-my-visits-checkbox');
  if (ignoreCheckbox) {
    ignoreCheckbox.checked = localStorage.getItem('hp_ignore_my_visits') === '1';
  }

  loadVisitorLogs(false);
}

function lockLogsScreen() {
  document.getElementById('auth-lock-screen').style.display = 'flex';
  document.getElementById('admin-content').style.display = 'none';
  document.getElementById('header-logout-btn').style.display = 'none';
}

function setupEventListeners() {
  // Lock screen form submit
  const lockForm = document.getElementById('lock-form');
  const tokenInput = document.getElementById('lock-token-input');
  lockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = tokenInput.value.trim();
    if (!token) {
      showToast('認証コードを入力してください', 'error');
      return;
    }

    const unlockBtn = document.getElementById('unlock-btn');
    const btnText = document.getElementById('unlock-btn-text');
    const spinner = document.getElementById('unlock-btn-spinner');

    unlockBtn.disabled = true;
    btnText.textContent = '認証中...';
    spinner.style.display = 'inline-block';

    const verification = await verifyToken(token);

    unlockBtn.disabled = false;
    btnText.textContent = '🔓 ロック解除してログイン';
    spinner.style.display = 'none';

    if (!verification.valid) {
      showToast(verification.message, 'error');
      alert(`【認証失敗】\n${verification.message}`);
      return;
    }

    localStorage.setItem('gh_token', token);
    tokenInput.value = '';
    unlockLogsScreen();
    showToast('✨ 認証に成功しました！', 'success');
  });

  // Logout button
  document.getElementById('header-logout-btn').addEventListener('click', () => {
    if (confirm('ログアウトして画面をロックしますか？')) {
      localStorage.removeItem('gh_token');
      lockLogsScreen();
      showToast('ログアウトしました', 'info');
    }
  });

  // Refresh logs button
  const refreshLogsBtn = document.getElementById('refresh-logs-btn');
  if (refreshLogsBtn) {
    refreshLogsBtn.addEventListener('click', () => loadVisitorLogs(true));
  }

  // Ignore my visits checkbox
  const ignoreCheckbox = document.getElementById('ignore-my-visits-checkbox');
  if (ignoreCheckbox) {
    ignoreCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        localStorage.setItem('hp_ignore_my_visits', '1');
        showToast('🚫 この端末からのアクセスを記録しない設定にしました', 'info');
      } else {
        localStorage.setItem('hp_ignore_my_visits', '0');
        sessionStorage.removeItem('hp_visit_logged_at');
        showToast('✅ この端末からのアクセスも記録するようにしました（動作テスト用）', 'success');
      }
    });
  }

  // Copy logs button
  const copyLogsBtn = document.getElementById('copy-logs-btn');
  if (copyLogsBtn) {
    copyLogsBtn.addEventListener('click', copyVisitorLogsToClipboard);
  }

  // Clear logs button
  const clearLogsBtn = document.getElementById('clear-logs-btn');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', clearVisitorLogsArchive);
  }

  // Search input filter
  const searchInput = document.getElementById('logs-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = (e.target.value || '').trim().toLowerCase();
      renderVisitorLogs();
    });
  }
}

async function loadVisitorLogs(showNotification = false) {
  const refreshBtn = document.getElementById('refresh-logs-btn');
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    const clearedAt = Number(localStorage.getItem(VISITOR_LOGS_CLEARED_AT_KEY) || 0);

    // 1. Load locally archived logs
    let archived = [];
    try {
      const raw = localStorage.getItem(VISITOR_LOGS_ARCHIVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) archived = parsed;
      }
    } catch (e) {}

    // 2. Fetch recent logs from ntfy.sh cloud stream
    const res = await fetch(`https://ntfy.sh/${VISITOR_LOG_TOPIC}/json?poll=1&since=all`, {
      cache: 'no-store'
    });

    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n').filter(Boolean);
      const mapById = new Map();

      archived.forEach(item => {
        if (item && item.id && (item.time || 0) > clearedAt) {
          mapById.set(item.id, item);
        }
      });

      lines.forEach(line => {
        try {
          const envelope = JSON.parse(line);
          if (envelope && envelope.event === 'message' && envelope.message) {
            const entry = JSON.parse(envelope.message);
            const entryTime = entry.time || (envelope.time ? envelope.time * 1000 : Date.now());
            if (entry && entry.id && entryTime > clearedAt) {
              entry.time = entryTime;
              mapById.set(entry.id, entry);
            }
          }
        } catch (e) {}
      });

      currentVisitorLogs = Array.from(mapById.values())
        .sort((a, b) => (b.time || 0) - (a.time || 0))
        .slice(0, 300);

      try {
        localStorage.setItem(VISITOR_LOGS_ARCHIVE_KEY, JSON.stringify(currentVisitorLogs));
      } catch (e) {}
    } else {
      currentVisitorLogs = archived.filter(item => (item.time || 0) > clearedAt);
    }

    renderVisitorLogs();
    if (showNotification) {
      showToast('✨ 最新アクセスログを取得しました', 'success');
    }
  } catch (err) {
    console.warn('Error fetching visitor logs:', err);
    renderVisitorLogs();
    if (showNotification) {
      showToast('ログの取得に失敗しました', 'error');
    }
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function renderVisitorLogs() {
  const listEl = document.getElementById('visitor-logs-list');
  const totalEl = document.getElementById('logs-total-count');
  const uniqueEl = document.getElementById('logs-unique-count');
  if (!listEl) return;

  const totalCount = currentVisitorLogs.length;
  const uniqueIps = new Set(currentVisitorLogs.map(l => l.ip || l.ipv6 || 'unknown')).size;

  if (totalEl) totalEl.textContent = String(totalCount);
  if (uniqueEl) uniqueEl.textContent = String(uniqueIps);

  if (totalCount === 0) {
    listEl.innerHTML = `
      <div class="logs-empty-state">
        まだアクセス記録がありません。<br>
        <span style="font-size: 0.76rem;">※「🚫 このスマホのアクセスは記録しない」のチェックを外してHPを開くと、テスト記録できます。</span>
      </div>
    `;
    return;
  }

  let filtered = currentVisitorLogs;
  if (searchQuery) {
    filtered = currentVisitorLogs.filter(log => {
      const str = `${log.ip || ''} ${log.ipv6 || ''} ${log.location || ''} ${log.isp || ''} ${log.device || ''} ${log.browser || ''} ${log.referrer || ''}`.toLowerCase();
      return str.includes(searchQuery);
    });
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="logs-empty-state">
        「${escapeHtml(searchQuery)}」に一致するログは見つかりませんでした。
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(log => {
    const dateStr = formatLogDate(log.time);
    const ipStr = log.ip || '不明';
    const ipv6Info = log.ipv6 ? ` <span style="font-size:0.7rem; color:#64748b;">(IPv6: ${escapeHtml(log.ipv6)})</span>` : '';
    const ispInfo = log.isp ? ` ・ <span style="color:#64748b;">${escapeHtml(log.isp)}</span>` : '';
    const screenInfo = log.screen ? ` (${escapeHtml(log.screen)})` : '';

    return `
      <div class="visitor-log-item">
        <div class="log-item-top">
          <span class="log-time">🕒 ${escapeHtml(dateStr)}</span>
          <button type="button" class="log-ip-badge" onclick="copyIpToClipboard('${escapeAttr(ipStr)}')" title="タップしてIPをコピー">
            🌐 IP: ${escapeHtml(ipStr)} 📋
          </button>
        </div>
        ${ipv6Info ? `<div class="log-meta-line">${ipv6Info}</div>` : ''}
        <div class="log-meta-line">📍 ${escapeHtml(log.location || '地域不明')}${ispInfo}</div>
        <div class="log-meta-line">${escapeHtml(log.device || '端末不明')} ・ ${escapeHtml(log.browser || '')}${screenInfo}</div>
        <div class="log-meta-line">🔗 参照元: ${escapeHtml(log.referrer || '直接アクセス')}</div>
      </div>
    `;
  }).join('');
}

function formatLogDate(ts) {
  if (!ts) return '日時不明';
  const d = new Date(ts);
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  let rel = '';
  if (diffSec < 60) rel = '（たった今）';
  else if (diffSec < 3600) rel = `（${Math.floor(diffSec / 60)}分前）`;
  else if (diffSec < 86400) rel = `（${Math.floor(diffSec / 3600)}時間前）`;
  else rel = `（${Math.floor(diffSec / 86400)}日前）`;

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss} ${rel}`;
}

window.copyIpToClipboard = function(ip) {
  if (!ip) return;
  navigator.clipboard?.writeText(ip).then(() => {
    showToast(`📋 IPアドレス (${ip}) をコピーしました`, 'info');
  }).catch(() => {});
};

function copyVisitorLogsToClipboard() {
  if (currentVisitorLogs.length === 0) {
    showToast('コピーするログがありません', 'error');
    return;
  }
  const lines = currentVisitorLogs.map(l =>
    `[${formatLogDate(l.time)}] IP: ${l.ip}${l.ipv6 ? ` (IPv6: ${l.ipv6})` : ''} | ${l.location} (${l.isp || '-'}) | ${l.device} / ${l.browser} | 参照元: ${l.referrer}`
  );
  navigator.clipboard?.writeText(lines.join('\n')).then(() => {
    showToast('📋 アクセスログ一覧をクリップボードにコピーしました', 'success');
  }).catch(() => {
    showToast('コピーに失敗しました', 'error');
  });
}

function clearVisitorLogsArchive() {
  if (!confirm('保存されているアクセスログ履歴をすべてクリアしますか？')) return;
  localStorage.setItem(VISITOR_LOGS_CLEARED_AT_KEY, String(Date.now()));
  localStorage.removeItem(VISITOR_LOGS_ARCHIVE_KEY);
  currentVisitorLogs = [];
  renderVisitorLogs();
  showToast('🗑️ アクセスログ履歴をクリアしました', 'info');
}

let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast ${type} show`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
