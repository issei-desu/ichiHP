// Admin Dashboard JavaScript for issei-desu/ichiHP
const GITHUB_OWNER = 'issei-desu';
const GITHUB_REPO = 'ichiHP';
const DATA_FILE_PATH = 'data.json';
const AVATAR_IMAGE_PATH = 'images/avatar.png';

let siteState = {};
let profileState = {};
let twitterState = {};
let tabsState = [];
let currentAdminTabId = null;

let currentAvatarUrl = '';
let newAvatarBase64 = null;

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkAuthAndInitialize();
});

function getAuthHeader(token) {
  return `Bearer ${token.trim()}`;
}

// Check authentication state on page load
async function checkAuthAndInitialize() {
  const token = localStorage.getItem('gh_token');
  if (token) {
    const verification = await verifyToken(token);
    if (verification.valid) {
      unlockAdminScreen();
      return;
    } else {
      localStorage.removeItem('gh_token');
    }
  }
  lockAdminScreen();
}

function unlockAdminScreen() {
  document.getElementById('auth-lock-screen').style.display = 'none';
  document.getElementById('admin-content').style.display = 'flex';
  document.getElementById('header-logout-btn').style.display = 'inline-block';
  loadData();
}

function lockAdminScreen() {
  document.getElementById('auth-lock-screen').style.display = 'flex';
  document.getElementById('admin-content').style.display = 'none';
  document.getElementById('header-logout-btn').style.display = 'none';
}

function setupEventListeners() {
  // Lock Form Submit (Unlock)
  const lockForm = document.getElementById('lock-form');
  lockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tokenInput = document.getElementById('lock-token-input');
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
    unlockAdminScreen();
    showToast('✨ 認証に成功しました！', 'success');
  });

  // Logout (Lock) Button
  document.getElementById('header-logout-btn').addEventListener('click', () => {
    if (confirm('ログアウトして画面をロックしますか？')) {
      localStorage.removeItem('gh_token');
      lockAdminScreen();
      showToast('ログアウトしました', 'info');
    }
  });

  // Avatar File Upload
  const fileInput = document.getElementById('avatar-file-input');
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showToast('画像を最適化中...', 'info');
      newAvatarBase64 = await processAndResizeImage(file, 600);
      setAvatarPreview(newAvatarBase64);
      document.getElementById('avatar-url-input').value = '';
      showToast('画像を選択しました。「保存」を押すと反映されます', 'success');
    } catch (err) {
      console.error(err);
      showToast('画像の読み込みに失敗しました', 'error');
    }
  });

  // Avatar URL manual input
  const urlInput = document.getElementById('avatar-url-input');
  urlInput.addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url) {
      newAvatarBase64 = null;
      currentAvatarUrl = url;
      setAvatarPreview(url);
    } else {
      if (!newAvatarBase64) {
        currentAvatarUrl = '';
        setAvatarPreview('');
      }
    }
  });

  // Remove Avatar
  document.getElementById('remove-avatar-btn').addEventListener('click', () => {
    newAvatarBase64 = null;
    currentAvatarUrl = '';
    document.getElementById('avatar-url-input').value = '';
    fileInput.value = '';
    setAvatarPreview('');
    showToast('アイコンを初期絵文字に戻しました', 'info');
  });

  // Add Tab Button
  document.getElementById('add-tab-btn').addEventListener('click', () => {
    const newTabId = 'tab_' + Date.now();
    tabsState.push({
      id: newTabId,
      name: '新しいタブ',
      aboutTitle: 'About Me',
      aboutSubtitle: '',
      items: [
        { label: '項目名', value: '内容を入力してください' }
      ],
      linksTitle: 'Links',
      linksSubtitle: '',
      links: []
    });
    currentAdminTabId = newTabId;
    renderAdminTabs();
    showToast('新しいタブを追加しました', 'success');
  });

  // Form submit
  document.getElementById('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveToGitHub();
  });

  // Preview Modal
  const previewModal = document.getElementById('preview-modal');
  document.getElementById('preview-btn').addEventListener('click', () => {
    previewModal.classList.add('show');
    const iframe = document.getElementById('preview-iframe');
    iframe.src = 'index.html?preview=' + Date.now();
  });

  document.getElementById('close-modal-btn').addEventListener('click', () => {
    previewModal.classList.remove('show');
  });

  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
      previewModal.classList.remove('show');
    }
  });
}

function setAvatarPreview(src) {
  const img = document.getElementById('admin-avatar-preview');
  const fallback = document.getElementById('admin-avatar-fallback');
  if (src) {
    img.src = src;
    img.style.display = 'block';
    fallback.style.display = 'none';
  } else {
    img.src = '';
    img.style.display = 'none';
    fallback.style.display = 'flex';
  }
}

// Process and resize image
function processAndResizeImage(file, maxSize = 600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/png', 0.9);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Verify Token against repository
async function verifyToken(token) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, {
      headers: {
        'Authorization': getAuthHeader(token),
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (res.status === 401) return { valid: false, message: '認証コードが無効または期限切れです。' };
    if (res.status === 404) return { valid: false, message: 'リポジトリが見つからないか、repo権限がありません。' };
    if (!res.ok) return { valid: false, message: `GitHub確認エラー (${res.status})` };

    const data = await res.json();
    if (data.permissions && !data.permissions.push) {
      return { valid: false, message: 'リポジトリへの書き込み（push）権限がありません。' };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, message: `通信エラー: ${err.message}` };
  }
}

// Load data.json
async function loadData() {
  try {
    const res = await fetch(`data.json?t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to load data.json');
    const data = await res.json();
    populateForm(data);
  } catch (err) {
    console.error('Error loading data:', err);
    showToast('既存データの読み込みに失敗しました', 'error');
  }
}

function populateForm(data) {
  if (!data) return;

  const { site, profile, twitter, tabs } = data;

  // Site Meta
  siteState = site || {};
  document.getElementById('site-title-input').value = siteState.title || '';
  document.getElementById('logo-badge-input').value = siteState.logoBadge || '';
  document.getElementById('logo-text-input').value = siteState.logoText || '';
  document.getElementById('footer-text-input').value = siteState.footerText || '';

  // Profile
  profileState = profile || {};
  document.getElementById('profile-name').value = profileState.name || '';
  document.getElementById('profile-bio').value = profileState.bio || '';

  currentAvatarUrl = profileState.avatar || '';
  if (currentAvatarUrl) {
    setAvatarPreview(currentAvatarUrl);
    if (!currentAvatarUrl.startsWith('images/')) {
      document.getElementById('avatar-url-input').value = currentAvatarUrl;
    }
  } else {
    setAvatarPreview('');
  }

  // Twitter username
  twitterState = twitter || {};
  document.getElementById('twitter-username').value = (twitterState.username || '').replace(/^@/, '');

  // Tabs
  tabsState = Array.isArray(tabs) ? [...tabs] : [];
  if (tabsState.length === 0) {
    tabsState = [
      {
        id: 'real',
        name: 'リアル・日常 🌿',
        aboutTitle: 'About Me',
        aboutSubtitle: '',
        items: [{ label: 'お名前', value: profileState.name || 'いち' }],
        linksTitle: 'Links',
        linksSubtitle: '',
        links: []
      }
    ];
  }

  currentAdminTabId = tabsState[0].id;
  renderAdminTabs();
}

function renderAdminTabs() {
  const switcher = document.getElementById('admin-tab-switcher');
  const editor = document.getElementById('active-tab-editor');
  if (!switcher || !editor) return;

  switcher.innerHTML = tabsState.map(tab => `
    <button type="button" 
            class="admin-tab-pill ${tab.id === currentAdminTabId ? 'active' : ''}" 
            onclick="selectAdminTab('${tab.id}')">
      ${escapeHtml(tab.name)}
    </button>
  `).join('');

  const tab = tabsState.find(t => t.id === currentAdminTabId) || tabsState[0];
  if (!tab) {
    editor.innerHTML = '<p>タブがありません</p>';
    return;
  }

  const tabIndex = tabsState.findIndex(t => t.id === tab.id);

  editor.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
      <strong style="color: var(--primary); font-size: 0.95rem;">タブの基本設定</strong>
      ${tabsState.length > 1 ? `<button type="button" class="btn-delete-link" onclick="deleteTab(${tabIndex})">このタブを削除</button>` : ''}
    </div>

    <div class="form-group">
      <label class="form-label">タブの表示名（絵文字もOK）</label>
      <input type="text" class="form-input" value="${escapeAttr(tab.name)}" oninput="updateTabField(${tabIndex}, 'name', this.value)" placeholder="例: リアル・日常 🌿">
    </div>

    <!-- About Section in Tab -->
    <div class="tab-sub-section">
      <div class="card-header-row">
        <strong style="font-size: 0.92rem;">📝 自己紹介（プロフィール項目）</strong>
        <button type="button" class="btn btn-subtle-primary btn-sm" onclick="addTabItem(${tabIndex})">＋ 項目追加</button>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-size: 0.78rem;">見出しタイトル</label>
        <input type="text" class="form-input" value="${escapeAttr(tab.aboutTitle || '')}" oninput="updateTabField(${tabIndex}, 'aboutTitle', this.value)" placeholder="例: About Me（リアル）">
      </div>
      <div class="form-group">
        <label class="form-label" style="font-size: 0.78rem;">サブ見出し（任意）</label>
        <input type="text" class="form-input" value="${escapeAttr(tab.aboutSubtitle || '')}" oninput="updateTabField(${tabIndex}, 'aboutSubtitle', this.value)" placeholder="例: 日常やリアルの自己紹介">
      </div>

      <div class="items-editor-list" id="tab-items-list">
        ${(tab.items || []).map((item, itemIdx) => `
          <div class="item-editor-row">
            <div class="item-editor-header">
              <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);">項目 #${itemIdx + 1}</span>
              <button type="button" class="btn-delete-link" onclick="deleteTabItem(${tabIndex}, ${itemIdx})">削除</button>
            </div>
            <div class="form-group">
              <input type="text" class="form-input" value="${escapeAttr(item.label)}" oninput="updateTabItem(${tabIndex}, ${itemIdx}, 'label', this.value)" placeholder="項目名（例: 最推し、趣味など）" style="font-weight: 700;">
            </div>
            <div class="form-group">
              <textarea class="form-textarea" rows="2" oninput="updateTabItem(${tabIndex}, ${itemIdx}, 'value', this.value)" placeholder="内容を入力">${escapeHtml(item.value)}</textarea>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Links Section in Tab -->
    <div class="tab-sub-section">
      <div class="card-header-row">
        <strong style="font-size: 0.92rem;">🔗 リンク一覧</strong>
        <button type="button" class="btn btn-subtle-primary btn-sm" onclick="addTabLink(${tabIndex})">＋ リンク追加</button>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-size: 0.78rem;">見出しタイトル</label>
        <input type="text" class="form-input" value="${escapeAttr(tab.linksTitle || '')}" oninput="updateTabField(${tabIndex}, 'linksTitle', this.value)" placeholder="例: Links（リアル）">
      </div>
      <div class="form-group">
        <label class="form-label" style="font-size: 0.78rem;">サブ見出し（任意）</label>
        <input type="text" class="form-input" value="${escapeAttr(tab.linksSubtitle || '')}" oninput="updateTabField(${tabIndex}, 'linksSubtitle', this.value)" placeholder="例: 関連リンク">
      </div>

      <div class="links-editor-list">
        ${(tab.links || []).map((link, linkIdx) => `
          <div class="link-editor-card">
            <div class="link-editor-top">
              <strong style="font-size: 0.85rem;">リンク #${linkIdx + 1}</strong>
              <button type="button" class="btn-delete-link" onclick="deleteTabLink(${tabIndex}, ${linkIdx})">削除</button>
            </div>
            <div class="link-editor-grid">
              <div class="form-group">
                <label class="form-label" style="font-size: 0.78rem;">タイトル</label>
                <input type="text" class="form-input" value="${escapeAttr(link.title)}" oninput="updateTabLink(${tabIndex}, ${linkIdx}, 'title', this.value)" placeholder="例: X (Twitter)" required>
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size: 0.78rem;">アイコン種別</label>
                <select class="form-select" onchange="updateTabLink(${tabIndex}, ${linkIdx}, 'icon', this.value)">
                  <option value="twitter" ${link.icon === 'twitter' || link.icon === 'x' ? 'selected' : ''}>X (Twitter)</option>
                  <option value="instagram" ${link.icon === 'instagram' ? 'selected' : ''}>Instagram</option>
                  <option value="youtube" ${link.icon === 'youtube' ? 'selected' : ''}>YouTube</option>
                  <option value="tiktok" ${link.icon === 'tiktok' ? 'selected' : ''}>TikTok</option>
                  <option value="github" ${link.icon === 'github' ? 'selected' : ''}>GitHub</option>
                  <option value="other" ${link.icon === 'other' || !link.icon ? 'selected' : ''}>その他 / Web</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.78rem;">URL</label>
              <input type="url" class="form-input" value="${escapeAttr(link.url)}" oninput="updateTabLink(${tabIndex}, ${linkIdx}, 'url', this.value)" placeholder="https://..." required>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size: 0.78rem;">サブテキスト（任意）</label>
              <input type="text" class="form-input" value="${escapeAttr(link.sub || '')}" oninput="updateTabLink(${tabIndex}, ${linkIdx}, 'sub', this.value)" placeholder="例: @ユーザー名 や メイン垢など">
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

window.selectAdminTab = function(tabId) {
  currentAdminTabId = tabId;
  renderAdminTabs();
};

window.updateTabField = function(tabIndex, field, value) {
  if (tabsState[tabIndex]) {
    tabsState[tabIndex][field] = value;
    if (field === 'name') {
      const switcher = document.getElementById('admin-tab-switcher');
      const pill = switcher.querySelectorAll('.admin-tab-pill')[tabIndex];
      if (pill) pill.textContent = value;
    }
  }
};

window.deleteTab = function(tabIndex) {
  if (confirm(`タブ「${tabsState[tabIndex].name}」を削除しますか？`)) {
    tabsState.splice(tabIndex, 1);
    if (tabsState.length > 0) {
      currentAdminTabId = tabsState[0].id;
    }
    renderAdminTabs();
    showToast('タブを削除しました', 'info');
  }
};

window.addTabItem = function(tabIndex) {
  if (tabsState[tabIndex]) {
    if (!tabsState[tabIndex].items) tabsState[tabIndex].items = [];
    tabsState[tabIndex].items.push({ label: '新しい項目', value: '' });
    renderAdminTabs();
  }
};

window.deleteTabItem = function(tabIndex, itemIdx) {
  if (tabsState[tabIndex] && tabsState[tabIndex].items) {
    tabsState[tabIndex].items.splice(itemIdx, 1);
    renderAdminTabs();
  }
};

window.updateTabItem = function(tabIndex, itemIdx, field, value) {
  if (tabsState[tabIndex] && tabsState[tabIndex].items && tabsState[tabIndex].items[itemIdx]) {
    tabsState[tabIndex].items[itemIdx][field] = value;
  }
};

window.addTabLink = function(tabIndex) {
  if (tabsState[tabIndex]) {
    if (!tabsState[tabIndex].links) tabsState[tabIndex].links = [];
    tabsState[tabIndex].links.push({
      id: Date.now().toString(),
      title: '新しいリンク',
      url: 'https://',
      sub: '',
      icon: 'other'
    });
    renderAdminTabs();
  }
};

window.deleteTabLink = function(tabIndex, linkIdx) {
  if (tabsState[tabIndex] && tabsState[tabIndex].links) {
    tabsState[tabIndex].links.splice(linkIdx, 1);
    renderAdminTabs();
  }
};

window.updateTabLink = function(tabIndex, linkIdx, field, value) {
  if (tabsState[tabIndex] && tabsState[tabIndex].links && tabsState[tabIndex].links[linkIdx]) {
    tabsState[tabIndex].links[linkIdx][field] = value;
  }
};

// Build current JSON object
function buildDataJson(avatarUrl) {
  const username = document.getElementById('twitter-username').value.trim();
  const name = document.getElementById('profile-name').value.trim();

  return {
    site: {
      title: document.getElementById('site-title-input').value.trim() || `${name}のホームページ`,
      logoBadge: document.getElementById('logo-badge-input').value.trim() || 'HP',
      logoText: document.getElementById('logo-text-input').value.trim() || username || name,
      footerText: document.getElementById('footer-text-input').value.trim() || `© 2026 ${name}. All rights reserved.`
    },
    profile: {
      name: name,
      handle: username ? `@${username}` : '',
      avatar: avatarUrl,
      bio: document.getElementById('profile-bio').value
    },
    twitter: {
      username: username
    },
    tabs: tabsState
  };
}

// Upload image file
async function uploadAvatarImageToGitHub(token, dataUrl) {
  const base64Content = dataUrl.split(',')[1];
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${AVATAR_IMAGE_PATH}`;

  let sha = null;
  const getRes = await fetch(url, {
    headers: {
      'Authorization': getAuthHeader(token),
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (getRes.ok) {
    const data = await getRes.json();
    sha = data.sha;
  }

  const putPayload = {
    message: 'Upload avatar image via Admin Dashboard',
    content: base64Content
  };
  if (sha) putPayload.sha = sha;

  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': getAuthHeader(token),
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(putPayload)
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(`画像アップロード失敗: ${err.message || putRes.status}`);
  }

  return `${AVATAR_IMAGE_PATH}?v=${Date.now()}`;
}

// Save all to GitHub
async function saveToGitHub() {
  const token = localStorage.getItem('gh_token');
  if (!token) {
    showToast('認証コードが見つかりません。再ログインしてください', 'error');
    lockAdminScreen();
    return;
  }

  const saveBtn = document.getElementById('save-all-btn');
  const btnText = document.getElementById('save-btn-text');
  const spinner = document.getElementById('save-btn-spinner');

  saveBtn.disabled = true;
  btnText.textContent = '保存中...';
  spinner.style.display = 'inline-block';

  try {
    let finalAvatarUrl = currentAvatarUrl;

    if (newAvatarBase64) {
      btnText.textContent = '画像を保存中...';
      finalAvatarUrl = await uploadAvatarImageToGitHub(token, newAvatarBase64);
      newAvatarBase64 = null;
      currentAvatarUrl = finalAvatarUrl;
    } else {
      const manualUrl = document.getElementById('avatar-url-input').value.trim();
      if (manualUrl) finalAvatarUrl = manualUrl;
    }

    btnText.textContent = 'データを保存中...';
    const updatedData = buildDataJson(finalAvatarUrl);
    const jsonString = JSON.stringify(updatedData, null, 2);

    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`;
    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': getAuthHeader(token),
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let sha = null;
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    } else if (getRes.status === 401) {
      throw new Error('認証コードが無効または期限切れです。再ログインしてください。');
    }

    const putUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`;
    const contentBase64 = utf8ToBase64(jsonString);

    const putPayload = {
      message: 'Update data.json via Admin Dashboard',
      content: contentBase64
    };
    if (sha) putPayload.sha = sha;

    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': getAuthHeader(token),
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putPayload)
    });

    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => ({}));
      throw new Error(errData.message || `GitHub保存失敗 (${putRes.status})`);
    }

    showToast('✨ 保存完了！約1分でHPに反映されます', 'success');
  } catch (err) {
    console.error('Save error:', err);
    showToast(`エラー: ${err.message}`, 'error');
    alert(`【保存エラー】\n${err.message}`);
  } finally {
    saveBtn.disabled = false;
    btnText.textContent = '🚀 保存してHPに反映';
    spinner.style.display = 'none';
  }
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binString);
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
  return String(str).replace(/"/g, '&quot;');
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.className = 'toast';
  }, 4500);
}
