// Admin Dashboard JavaScript for issei-desu/ichiHP
const GITHUB_OWNER = 'issei-desu';
const GITHUB_REPO = 'ichiHP';
const DATA_FILE_PATH = 'data.json';

let linksState = [];
let currentFileSha = null;

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  loadData();
  setupEventListeners();
});

// Authentication Handling with LocalStorage
function initAuth() {
  const token = localStorage.getItem('gh_token');
  const tokenInputGroup = document.getElementById('token-input-group');
  const tokenActiveGroup = document.getElementById('token-active-group');
  const badge = document.getElementById('auth-status-badge');

  if (token) {
    tokenInputGroup.style.display = 'none';
    tokenActiveGroup.style.display = 'flex';
    badge.textContent = '連携済み';
    badge.className = 'badge success';
  } else {
    tokenInputGroup.style.display = 'block';
    tokenActiveGroup.style.display = 'none';
    badge.textContent = '未設定';
    badge.className = 'badge';
  }
}

function setupEventListeners() {
  // Token save
  document.getElementById('save-token-btn').addEventListener('click', () => {
    const tokenInput = document.getElementById('github-token');
    const token = tokenInput.value.trim();
    if (!token) {
      showToast('トークンを入力してください', 'error');
      return;
    }
    localStorage.setItem('gh_token', token);
    tokenInput.value = '';
    initAuth();
    showToast('GitHub連携が完了しました！', 'success');
  });

  // Token clear
  document.getElementById('clear-token-btn').addEventListener('click', () => {
    if (confirm('GitHub連携を解除しますか？')) {
      localStorage.removeItem('gh_token');
      initAuth();
      showToast('連携を解除しました', 'success');
    }
  });

  // Add Link
  document.getElementById('add-link-btn').addEventListener('click', () => {
    linksState.push({
      id: Date.now().toString(),
      title: '新しいリンク',
      url: 'https://',
      sub: '',
      icon: 'other'
    });
    renderLinksEditor();
  });

  // Form submit (Save all)
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

// Load current data from data.json
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

  const { profile, twitter, links } = data;

  if (profile) {
    document.getElementById('profile-name').value = profile.name || '';
    document.getElementById('profile-bio').value = profile.bio || '';
    document.getElementById('card-bio').value = profile.cardBio || '';
    if (profile.about) {
      document.getElementById('about-name').value = profile.about.name || '';
      document.getElementById('about-hobby').value = profile.about.hobby || '';
      document.getElementById('about-message').value = profile.about.message || '';
    }
  }

  if (twitter) {
    document.getElementById('twitter-username').value = (twitter.username || '').replace(/^@/, '');
    document.getElementById('show-timeline-checkbox').checked = twitter.showTimeline !== false;
  }

  linksState = Array.isArray(links) ? [...links] : [];
  renderLinksEditor();
}

function renderLinksEditor() {
  const container = document.getElementById('links-list-editor');
  if (!container) return;

  if (linksState.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 10px;">リンクがありません。「＋ リンク追加」から追加できます。</p>';
    return;
  }

  container.innerHTML = linksState.map((link, index) => `
    <div class="link-editor-card" data-index="${index}">
      <div class="link-editor-top">
        <strong style="font-size: 0.88rem;">リンク #${index + 1}</strong>
        <button type="button" class="btn-delete-link" onclick="deleteLink(${index})">削除</button>
      </div>
      <div class="link-editor-grid">
        <div class="form-group">
          <label class="form-label" style="font-size: 0.78rem;">タイトル</label>
          <input type="text" class="form-input" value="${escapeAttr(link.title)}" onchange="updateLink(${index}, 'title', this.value)" placeholder="例: Instagram" required>
        </div>
        <div class="form-group">
          <label class="form-label" style="font-size: 0.78rem;">アイコン種別</label>
          <select class="form-select" onchange="updateLink(${index}, 'icon', this.value)">
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
        <input type="url" class="form-input" value="${escapeAttr(link.url)}" onchange="updateLink(${index}, 'url', this.value)" placeholder="https://..." required>
      </div>
      <div class="form-group">
        <label class="form-label" style="font-size: 0.78rem;">サブテキスト（任意）</label>
        <input type="text" class="form-input" value="${escapeAttr(link.sub || '')}" onchange="updateLink(${index}, 'sub', this.value)" placeholder="例: @ユーザー名 や 日常の写真など">
      </div>
    </div>
  `).join('');
}

window.deleteLink = function(index) {
  linksState.splice(index, 1);
  renderLinksEditor();
};

window.updateLink = function(index, field, value) {
  if (linksState[index]) {
    linksState[index][field] = value;
  }
};

// Build current JSON object from form
function buildDataJson() {
  const username = document.getElementById('twitter-username').value.trim();
  const name = document.getElementById('profile-name').value.trim();

  return {
    profile: {
      name: name,
      handle: username ? `@${username}` : '',
      bio: document.getElementById('profile-bio').value,
      cardBio: document.getElementById('card-bio').value,
      about: {
        name: document.getElementById('about-name').value || name,
        hobby: document.getElementById('about-hobby').value,
        message: document.getElementById('about-message').value
      }
    },
    twitter: {
      username: username,
      showTimeline: document.getElementById('show-timeline-checkbox').checked
    },
    links: linksState
  };
}

// Save to GitHub via API
async function saveToGitHub() {
  const token = localStorage.getItem('gh_token');
  if (!token) {
    showToast('先に「GitHub連携設定」でトークンを登録してください', 'error');
    document.getElementById('auth-section').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const saveBtn = document.getElementById('save-all-btn');
  const btnText = document.getElementById('save-btn-text');
  const spinner = document.getElementById('save-btn-spinner');

  saveBtn.disabled = true;
  btnText.textContent = '保存中...';
  spinner.style.display = 'inline-block';

  try {
    const updatedData = buildDataJson();
    const jsonString = JSON.stringify(updatedData, null, 2);

    // 1. Get current file sha
    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`;
    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let sha = null;
    if (getRes.ok) {
      const fileData = await getRes.json();
      sha = fileData.sha;
    } else if (getRes.status === 401) {
      throw new Error('トークンが無効または期限切れです。再設定してください。');
    }

    // 2. Put file to GitHub
    const putUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`;
    const contentBase64 = utf8ToBase64(jsonString);

    const putPayload = {
      message: 'Update data.json via Admin Dashboard',
      content: contentBase64
    };
    if (sha) {
      putPayload.sha = sha;
    }

    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(putPayload)
    });

    if (!putRes.ok) {
      const errData = await putRes.json().catch(() => ({}));
      throw new Error(errData.message || 'GitHubへの保存に失敗しました');
    }

    showToast('✨ 保存完了！約1分でHPに反映されます', 'success');
  } catch (err) {
    console.error('Save error:', err);
    showToast(`エラー: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
    btnText.textContent = '🚀 保存してHPに反映';
    spinner.style.display = 'none';
  }
}

// UTF-8 to Base64 (browser safe)
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binString);
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
  }, 4000);
}
