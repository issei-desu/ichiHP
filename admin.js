// Admin Dashboard JavaScript for issei-desu/ichiHP
const GITHUB_OWNER = 'issei-desu';
const GITHUB_REPO = 'ichiHP';
const DATA_FILE_PATH = 'data.json';
const AVATAR_IMAGE_PATH = 'images/avatar.png';

let siteState = {};
let profileState = {};
let twitterState = {};
let tabsState = [];
let linksState = [];
let currentAdminTabId = null;

const THEME_PRESETS = [
  { id: 'pink', name: '🌸 ピンク（初期）', primary: '#f43f5e', secondary: '#8b5cf6', bg: '#fff5f7' },
  { id: 'purple', name: '💜 パープル（紫）', primary: '#9333ea', secondary: '#ec4899', bg: '#faf5ff' },
  { id: 'yellow', name: '💛 イエロー（黄）', primary: '#eab308', secondary: '#f97316', bg: '#fefce8' },
  { id: 'green', name: '💚 グリーン（緑）', primary: '#10b981', secondary: '#06b6d4', bg: '#ecfdf5' },
  { id: 'red', name: '❤️ レッド（赤）', primary: '#ef4444', secondary: '#f43f5e', bg: '#fef2f2' },
  { id: 'blue', name: '💙 ブルー（青）', primary: '#3b82f6', secondary: '#6366f1', bg: '#eff6ff' },
  { id: 'white', name: '🤍 ホワイト / モノトーン', primary: '#475569', secondary: '#94a3b8', bg: '#f8fafc' },
  { id: 'dark', name: '🖤 ダーク（黒背景）', primary: '#c084fc', secondary: '#f472b6', bg: '#0f172a' }
];

const FONT_OPTIONS = [
  { value: '', label: 'サイト全体と同じ' },
  { value: 'rounded', label: '丸ゴシック（標準）' },
  { value: 'sans', label: 'すっきりゴシック' },
  { value: 'serif', label: '明朝体（エモ・上品）' },
  { value: 'handwriting', label: '手書き風（ゆるかわ）' },
  { value: 'pop', label: '太めポップ体' },
  { value: 'marupop', label: 'ゆる丸ポップ体' },
  { value: 'pixel', label: 'ドット・レトロ文字' }
];

function renderFontSelectOptions(selectedVal) {
  const current = selectedVal || '';
  return FONT_OPTIONS.map(opt =>
    `<option value="${opt.value}" ${current === opt.value ? 'selected' : ''}>${opt.label}</option>`
  ).join('');
}

let themeState = {
  preset: 'pink',
  primary: '#f43f5e',
  secondary: '#8b5cf6',
  bg: '#fff5f7',
  font: 'rounded',
  textColor: ''
};

let currentAvatarUrl = '';
let newAvatarBase64 = null;

// Track active input/textarea and its text selection for Inline Text Decorator
let lastRichTarget = null;
let lastRichSelection = { start: 0, end: 0 };

document.addEventListener('DOMContentLoaded', () => {
  renderThemePresets();
  setupEventListeners();
  setupInlineDecoratorTracking();
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

function setupInlineDecoratorTracking() {
  const updateSelection = (el) => {
    if (!el || !el.classList || !el.classList.contains('rich-target')) return;
    lastRichTarget = el;
    lastRichSelection = {
      start: typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length,
      end: typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length
    };
    const labelEl = document.getElementById('inline-decorator-target-label');
    if (labelEl) {
      const fieldName = el.getAttribute('data-field-label') || 'テキスト欄';
      const selectedStr = el.value.substring(lastRichSelection.start, lastRichSelection.end);
      if (selectedStr.length > 0) {
        const previewSel = selectedStr.length > 12 ? selectedStr.substring(0, 12) + '…' : selectedStr;
        labelEl.textContent = `選択中: 「${previewSel}」（${fieldName}）`;
      } else {
        labelEl.textContent = `対象: ${fieldName}（文字を選択してボタンを押してください）`;
      }
    }
  };

  ['focusin', 'mouseup', 'keyup', 'touchend', 'select', 'input'].forEach(evtName => {
    document.addEventListener(evtName, (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('rich-target')) {
        updateSelection(e.target);
        if (evtName === 'input') {
          updateLiveRichPreview(e.target);
        }
      }
    });
  });
}

window.applyInlineTag = function(tagType, tagValue) {
  if (!lastRichTarget || !document.body.contains(lastRichTarget)) {
    const fallback = document.getElementById('profile-bio');
    if (fallback) {
      lastRichTarget = fallback;
      lastRichSelection = { start: fallback.value.length, end: fallback.value.length };
    } else {
      showToast('先に色やフォントを変えたい入力欄をタップしてください', 'error');
      return;
    }
  }

  const el = lastRichTarget;
  const val = el.value || '';
  const start = Math.min(lastRichSelection.start, val.length);
  const end = Math.min(lastRichSelection.end, val.length);
  const selected = val.substring(start, end);
  const innerText = selected.length > 0 ? selected : 'ここの文字';

  let openTag = '';
  let closeTag = '';
  if (tagType === 'b') {
    openTag = '[b]';
    closeTag = '[/b]';
  } else {
    openTag = `[${tagType}=${tagValue}]`;
    closeTag = `[/${tagType}]`;
  }

  const replacement = `${openTag}${innerText}${closeTag}`;
  el.value = val.substring(0, start) + replacement + val.substring(end);

  // Trigger input event so state arrays update
  el.dispatchEvent(new Event('input', { bubbles: true }));
  updateLiveRichPreview(el);

  // Restore focus & select inner text
  el.focus();
  const newStart = start + openTag.length;
  const newEnd = newStart + innerText.length;
  try {
    el.setSelectionRange(newStart, newEnd);
    lastRichSelection = { start: newStart, end: newEnd };
  } catch (e) {}

  showToast('✨ 文字の装飾を適用しました！', 'success');
};

window.clearInlineTagsFromTarget = function() {
  if (!lastRichTarget || !document.body.contains(lastRichTarget)) {
    showToast('装飾を解除したい入力欄を先にタップしてください', 'error');
    return;
  }
  const el = lastRichTarget;
  const val = el.value || '';
  const start = Math.min(lastRichSelection.start, val.length);
  const end = Math.min(lastRichSelection.end, val.length);

  if (end > start) {
    const cleanedPart = stripRichTagsAdmin(val.substring(start, end));
    el.value = val.substring(0, start) + cleanedPart + val.substring(end);
  } else {
    el.value = stripRichTagsAdmin(val);
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  updateLiveRichPreview(el);
  showToast('装飾タグを解除しました', 'info');
};

function stripRichTagsAdmin(str) {
  if (!str) return '';
  return String(str)
    .replace(/\[(?:color|bg|font|size)=[^\]]+\]/gi, '')
    .replace(/\[\/(?:color|bg|font|size|b)\]/gi, '')
    .replace(/\[b\]/gi, '');
}

function formatRichTextAdmin(str) {
  if (!str) return '';
  let html = escapeHtml(str);
  for (let i = 0; i < 8; i++) {
    const prev = html;
    html = html
      .replace(/\[color=(#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/color\]/gi, '<span style="color: $1;">$2</span>')
      .replace(/\[bg=(#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/bg\]/gi, '<span style="background-color: $1; padding: 1px 5px; border-radius: 4px;">$2</span>')
      .replace(/\[font=(rounded|sans|serif|handwriting|pop|marupop|pixel)\]([\s\S]*?)\[\/font\]/gi, '<span class="font-$1">$2</span>')
      .replace(/\[size=(sm|lg|xl)\]([\s\S]*?)\[\/size\]/gi, '<span class="text-size-$1">$2</span>')
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>');
    if (html === prev) break;
  }
  return html.replace(/\n/g, '<br>');
}

function hasRichTags(str) {
  return /\[(?:color|bg|font|size)=[^\]]+\]|\[b\]/i.test(String(str || ''));
}

function updateLiveRichPreview(inputEl) {
  if (!inputEl) return;
  let previewEl = null;
  if (inputEl.id === 'profile-bio') {
    previewEl = document.getElementById('profile-bio-rich-preview');
  } else if (inputEl.dataset && inputEl.dataset.previewId) {
    previewEl = document.getElementById(inputEl.dataset.previewId);
  }
  if (!previewEl) return;

  const val = inputEl.value || '';
  if (hasRichTags(val)) {
    previewEl.classList.add('has-content');
    previewEl.innerHTML = `<div class="rich-live-preview-badge">👀 装飾プレビュー</div><div>${formatRichTextAdmin(val)}</div>`;
  } else {
    previewEl.classList.remove('has-content');
    previewEl.innerHTML = '';
  }
}

window.clearColorPair = function(pickerId, hexId, callback) {
  const hexInput = document.getElementById(hexId);
  if (hexInput) {
    hexInput.value = '';
    hexInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (typeof callback === 'function') callback('');
};

function bindColorPair(pickerId, hexId, onChange) {
  const picker = document.getElementById(pickerId);
  const hexInput = document.getElementById(hexId);
  if (!picker || !hexInput) return;

  picker.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    hexInput.value = val;
    if (onChange) onChange(val);
  });

  hexInput.addEventListener('input', (e) => {
    const val = e.target.value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(val)) {
      picker.value = val;
      if (onChange) onChange(val);
    } else if (val === '') {
      if (onChange) onChange('');
    }
  });
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

  // Profile Box Color Pickers
  bindColorPair('profile-name-color-picker', 'profile-name-color-hex');
  bindColorPair('profile-bio-color-picker', 'profile-bio-color-hex');
  bindColorPair('links-title-color-picker', 'links-title-color-hex');

  // Add Tab Button
  document.getElementById('add-tab-btn').addEventListener('click', () => {
    const newTabId = 'tab_' + Date.now();
    tabsState.push({
      id: newTabId,
      name: '新しいタブ',
      aboutTitle: 'About Me',
      aboutSubtitle: '',
      font: '',
      titleColor: '',
      textColor: '',
      items: [
        { label: '項目名', value: '内容を入力してください', font: '', labelColor: '', valueColor: '' }
      ]
    });
    currentAdminTabId = newTabId;
    renderAdminTabs();
    showToast('新しいタブを追加しました', 'success');
  });

  // Add Link Button (Unified Links)
  document.getElementById('add-link-btn').addEventListener('click', () => {
    linksState.push({
      id: Date.now().toString(),
      title: '新しいリンク',
      url: 'https://',
      sub: '',
      icon: 'other',
      font: '',
      titleColor: '',
      subColor: ''
    });
    renderAdminLinks();
    showToast('新しいリンクを追加しました', 'success');
  });

  // Color Picker & Hex Input Sync (Site Theme)
  const colorFields = [
    { key: 'primary', pickerId: 'theme-primary-input', hexId: 'theme-primary-hex' },
    { key: 'secondary', pickerId: 'theme-secondary-input', hexId: 'theme-secondary-hex' },
    { key: 'bg', pickerId: 'theme-bg-input', hexId: 'theme-bg-hex' }
  ];

  colorFields.forEach(({ key, pickerId, hexId }) => {
    const picker = document.getElementById(pickerId);
    const hexInput = document.getElementById(hexId);
    if (picker && hexInput) {
      picker.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        hexInput.value = val;
        themeState[key] = val;
        themeState.preset = 'custom';
        renderThemePresets();
      });

      hexInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/i.test(val)) {
          picker.value = val;
          themeState[key] = val;
          themeState.preset = 'custom';
          renderThemePresets();
        }
      });
    }
  });

  // Site-wide Font & Text Color
  const themeFontSelect = document.getElementById('theme-font-select');
  if (themeFontSelect) {
    themeFontSelect.addEventListener('change', (e) => {
      themeState.font = e.target.value || 'rounded';
    });
  }

  bindColorPair('theme-text-color-input', 'theme-text-color-hex', (val) => {
    themeState.textColor = val;
  });

  const resetTextColorBtn = document.getElementById('theme-text-color-reset');
  if (resetTextColorBtn) {
    resetTextColorBtn.addEventListener('click', () => {
      themeState.textColor = '';
      const hexEl = document.getElementById('theme-text-color-hex');
      if (hexEl) hexEl.value = '';
      showToast('全体の文字色を「背景に合わせて自動」に戻しました', 'info');
    });
  }

  // Form submit
  document.getElementById('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveToGitHub();
  });

  // Preview Modal
  const previewModal = document.getElementById('preview-modal');
  document.getElementById('preview-btn').addEventListener('click', () => {
    const previewAvatar = newAvatarBase64 || document.getElementById('avatar-url-input').value.trim() || currentAvatarUrl;
    const previewData = buildDataJson(previewAvatar);
    try {
      localStorage.setItem('hp_preview_data', JSON.stringify(previewData));
    } catch (e) {
      console.warn('Could not save preview data to localStorage:', e);
    }
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

function renderThemePresets() {
  const grid = document.getElementById('theme-presets-grid');
  if (!grid) return;

  grid.innerHTML = THEME_PRESETS.map(p => {
    const isActive = themeState.preset === p.id || (
      themeState.primary.toLowerCase() === p.primary.toLowerCase() &&
      themeState.secondary.toLowerCase() === p.secondary.toLowerCase() &&
      themeState.bg.toLowerCase() === p.bg.toLowerCase()
    );
    return `
      <button type="button" class="theme-preset-btn ${isActive ? 'active' : ''}" onclick="selectThemePreset('${p.id}')">
        <span class="preset-swatch-dots">
          <span class="preset-dot" style="background: ${p.primary};"></span>
          <span class="preset-dot" style="background: ${p.secondary};"></span>
          <span class="preset-dot" style="background: ${p.bg};"></span>
        </span>
        <span>${escapeHtml(p.name)}</span>
      </button>
    `;
  }).join('');
}

function syncThemeInputs() {
  const fields = [
    { key: 'primary', pickerId: 'theme-primary-input', hexId: 'theme-primary-hex' },
    { key: 'secondary', pickerId: 'theme-secondary-input', hexId: 'theme-secondary-hex' },
    { key: 'bg', pickerId: 'theme-bg-input', hexId: 'theme-bg-hex' }
  ];
  fields.forEach(({ key, pickerId, hexId }) => {
    const picker = document.getElementById(pickerId);
    const hexInput = document.getElementById(hexId);
    if (picker && themeState[key]) picker.value = themeState[key];
    if (hexInput && themeState[key]) hexInput.value = themeState[key];
  });

  const fontSel = document.getElementById('theme-font-select');
  if (fontSel) fontSel.value = themeState.font || 'rounded';

  const textPicker = document.getElementById('theme-text-color-input');
  const textHex = document.getElementById('theme-text-color-hex');
  if (textHex) textHex.value = themeState.textColor || '';
  if (textPicker && /^#[0-9a-f]{6}$/i.test(themeState.textColor)) {
    textPicker.value = themeState.textColor;
  }
}

window.selectThemePreset = function(presetId) {
  const found = THEME_PRESETS.find(p => p.id === presetId);
  if (!found) return;
  themeState = {
    ...themeState,
    preset: found.id,
    primary: found.primary,
    secondary: found.secondary,
    bg: found.bg
  };
  syncThemeInputs();
  renderThemePresets();
  showToast(`テーマ「${found.name}」を選択しました`, 'info');
};

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

// Load data.json (Prefer GitHub API for immediate fresh data, fallback to static file)
async function loadData() {
  try {
    const token = localStorage.getItem('gh_token');
    if (token) {
      const apiRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}?t=${Date.now()}`, {
        headers: {
          'Authorization': getAuthHeader(token),
          'Accept': 'application/vnd.github.v3+json'
        },
        cache: 'no-store'
      });
      if (apiRes.ok) {
        const fileData = await apiRes.json();
        if (fileData && fileData.content) {
          const jsonText = base64ToUtf8(fileData.content.replace(/\s/g, ''));
          const data = JSON.parse(jsonText);
          populateForm(data);
          return;
        }
      }
    }

    const res = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
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

  const { site, theme, profile, twitter, tabs } = data;

  // Theme
  if (theme && typeof theme === 'object') {
    themeState = {
      preset: theme.preset || 'custom',
      primary: /^#[0-9a-f]{6}$/i.test(theme.primary) ? theme.primary : '#f43f5e',
      secondary: /^#[0-9a-f]{6}$/i.test(theme.secondary) ? theme.secondary : '#8b5cf6',
      bg: /^#[0-9a-f]{6}$/i.test(theme.bg) ? theme.bg : '#fff5f7',
      font: theme.font || 'rounded',
      textColor: /^#[0-9a-f]{6}$/i.test(theme.textColor) ? theme.textColor : ''
    };
  } else {
    themeState = {
      preset: 'pink',
      primary: '#f43f5e',
      secondary: '#8b5cf6',
      bg: '#fff5f7',
      font: 'rounded',
      textColor: ''
    };
  }
  syncThemeInputs();
  renderThemePresets();

  // Site Meta
  siteState = site || {};
  document.getElementById('site-title-input').value = siteState.title || '';
  document.getElementById('footer-text-input').value = siteState.footerText || '';

  // Profile
  profileState = profile || {};
  document.getElementById('profile-name').value = profileState.name || '';
  const bioInput = document.getElementById('profile-bio');
  bioInput.value = profileState.bio || '';
  updateLiveRichPreview(bioInput);

  const profFontSel = document.getElementById('profile-font-select');
  if (profFontSel) profFontSel.value = profileState.font || '';

  const profNameColorHex = document.getElementById('profile-name-color-hex');
  const profNameColorPicker = document.getElementById('profile-name-color-picker');
  if (profNameColorHex) profNameColorHex.value = profileState.nameColor || '';
  if (profNameColorPicker && /^#[0-9a-f]{6}$/i.test(profileState.nameColor)) {
    profNameColorPicker.value = profileState.nameColor;
  }

  const profBioColorHex = document.getElementById('profile-bio-color-hex');
  const profBioColorPicker = document.getElementById('profile-bio-color-picker');
  if (profBioColorHex) profBioColorHex.value = profileState.bioColor || '';
  if (profBioColorPicker && /^#[0-9a-f]{6}$/i.test(profileState.bioColor)) {
    profBioColorPicker.value = profileState.bioColor;
  }

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
  tabsState = Array.isArray(tabs) ? tabs.map(t => ({
    id: t.id,
    name: t.name,
    aboutTitle: t.aboutTitle || '',
    aboutSubtitle: t.aboutSubtitle || '',
    font: t.font || '',
    titleColor: t.titleColor || '',
    textColor: t.textColor || '',
    items: Array.isArray(t.items) ? t.items.map(it => ({
      label: it.label || '',
      value: it.value || '',
      font: it.font || '',
      labelColor: it.labelColor || '',
      valueColor: it.valueColor || ''
    })) : []
  })) : [];

  if (tabsState.length === 0) {
    tabsState = [
      {
        id: 'real',
        name: 'リアル・日常 🌿',
        aboutTitle: 'About Me',
        aboutSubtitle: '',
        font: '',
        titleColor: '',
        textColor: '',
        items: [{ label: 'お名前', value: profileState.name || 'いち', font: '', labelColor: '', valueColor: '' }]
      }
    ];
  }

  currentAdminTabId = tabsState[0].id;
  renderAdminTabs();

  // Unified Links (migrate from tabs if data.links not yet set)
  const tabWithTitle = Array.isArray(tabs) ? tabs.find(t => t.linksTitle !== undefined) : null;
  const tabWithSubtitle = Array.isArray(tabs) ? tabs.find(t => t.linksSubtitle !== undefined) : null;
  document.getElementById('links-title-input').value = data.linksTitle !== undefined ? data.linksTitle : (tabWithTitle ? tabWithTitle.linksTitle : 'Links');
  document.getElementById('links-subtitle-input').value = data.linksSubtitle !== undefined ? data.linksSubtitle : (tabWithSubtitle ? tabWithSubtitle.linksSubtitle : '関連リンク');

  const linksFontSel = document.getElementById('links-font-select');
  if (linksFontSel) linksFontSel.value = data.linksFont || '';
  const linksTitleColorHex = document.getElementById('links-title-color-hex');
  const linksTitleColorPicker = document.getElementById('links-title-color-picker');
  if (linksTitleColorHex) linksTitleColorHex.value = data.linksTitleColor || '';
  if (linksTitleColorPicker && /^#[0-9a-f]{6}$/i.test(data.linksTitleColor)) {
    linksTitleColorPicker.value = data.linksTitleColor;
  }

  if (Array.isArray(data.links)) {
    linksState = data.links.map(l => ({
      ...l,
      font: l.font || '',
      titleColor: l.titleColor || '',
      subColor: l.subColor || ''
    }));
  } else if (Array.isArray(tabs)) {
    linksState = [];
    tabs.forEach(t => {
      if (Array.isArray(t.links)) {
        linksState.push(...t.links);
      }
    });
  } else {
    linksState = [];
  }
  renderAdminLinks();
}

function renderAdminTabs() {
  const switcher = document.getElementById('admin-tab-switcher');
  const editor = document.getElementById('active-tab-editor');
  if (!switcher || !editor) return;

  switcher.innerHTML = tabsState.map(tab => `
    <button type="button" 
            class="admin-tab-pill ${tab.id === currentAdminTabId ? 'active' : ''}" 
            onclick="selectAdminTab('${escapeAttr(tab.id)}')">
      ${escapeHtml(stripRichTagsAdmin(tab.name))}
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
      <input type="text" class="form-input rich-target" data-field-label="タブ名" value="${escapeAttr(tab.name)}" oninput="updateTabField(${tabIndex}, 'name', this.value)" placeholder="例: リアル・日常 🌿">
    </div>

    <details class="box-style-details">
      <summary>🎨 このタブ枠全体の文字色・フォント設定</summary>
      <div class="box-style-grid">
        <div class="box-style-field">
          <label>このタブの基本フォント</label>
          <select class="form-select form-select-sm" onchange="updateTabField(${tabIndex}, 'font', this.value)">
            ${renderFontSelectOptions(tab.font)}
          </select>
        </div>
        <div class="box-style-field">
          <label>見出し・項目ラベルの基本色</label>
          <div class="mini-color-row">
            <input type="color" class="mini-color-swatch" value="${/^#[0-9a-f]{6}$/i.test(tab.titleColor) ? tab.titleColor : '#8b5cf6'}" oninput="updateTabColor(${tabIndex}, 'titleColor', this.value, 'tab-title-hex-${tabIndex}')">
            <input type="text" id="tab-title-hex-${tabIndex}" class="form-input mini-color-hex" value="${escapeAttr(tab.titleColor || '')}" placeholder="自動（テーマ色）" oninput="updateTabField(${tabIndex}, 'titleColor', this.value.trim())">
            <button type="button" class="mini-clear-btn" onclick="updateTabColor(${tabIndex}, 'titleColor', '', 'tab-title-hex-${tabIndex}')">自動</button>
          </div>
        </div>
        <div class="box-style-field">
          <label>本文の基本文字色</label>
          <div class="mini-color-row">
            <input type="color" class="mini-color-swatch" value="${/^#[0-9a-f]{6}$/i.test(tab.textColor) ? tab.textColor : '#1e293b'}" oninput="updateTabColor(${tabIndex}, 'textColor', this.value, 'tab-text-hex-${tabIndex}')">
            <input type="text" id="tab-text-hex-${tabIndex}" class="form-input mini-color-hex" value="${escapeAttr(tab.textColor || '')}" placeholder="自動（未指定）" oninput="updateTabField(${tabIndex}, 'textColor', this.value.trim())">
            <button type="button" class="mini-clear-btn" onclick="updateTabColor(${tabIndex}, 'textColor', '', 'tab-text-hex-${tabIndex}')">自動</button>
          </div>
        </div>
      </div>
    </details>

    <!-- About Section in Tab -->
    <div class="tab-sub-section">
      <div class="card-header-row">
        <strong style="font-size: 0.92rem;">📝 自己紹介（プロフィール項目）</strong>
        <button type="button" class="btn btn-subtle-primary btn-sm" onclick="addTabItem(${tabIndex})">＋ 項目追加</button>
      </div>

      <div class="form-group">
        <label class="form-label" style="font-size: 0.78rem;">見出しタイトル（空欄なら非表示）</label>
        <input type="text" class="form-input rich-target" data-field-label="タブ見出しタイトル" value="${escapeAttr(tab.aboutTitle || '')}" oninput="updateTabField(${tabIndex}, 'aboutTitle', this.value)" placeholder="例: About Me（リアル）">
      </div>
      <div class="form-group">
        <label class="form-label" style="font-size: 0.78rem;">サブ見出し（任意）</label>
        <input type="text" class="form-input rich-target" data-field-label="タブサブ見出し" value="${escapeAttr(tab.aboutSubtitle || '')}" oninput="updateTabField(${tabIndex}, 'aboutSubtitle', this.value)" placeholder="例: 日常やリアルの自己紹介">
      </div>

      <div class="items-editor-list" id="tab-items-list">
        ${(tab.items || []).map((item, itemIdx) => {
          const previewId = `item-rich-preview-${tabIndex}-${itemIdx}`;
          const showPreview = hasRichTags(item.value);
          return `
            <div class="item-editor-row">
              <div class="item-editor-header">
                <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);">項目 #${itemIdx + 1}</span>
                <button type="button" class="btn-delete-link" onclick="deleteTabItem(${tabIndex}, ${itemIdx})">削除</button>
              </div>
              <div class="form-group">
                <input type="text" class="form-input rich-target" data-field-label="項目 #${itemIdx + 1} の見出し" value="${escapeAttr(item.label)}" oninput="updateTabItem(${tabIndex}, ${itemIdx}, 'label', this.value)" placeholder="項目名（例: 最推し、趣味など）" style="font-weight: 700;">
              </div>
              <div class="form-group">
                <textarea class="form-textarea rich-target" data-field-label="項目 #${itemIdx + 1} の内容" data-preview-id="${previewId}" rows="3" oninput="updateTabItem(${tabIndex}, ${itemIdx}, 'value', this.value)" placeholder="内容を入力（文字を選択して上のバーから一部分だけ色・フォント変更もできます）">${escapeHtml(item.value)}</textarea>
                <div id="${previewId}" class="rich-live-preview ${showPreview ? 'has-content' : ''}">${showPreview ? `<div class="rich-live-preview-badge">👀 装飾プレビュー</div><div>${formatRichTextAdmin(item.value)}</div>` : ''}</div>
              </div>
              <details class="box-style-details">
                <summary>🎨 この項目枠（#${itemIdx + 1}）の文字色・フォント</summary>
                <div class="box-style-grid">
                  <div class="box-style-field">
                    <label>この項目のフォント</label>
                    <select class="form-select form-select-sm" onchange="updateTabItem(${tabIndex}, ${itemIdx}, 'font', this.value)">
                      ${renderFontSelectOptions(item.font)}
                    </select>
                  </div>
                  <div class="box-style-field">
                    <label>項目名の文字色</label>
                    <div class="mini-color-row">
                      <input type="color" class="mini-color-swatch" value="${/^#[0-9a-f]{6}$/i.test(item.labelColor) ? item.labelColor : '#8b5cf6'}" oninput="updateTabItemColor(${tabIndex}, ${itemIdx}, 'labelColor', this.value, 'item-label-hex-${tabIndex}-${itemIdx}')">
                      <input type="text" id="item-label-hex-${tabIndex}-${itemIdx}" class="form-input mini-color-hex" value="${escapeAttr(item.labelColor || '')}" placeholder="自動（未指定）" oninput="updateTabItem(${tabIndex}, ${itemIdx}, 'labelColor', this.value.trim())">
                      <button type="button" class="mini-clear-btn" onclick="updateTabItemColor(${tabIndex}, ${itemIdx}, 'labelColor', '', 'item-label-hex-${tabIndex}-${itemIdx}')">自動</button>
                    </div>
                  </div>
                  <div class="box-style-field">
                    <label>内容の文字色</label>
                    <div class="mini-color-row">
                      <input type="color" class="mini-color-swatch" value="${/^#[0-9a-f]{6}$/i.test(item.valueColor) ? item.valueColor : '#1e293b'}" oninput="updateTabItemColor(${tabIndex}, ${itemIdx}, 'valueColor', this.value, 'item-val-hex-${tabIndex}-${itemIdx}')">
                      <input type="text" id="item-val-hex-${tabIndex}-${itemIdx}" class="form-input mini-color-hex" value="${escapeAttr(item.valueColor || '')}" placeholder="自動（未指定）" oninput="updateTabItem(${tabIndex}, ${itemIdx}, 'valueColor', this.value.trim())">
                      <button type="button" class="mini-clear-btn" onclick="updateTabItemColor(${tabIndex}, ${itemIdx}, 'valueColor', '', 'item-val-hex-${tabIndex}-${itemIdx}')">自動</button>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderAdminLinks() {
  const container = document.getElementById('links-editor-list');
  if (!container) return;

  if (linksState.length === 0) {
    container.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 12px;">リンクがまだありません。「＋ リンク追加」から追加できます。</p>';
    return;
  }

  container.innerHTML = linksState.map((link, linkIdx) => `
    <div class="link-editor-card">
      <div class="link-editor-top">
        <strong style="font-size: 0.85rem;">リンク #${linkIdx + 1}</strong>
        <button type="button" class="btn-delete-link" onclick="deleteLink(${linkIdx})">削除</button>
      </div>
      <div class="link-editor-grid">
        <div class="form-group">
          <label class="form-label" style="font-size: 0.78rem;">タイトル</label>
          <input type="text" class="form-input rich-target" data-field-label="リンク #${linkIdx + 1} のタイトル" value="${escapeAttr(link.title)}" oninput="updateLink(${linkIdx}, 'title', this.value)" placeholder="例: Twitter" required>
        </div>
        <div class="form-group">
          <label class="form-label" style="font-size: 0.78rem;">アイコン種別</label>
          <select class="form-select" onchange="updateLink(${linkIdx}, 'icon', this.value)">
            <option value="twitter" ${link.icon === 'twitter' || link.icon === 'x' ? 'selected' : ''}>Twitter</option>
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
        <input type="url" class="form-input" value="${escapeAttr(link.url)}" oninput="updateLink(${linkIdx}, 'url', this.value)" placeholder="https://..." required>
      </div>
      <div class="form-group">
        <label class="form-label" style="font-size: 0.78rem;">サブテキスト（任意）</label>
        <input type="text" class="form-input rich-target" data-field-label="リンク #${linkIdx + 1} のサブ文字" value="${escapeAttr(link.sub || '')}" oninput="updateLink(${linkIdx}, 'sub', this.value)" placeholder="例: @ユーザー名 や メイン垢など">
      </div>
      <details class="box-style-details">
        <summary>🎨 このリンク枠（#${linkIdx + 1}）の文字色・フォント</summary>
        <div class="box-style-grid">
          <div class="box-style-field">
            <label>このリンクのフォント</label>
            <select class="form-select form-select-sm" onchange="updateLink(${linkIdx}, 'font', this.value)">
              ${renderFontSelectOptions(link.font)}
            </select>
          </div>
          <div class="box-style-field">
            <label>タイトルの文字色</label>
            <div class="mini-color-row">
              <input type="color" class="mini-color-swatch" value="${/^#[0-9a-f]{6}$/i.test(link.titleColor) ? link.titleColor : '#1e293b'}" oninput="updateLinkColor(${linkIdx}, 'titleColor', this.value, 'link-title-hex-${linkIdx}')">
              <input type="text" id="link-title-hex-${linkIdx}" class="form-input mini-color-hex" value="${escapeAttr(link.titleColor || '')}" placeholder="自動（未指定）" oninput="updateLink(${linkIdx}, 'titleColor', this.value.trim())">
              <button type="button" class="mini-clear-btn" onclick="updateLinkColor(${linkIdx}, 'titleColor', '', 'link-title-hex-${linkIdx}')">自動</button>
            </div>
          </div>
          <div class="box-style-field">
            <label>サブテキストの文字色</label>
            <div class="mini-color-row">
              <input type="color" class="mini-color-swatch" value="${/^#[0-9a-f]{6}$/i.test(link.subColor) ? link.subColor : '#64748b'}" oninput="updateLinkColor(${linkIdx}, 'subColor', this.value, 'link-sub-hex-${linkIdx}')">
              <input type="text" id="link-sub-hex-${linkIdx}" class="form-input mini-color-hex" value="${escapeAttr(link.subColor || '')}" placeholder="自動（未指定）" oninput="updateLink(${linkIdx}, 'subColor', this.value.trim())">
              <button type="button" class="mini-clear-btn" onclick="updateLinkColor(${linkIdx}, 'subColor', '', 'link-sub-hex-${linkIdx}')">自動</button>
            </div>
          </div>
        </div>
      </details>
    </div>
  `).join('');
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
      if (pill) pill.textContent = stripRichTagsAdmin(value);
    }
  }
};

window.updateTabColor = function(tabIndex, field, value, hexInputId) {
  if (tabsState[tabIndex]) {
    tabsState[tabIndex][field] = value;
    const hexEl = document.getElementById(hexInputId);
    if (hexEl) hexEl.value = value;
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
    tabsState[tabIndex].items.push({ label: '新しい項目', value: '', font: '', labelColor: '', valueColor: '' });
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

window.updateTabItemColor = function(tabIndex, itemIdx, field, value, hexInputId) {
  if (tabsState[tabIndex] && tabsState[tabIndex].items && tabsState[tabIndex].items[itemIdx]) {
    tabsState[tabIndex].items[itemIdx][field] = value;
    const hexEl = document.getElementById(hexInputId);
    if (hexEl) hexEl.value = value;
  }
};

window.deleteLink = function(linkIdx) {
  linksState.splice(linkIdx, 1);
  renderAdminLinks();
};

window.updateLink = function(linkIdx, field, value) {
  if (linksState[linkIdx]) {
    linksState[linkIdx][field] = value;
  }
};

window.updateLinkColor = function(linkIdx, field, value, hexInputId) {
  if (linksState[linkIdx]) {
    linksState[linkIdx][field] = value;
    const hexEl = document.getElementById(hexInputId);
    if (hexEl) hexEl.value = value;
  }
};

// Build current JSON object
function buildDataJson(avatarUrl) {
  const username = document.getElementById('twitter-username').value.trim();
  const name = document.getElementById('profile-name').value.trim();

  const primaryHex = document.getElementById('theme-primary-hex').value.trim();
  const secondaryHex = document.getElementById('theme-secondary-hex').value.trim();
  const bgHex = document.getElementById('theme-bg-hex').value.trim();
  const textColorHex = (document.getElementById('theme-text-color-hex')?.value || '').trim();
  const themeFont = document.getElementById('theme-font-select')?.value || 'rounded';

  const profileFont = document.getElementById('profile-font-select')?.value || '';
  const profileNameColor = (document.getElementById('profile-name-color-hex')?.value || '').trim();
  const profileBioColor = (document.getElementById('profile-bio-color-hex')?.value || '').trim();

  const linksFont = document.getElementById('links-font-select')?.value || '';
  const linksTitleColor = (document.getElementById('links-title-color-hex')?.value || '').trim();

  return {
    site: {
      title: document.getElementById('site-title-input').value.trim() || `${stripRichTagsAdmin(name)}のホームページ`,
      footerText: document.getElementById('footer-text-input').value.trim() || `© 2026 ${stripRichTagsAdmin(name)}. All rights reserved.`
    },
    theme: {
      preset: themeState.preset || 'pink',
      primary: /^#[0-9a-f]{6}$/i.test(primaryHex) ? primaryHex : themeState.primary,
      secondary: /^#[0-9a-f]{6}$/i.test(secondaryHex) ? secondaryHex : themeState.secondary,
      bg: /^#[0-9a-f]{6}$/i.test(bgHex) ? bgHex : themeState.bg,
      font: themeFont,
      textColor: /^#[0-9a-f]{6}$/i.test(textColorHex) ? textColorHex : ''
    },
    profile: {
      name: name,
      avatar: avatarUrl,
      bio: document.getElementById('profile-bio').value,
      font: profileFont,
      nameColor: /^#[0-9a-f]{6}$/i.test(profileNameColor) ? profileNameColor : '',
      bioColor: /^#[0-9a-f]{6}$/i.test(profileBioColor) ? profileBioColor : ''
    },
    twitter: {
      username: username
    },
    tabs: tabsState,
    linksTitle: document.getElementById('links-title-input').value.trim() || 'Links',
    linksSubtitle: document.getElementById('links-subtitle-input').value.trim(),
    linksFont: linksFont,
    linksTitleColor: /^#[0-9a-f]{6}$/i.test(linksTitleColor) ? linksTitleColor : '',
    links: linksState
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

    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}?t=${Date.now()}`;
    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': getAuthHeader(token),
        'Accept': 'application/vnd.github.v3+json'
      },
      cache: 'no-store'
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

    try {
      localStorage.setItem('hp_latest_data', JSON.stringify({
        savedAt: Date.now(),
        data: updatedData
      }));
    } catch (e) {
      console.warn('Could not cache latest data:', e);
    }

    showToast('✨ 保存完了！HPに反映されました', 'success');
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

function base64ToUtf8(base64) {
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
  return new TextDecoder().decode(bytes);
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
