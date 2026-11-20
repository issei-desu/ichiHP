/* ===================================================
   blog/up - Note-style Blog Post Editor Logic
   Designed for ichiHP / Clean, Distraction-Free UI
   =================================================== */

const GITHUB_OWNER = 'issei-desu';
const GITHUB_REPO = 'ichiHP';
const DATA_FILE_PATH = 'data.json';

// Global state
let currentPostId = null;
let allPosts = [];
let pendingUploads = {}; // path -> dataUrl
let currentViewMode = 'edit';
let isDirty = false;

// DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  setupEventListeners();
  setupViewMode();
  setupDateDefault();
  await checkAuthStatus();
  await loadBlogData();

  // Check URL params for editing a specific post (e.g. ?id=post-123)
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('id');
  if (targetId) {
    loadPostIntoEditor(targetId);
  }
}

/* ==========================================
   Auth Handling
   ========================================== */
function getAuthHeader(token) {
  return `Bearer ${token.trim()}`;
}

async function verifyToken(token) {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`, {
      headers: {
        'Authorization': getAuthHeader(token),
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (res.status === 401) return { valid: false, message: '認証トークンが無効または期限切れです。' };
    if (res.status === 404) return { valid: false, message: 'リポジトリが見つからないか権限がありません。' };
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

async function checkAuthStatus() {
  const badge = document.getElementById('auth-status-badge');
  const text = document.getElementById('auth-status-text');
  const token = localStorage.getItem('gh_token');

  if (!token) {
    if (badge) {
      badge.className = 'auth-badge unauthed';
      if (text) text.textContent = '認証が必要です';
    }
    return false;
  }

  const result = await verifyToken(token);
  if (result.valid) {
    if (badge) {
      badge.className = 'auth-badge';
      if (text) text.textContent = '認証済み';
    }
    return true;
  } else {
    if (badge) {
      badge.className = 'auth-badge unauthed';
      if (text) text.textContent = 'トークン無効';
    }
    return false;
  }
}

function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  const input = document.getElementById('auth-token-input');
  if (input) input.value = localStorage.getItem('gh_token') || '';
  if (modal) modal.classList.add('show');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.remove('show');
}

async function verifyAndSaveToken() {
  const input = document.getElementById('auth-token-input');
  const token = (input?.value || '').trim();
  const btn = document.getElementById('btn-auth-submit');

  if (!token) {
    alert('認証トークンを入力してください。');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = '確認中...';
  }

  try {
    const res = await verifyToken(token);
    if (!res.valid) {
      alert(`【認証失敗】\n${res.message}`);
      return;
    }

    localStorage.setItem('gh_token', token);
    showToast('GitHub認証に成功しました！', 'success');
    closeAuthModal();
    await checkAuthStatus();
    await loadBlogData();
  } catch (err) {
    alert(`エラーが発生しました: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '認証して保存';
    }
  }
}

/* ==========================================
   Data Loading
   ========================================== */
async function loadBlogData() {
  const token = localStorage.getItem('gh_token');
  let rawData = null;

  try {
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
          rawData = JSON.parse(jsonText);
        }
      }
    }

    if (!rawData) {
      const res = await fetch(`../../data.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) rawData = await res.json();
    }
  } catch (err) {
    console.error('Failed to fetch blog data:', err);
  }

  if (rawData && rawData.blog) {
    allPosts = Array.isArray(rawData.blog.posts) ? rawData.blog.posts : [];
  } else {
    allPosts = [];
  }

  updateNavCount();
  renderDrawerPosts();
}

function updateNavCount() {
  const countEl = document.getElementById('nav-posts-count');
  if (countEl) countEl.textContent = allPosts.length;
}

/* ==========================================
   Editor Setup & Event Handlers
   ========================================== */
function setupEventListeners() {
  // Post Title & Content live input
  const titleInput = document.getElementById('post-title');
  const contentInput = document.getElementById('post-content');
  const tagsInput = document.getElementById('post-tags');
  const dateInput = document.getElementById('post-date');

  if (titleInput) {
    titleInput.addEventListener('input', () => {
      isDirty = true;
      renderLivePreview();
    });
  }

  if (contentInput) {
    contentInput.addEventListener('input', () => {
      isDirty = true;
      updateStats();
      renderLivePreview();
    });
  }

  if (tagsInput) {
    tagsInput.addEventListener('input', () => {
      isDirty = true;
      renderLivePreview();
    });
  }

  if (dateInput) {
    dateInput.addEventListener('input', () => {
      isDirty = true;
      renderLivePreview();
    });
  }

  // Cover image file picker
  const coverFileInput = document.getElementById('cover-file-input');
  if (coverFileInput) {
    coverFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await processAndResizeImage(file, 1200);
        const rand = Math.random().toString(36).substring(2, 7);
        const path = `images/blog/cover_${Date.now()}_${rand}.jpg`;
        pendingUploads[path] = dataUrl;

        const coverUrlInput = document.getElementById('cover-url-input');
        if (coverUrlInput) coverUrlInput.value = path;

        updateCoverPreview(dataUrl);
        isDirty = true;
        renderLivePreview();
        showToast('カバー画像をセットしました', 'success');
      } catch (err) {
        console.error('Cover process error:', err);
        showToast('画像処理に失敗しました', 'error');
      }
    });
  }

  // Cover URL input manual edit
  const coverUrlInput = document.getElementById('cover-url-input');
  if (coverUrlInput) {
    coverUrlInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      updateCoverPreview(val);
      isDirty = true;
      renderLivePreview();
    });
  }

  // Cover remove button
  const coverRemoveBtn = document.getElementById('btn-remove-cover');
  if (coverRemoveBtn) {
    coverRemoveBtn.addEventListener('click', () => {
      if (coverUrlInput) coverUrlInput.value = '';
      if (coverFileInput) coverFileInput.value = '';
      updateCoverPreview('');
      isDirty = true;
      renderLivePreview();
    });
  }

  // Inline Image file picker in toolbar
  const inlineImgInput = document.getElementById('inline-image-file-input');
  if (inlineImgInput) {
    inlineImgInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await processAndResizeImage(file, 1200);
        const rand = Math.random().toString(36).substring(2, 7);
        const path = `images/blog/img_${Date.now()}_${rand}.jpg`;
        pendingUploads[path] = dataUrl;

        const tag = `\n[img=${path}]\n`;
        insertTag(tag, '');
        isDirty = true;
        renderLivePreview();
        showToast('本文に画像を挿入しました', 'success');
      } catch (err) {
        console.error('Inline image error:', err);
        showToast('画像の挿入に失敗しました', 'error');
      } finally {
        inlineImgInput.value = '';
      }
    });
  }

  // Drawer toggle & new post
  const toggleDrawerBtn = document.getElementById('btn-toggle-drawer');
  if (toggleDrawerBtn) toggleDrawerBtn.addEventListener('click', toggleDrawer);

  const newPostBtn = document.getElementById('btn-new-post');
  if (newPostBtn) newPostBtn.addEventListener('click', resetEditorToNew);

  // Keyboard shortcut: Ctrl+S / Cmd+S to save
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      const published = document.getElementById('post-published')?.value !== 'false';
      submitPost(published);
    }
  });

  // Warn before unload if dirty
  window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function setupDateDefault() {
  const dateInput = document.getElementById('post-date');
  if (dateInput && !dateInput.value) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${y}/${m}/${d}`;
  }
}

/* ==========================================
   View Mode Switching (Edit / Split / Preview)
   ========================================== */
function setupViewMode() {
  setViewMode('edit');
}

function setViewMode(mode) {
  currentViewMode = mode;
  document.body.className = `mode-${mode}`;

  document.querySelectorAll('.view-tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`tab-btn-${mode}`);
  if (activeBtn) activeBtn.classList.add('active');

  if (mode === 'preview' || mode === 'split') {
    renderLivePreview();
  }
}

/* ==========================================
   Cover Image Preview Box
   ========================================== */
function updateCoverPreview(src) {
  const wrapper = document.getElementById('cover-preview-wrapper');
  const img = document.getElementById('cover-preview-img');
  if (!wrapper || !img) return;

  if (src) {
    img.src = resolveAssetUrl(src);
    wrapper.style.display = 'block';
  } else {
    img.src = '';
    wrapper.style.display = 'none';
  }
}

/* ==========================================
   Stats & Live Preview Rendering
   ========================================== */
function updateStats() {
  const content = document.getElementById('post-content')?.value || '';
  const charCount = content.replace(/\s+/g, '').length;
  const readTime = estimateReadTime(content);

  const charEl = document.getElementById('char-count-text');
  const readEl = document.getElementById('read-time-text');
  if (charEl) charEl.textContent = `${charCount.toLocaleString()} 文字`;
  if (readEl) readEl.textContent = `読了目安 約 ${readTime}`;
}

function renderLivePreview() {
  const title = document.getElementById('post-title')?.value || '無題の記事';
  const content = document.getElementById('post-content')?.value || '';
  const tagsStr = document.getElementById('post-tags')?.value || '';
  const dateStr = document.getElementById('post-date')?.value || '';
  const coverUrl = document.getElementById('cover-url-input')?.value.trim() || '';

  // Title
  const prevTitle = document.getElementById('prev-title');
  if (prevTitle) prevTitle.textContent = title;

  // Tags
  const prevTagsRow = document.getElementById('prev-tags-row');
  if (prevTagsRow) {
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
    prevTagsRow.innerHTML = tags.map(t => `<span class="detail-tag-pill">#${escapeHtml(t)}</span>`).join('');
  }

  // Meta
  const prevMeta = document.getElementById('prev-publish-meta');
  if (prevMeta) {
    const readTime = estimateReadTime(content);
    prevMeta.textContent = `${dateStr || '日付未設定'} · ${readTime}`;
  }

  // Cover
  const prevCoverBox = document.getElementById('prev-cover-box');
  const prevCoverImg = document.getElementById('prev-cover-img');
  if (prevCoverBox && prevCoverImg) {
    if (coverUrl) {
      prevCoverImg.src = resolveAssetUrl(coverUrl);
      prevCoverBox.style.display = 'block';
    } else {
      prevCoverBox.style.display = 'none';
    }
  }

  // Body
  const prevBody = document.getElementById('prev-body');
  if (prevBody) {
    if (content.trim()) {
      prevBody.innerHTML = formatRichArticleBody(content);
    } else {
      prevBody.innerHTML = '<p style="color: var(--up-text-muted);">本文を入力するとリアルタイムにプレビューが表示されます。</p>';
    }
  }
}

/* ==========================================
   Toolbar Text Manipulation
   ========================================== */
function insertTag(openTag, closeTag) {
  const textarea = document.getElementById('post-content');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);

  const replacement = openTag + selected + closeTag;
  textarea.value = text.substring(0, start) + replacement + text.substring(end);

  const newCursorPos = start + openTag.length + selected.length + closeTag.length;
  textarea.focus();
  textarea.setSelectionRange(newCursorPos, newCursorPos);

  isDirty = true;
  updateStats();
  renderLivePreview();
}

function openInsertLinkModal() {
  const url = prompt('リンク先URLを入力してください (https://...):');
  if (!url) return;

  const textarea = document.getElementById('post-content');
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const selected = text.substring(start, end);

  let linkTag = '';
  if (selected) {
    linkTag = `[url=${url.trim()}]${selected}[/url]`;
  } else {
    linkTag = `[url]${url.trim()}[/url]`;
  }

  textarea.value = text.substring(0, start) + linkTag + text.substring(end);
  const newPos = start + linkTag.length;
  textarea.focus();
  textarea.setSelectionRange(newPos, newPos);

  isDirty = true;
  renderLivePreview();
}

/* ==========================================
   Drawer (Articles list & Switcher)
   ========================================== */
function toggleDrawer() {
  const drawer = document.getElementById('drawer-panel');
  const backdrop = document.getElementById('drawer-backdrop');
  if (!drawer || !backdrop) return;

  const isOpen = drawer.classList.contains('show');
  if (isOpen) {
    closeDrawer();
  } else {
    renderDrawerPosts();
    drawer.classList.add('show');
    backdrop.classList.add('show');
  }
}

function closeDrawer() {
  const drawer = document.getElementById('drawer-panel');
  const backdrop = document.getElementById('drawer-backdrop');
  if (drawer) drawer.classList.remove('show');
  if (backdrop) backdrop.classList.remove('show');
}

function renderDrawerPosts() {
  const container = document.getElementById('drawer-posts-list');
  if (!container) return;

  if (allPosts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 10px; color: var(--up-text-muted);">
        <p style="font-weight: 700; margin-bottom: 6px;">記事がまだありません</p>
        <p style="font-size: 0.85rem;">最初の記事を書いて公開してみましょう！</p>
      </div>
    `;
    return;
  }

  container.innerHTML = allPosts.map(post => {
    const isCurrent = currentPostId === post.id;
    const isPub = post.isPublished !== false;
    const date = escapeHtml(post.date || '日付未設定');
    const title = escapeHtml(post.title || '無題の記事');

    return `
      <div class="drawer-post-item ${isCurrent ? 'active' : ''}">
        <div class="drawer-post-header">
          <span class="drawer-post-date">${date}</span>
          <span style="font-size: 0.72rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; ${isPub ? 'background: #ecfdf5; color: #059669;' : 'background: #f1f5f9; color: #64748b;'}">
            ${isPub ? '公開中' : '下書き'}
          </span>
        </div>
        <div class="drawer-post-title">${title}</div>
        <div class="drawer-post-actions">
          <button type="button" class="up-btn up-btn-outline up-btn-sm" onclick="loadPostIntoEditor('${escapeAttr(post.id)}')">
            編集する
          </button>
          <button type="button" class="up-btn up-btn-danger up-btn-sm" onclick="confirmDeletePost('${escapeAttr(post.id)}')">
            削除
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function resetEditorToNew() {
  if (isDirty && !confirm('未保存の変更があります。新規作成を始めますか？')) {
    return;
  }

  currentPostId = null;
  pendingUploads = {};
  isDirty = false;

  document.getElementById('post-id').value = '';
  document.getElementById('post-title').value = '';
  document.getElementById('post-tags').value = '';
  document.getElementById('cover-url-input').value = '';
  document.getElementById('post-excerpt').value = '';
  document.getElementById('post-content').value = '';
  document.getElementById('post-published').value = 'true';

  setupDateDefault();
  updateCoverPreview('');
  updateEditorModeTag();
  updateStats();
  renderLivePreview();

  const saveStatus = document.getElementById('save-status-indicator');
  if (saveStatus) saveStatus.style.display = 'none';

  showToast('新規作成モードに切り替えました', 'success');
  closeDrawer();
}

function loadPostIntoEditor(id) {
  if (isDirty && !confirm('未保存の変更があります。この記事を開きますか？')) {
    return;
  }

  const post = allPosts.find(p => p.id === id);
  if (!post) {
    showToast('指定された記事が見つかりませんでした', 'error');
    return;
  }

  currentPostId = post.id;
  pendingUploads = {};
  isDirty = false;

  document.getElementById('post-id').value = post.id;
  document.getElementById('post-title').value = post.title || '';
  document.getElementById('post-date').value = post.date || '';
  document.getElementById('post-tags').value = Array.isArray(post.tags) ? post.tags.join(', ') : (post.tags || '');
  document.getElementById('cover-url-input').value = post.cover || '';
  document.getElementById('post-excerpt').value = post.excerpt || '';
  document.getElementById('post-content').value = post.content || '';
  document.getElementById('post-published').value = post.isPublished !== false ? 'true' : 'false';

  updateCoverPreview(post.cover || '');
  updateEditorModeTag();
  updateStats();
  renderLivePreview();

  const saveStatus = document.getElementById('save-status-indicator');
  if (saveStatus) saveStatus.style.display = 'none';

  closeDrawer();
  showToast(`記事「${post.title}」を読み込みました`, 'success');
}

function updateEditorModeTag() {
  const modeTag = document.getElementById('post-mode-tag');
  const modeDesc = document.getElementById('post-mode-desc');
  const saveBtnText = document.getElementById('btn-save-text');

  if (currentPostId) {
    if (modeTag) {
      modeTag.className = 'up-status-tag tag-edit';
      modeTag.textContent = '編集中';
    }
    if (modeDesc) modeDesc.textContent = `ID: ${currentPostId} を編集中です`;
    if (saveBtnText) saveBtnText.textContent = '更新して保存';
  } else {
    if (modeTag) {
      modeTag.className = 'up-status-tag tag-new';
      modeTag.textContent = '新規記事';
    }
    if (modeDesc) modeDesc.textContent = '新しい記事を作成しています';
    if (saveBtnText) saveBtnText.textContent = '保存して公開する';
  }
}

/* ==========================================
   Image Compression
   ========================================== */
function processAndResizeImage(file, maxSize = 1200) {
  return new Promise((resolve, reject) => {
    const isPng = file.type === 'image/png';
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

        const format = isPng ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(format, 0.85);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImageToGitHub(token, path, dataUrl) {
  const base64Content = dataUrl.split(',')[1];
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

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
    message: `Upload image ${path} via blog/up`,
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
    throw new Error(`画像「${path}」の保存に失敗: ${err.message || putRes.status}`);
  }
}

/* ==========================================
   Saving / Submitting Blog Post
   ========================================== */
async function submitPost(isPublished) {
  const token = localStorage.getItem('gh_token');
  if (!token) {
    openAuthModal();
    return;
  }

  const titleInput = document.getElementById('post-title');
  const contentInput = document.getElementById('post-content');
  const dateInput = document.getElementById('post-date');
  const tagsInput = document.getElementById('post-tags');
  const coverUrlInput = document.getElementById('cover-url-input');
  const excerptInput = document.getElementById('post-excerpt');

  const title = (titleInput?.value || '').trim();
  const content = (contentInput?.value || '').trim();

  if (!title) {
    alert('記事のタイトルを入力してください。');
    if (titleInput) titleInput.focus();
    return;
  }

  if (!content) {
    alert('記事の本文を入力してください。');
    if (contentInput) contentInput.focus();
    return;
  }

  const date = (dateInput?.value || '').trim() || new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  const tags = (tagsInput?.value || '').split(',').map(t => t.trim()).filter(Boolean);
  const cover = (coverUrlInput?.value || '').trim();
  const excerpt = (excerptInput?.value || '').trim();

  const saveBtn = document.getElementById('btn-save-publish');
  const draftBtn = document.getElementById('btn-save-draft');
  const saveBtnText = document.getElementById('btn-save-text');

  if (saveBtn) saveBtn.disabled = true;
  if (draftBtn) draftBtn.disabled = true;
  if (saveBtnText) saveBtnText.textContent = '保存中...';

  try {
    // 1. Upload any pending images referenced in content or cover
    const pendingKeys = Object.keys(pendingUploads);
    for (let i = 0; i < pendingKeys.length; i++) {
      const p = pendingKeys[i];
      if (content.includes(p) || cover.includes(p)) {
        if (saveBtnText) saveBtnText.textContent = `画像 (${i + 1}/${pendingKeys.length}) 保存中...`;
        await uploadImageToGitHub(token, p, pendingUploads[p]);
        delete pendingUploads[p];
      }
    }

    if (saveBtnText) saveBtnText.textContent = '最新データ取得中...';

    // 2. Fetch fresh data.json from GitHub API
    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}?t=${Date.now()}`;
    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': getAuthHeader(token),
        'Accept': 'application/vnd.github.v3+json'
      },
      cache: 'no-store'
    });

    if (!getRes.ok) {
      if (getRes.status === 401) throw new Error('認証トークンが無効または期限切れです。再認証してください。');
      throw new Error(`データ取得エラー (${getRes.status})`);
    }

    const fileData = await getRes.json();
    const sha = fileData.sha;
    const jsonText = base64ToUtf8(fileData.content.replace(/\s/g, ''));
    const fullData = JSON.parse(jsonText);

    if (!fullData.blog) {
      fullData.blog = { title: 'いちのブログ。', subtitle: '', posts: [] };
    }
    if (!Array.isArray(fullData.blog.posts)) {
      fullData.blog.posts = [];
    }

    let targetId = currentPostId;
    if (targetId) {
      // Update existing post
      const idx = fullData.blog.posts.findIndex(p => p.id === targetId);
      if (idx !== -1) {
        fullData.blog.posts[idx] = {
          ...fullData.blog.posts[idx],
          title,
          date,
          tags,
          cover,
          excerpt,
          content,
          isPublished
        };
      } else {
        // Fallback: prepend if not found
        fullData.blog.posts.unshift({
          id: targetId,
          title,
          date,
          tags,
          cover,
          excerpt,
          content,
          likes: 0,
          isPublished
        });
      }
    } else {
      // New post
      targetId = 'post-' + Date.now();
      currentPostId = targetId;
      document.getElementById('post-id').value = targetId;

      const newPost = {
        id: targetId,
        title,
        date,
        tags,
        cover,
        excerpt,
        content,
        likes: 0,
        isPublished
      };
      fullData.blog.posts.unshift(newPost);
    }

    // 3. Commit updated data.json to GitHub API
    if (saveBtnText) saveBtnText.textContent = '反映中...';
    const updatedJsonStr = JSON.stringify(fullData, null, 2);
    const contentBase64 = utf8ToBase64(updatedJsonStr);

    const putUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`;
    const putPayload = {
      message: `Publish blog post "${title}" via blog/up`,
      content: contentBase64,
      sha: sha
    };

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
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || `GitHub保存失敗 (${putRes.status})`);
    }

    allPosts = fullData.blog.posts;
    isDirty = false;
    updateNavCount();
    renderDrawerPosts();
    updateEditorModeTag();

    const saveStatus = document.getElementById('save-status-indicator');
    if (saveStatus) saveStatus.style.display = 'inline';

    showToast(isPublished ? '保存＆公開完了！ブログに反映されました' : '下書きとして保存しました', 'success');

  } catch (err) {
    console.error('Save error:', err);
    alert(`【保存エラー】\n${err.message}`);
    showToast(`エラー: ${err.message}`, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (draftBtn) draftBtn.disabled = false;
    updateEditorModeTag();
  }
}

async function confirmDeletePost(id) {
  const token = localStorage.getItem('gh_token');
  if (!token) {
    openAuthModal();
    return;
  }

  const post = allPosts.find(p => p.id === id);
  const title = post ? post.title : 'この記事';
  if (!confirm(`「${title}」を削除してもよろしいですか？\n※GitHub上のデータから完全に削除されます。`)) {
    return;
  }

  try {
    showToast('削除処理中...', 'info');

    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}?t=${Date.now()}`;
    const getRes = await fetch(getUrl, {
      headers: {
        'Authorization': getAuthHeader(token),
        'Accept': 'application/vnd.github.v3+json'
      },
      cache: 'no-store'
    });
    if (!getRes.ok) throw new Error('データ取得失敗');

    const fileData = await getRes.json();
    const sha = fileData.sha;
    const jsonText = base64ToUtf8(fileData.content.replace(/\s/g, ''));
    const fullData = JSON.parse(jsonText);

    if (fullData.blog && Array.isArray(fullData.blog.posts)) {
      fullData.blog.posts = fullData.blog.posts.filter(p => p.id !== id);
    }

    const updatedJsonStr = JSON.stringify(fullData, null, 2);
    const contentBase64 = utf8ToBase64(updatedJsonStr);

    const putUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': getAuthHeader(token),
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Delete blog post "${title}" via blog/up`,
        content: contentBase64,
        sha: sha
      })
    });

    if (!putRes.ok) throw new Error('削除コミット失敗');

    allPosts = (fullData.blog && fullData.blog.posts) || [];
    if (currentPostId === id) {
      resetEditorToNew();
    } else {
      updateNavCount();
      renderDrawerPosts();
    }

    showToast('記事を削除しました', 'success');
  } catch (err) {
    console.error('Delete error:', err);
    alert(`削除エラー: ${err.message}`);
  }
}

/* ==========================================
   Rich Text Formatter & Markdown Renderer
   ========================================== */
function formatRichArticleBody(str) {
  if (!str) return '';
  let html = escapeHtml(str);

  // Markdown Headings
  html = html.replace(/^###\s*(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s*(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s*(.+)$/gm, '<h2>$1</h2>');

  // Quotes & horizontal rule
  html = html.replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---$/gm, '<hr>');

  // Lists
  html = html.replace(/^[•*-]\s*(.+)$/gm, '<li>$1</li>');

  // BBCode tags
  for (let i = 0; i < 8; i++) {
    const prev = html;
    html = html
      .replace(/\[h2\]([\s\S]*?)\[\/h2\]/gi, '<h2>$1</h2>')
      .replace(/\[h3\]([\s\S]*?)\[\/h3\]/gi, '<h3>$1</h3>')
      .replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote>$1</blockquote>')
      .replace(/\[color=(#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/color\]/gi, '<span style="color: $1;">$2</span>')
      .replace(/\[bg=(#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/bg\]/gi, '<span style="background-color: $1; padding: 2px 6px; border-radius: 4px;">$2</span>')
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[url=([^\s\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, url, text) => {
        const cleanUrl = url.replace(/&amp;/g, '&');
        return `<a href="${resolveAssetUrl(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="rich-link" style="color: var(--note-green); text-decoration: underline;">${text || cleanUrl}</a>`;
      })
      .replace(/\[url\]([^\s\]]+)\[\/url\]/gi, (_, url) => {
        const cleanUrl = url.replace(/&amp;/g, '&');
        return `<a href="${resolveAssetUrl(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="rich-link" style="color: var(--note-green); text-decoration: underline;">${cleanUrl}</a>`;
      })
      .replace(/\n?\[img=([^\]|]+)(?:\|(sm|md|lg))?\]\n?/gi, (_, src) => {
        const resolved = resolveAssetUrl(src.replace(/&amp;/g, '&'));
        return `<span class="inline-image-container" style="display:block; margin:20px auto; text-align:center;"><img src="${escapeAttr(resolved)}" alt="" style="max-width:100%; border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,0.08);"></span>`;
      })
      .replace(/\[hide\]([\s\S]*?)\[\/hide\]/gi, (_, inner) => {
        return `<span style="display:inline-block; background:#f1f5f9; border:1px solid #cbd5e1; padding:2px 8px; border-radius:4px; font-size:0.85rem; color:#475569;">[伏せ字: ${inner}]</span>`;
      });
    if (html === prev) break;
  }

  // Auto-linkify raw URLs
  html = autolinkRawUrls(html);

  // Paragraphs & line breaks
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/\n/g, '<br>');

  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<(?:h2|h3|blockquote|hr|div|figure|span class="inline-image-container)[^>]*>)/gi, '$1');
  html = html.replace(/(<\/(?:h2|h3|blockquote|div|figure|span)>)\s*<\/p>/gi, '$1');

  return html;
}

function autolinkRawUrls(html) {
  if (!html || typeof html !== 'string') return '';
  const parts = html.split(/(<[^>]+>)/g);
  let insideAnchor = 0;
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx];
    if (part.startsWith('<')) {
      if (/^<a\b/i.test(part)) insideAnchor++;
      else if (/^<\/a>/i.test(part)) insideAnchor = Math.max(0, insideAnchor - 1);
    } else if (insideAnchor === 0) {
      parts[idx] = part.replace(/(https?:\/\/[^\s<]+)/gi, (match) => {
        let url = match;
        let suffix = '';
        const punctMatch = url.match(/([.,;:!?)\]。、）「」]+)$/);
        if (punctMatch) {
          suffix = punctMatch[1];
          url = url.substring(0, url.length - suffix.length);
        }
        const cleanUrl = url.replace(/&amp;/g, '&');
        return `<a href="${escapeAttr(cleanUrl)}" target="_blank" rel="noopener noreferrer" style="color: var(--note-green); text-decoration: underline;">${url}</a>${suffix}`;
      });
    }
  }
  return parts.join('');
}

function resolveAssetUrl(path) {
  if (!path) return '';
  // Check if we have an in-memory pending upload
  if (pendingUploads[path]) {
    return pendingUploads[path];
  }
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  // From blog/up/ directory, root is ../../
  return '../../' + path.replace(/^\.?\/?/, '');
}

function estimateReadTime(content) {
  const chars = (content || '').replace(/\s+/g, '').length;
  const minutes = Math.max(1, Math.ceil(chars / 450));
  return `${minutes}分で読めます`;
}

/* ==========================================
   Utilities
   ========================================== */
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
  return escapeHtml(str);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binString);
}

function base64ToUtf8(str) {
  const binString = atob(str);
  const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('up-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `up-toast ${type} show`;

  if (window._toastTimeout) clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}
