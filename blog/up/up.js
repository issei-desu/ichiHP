/* ===================================================
   blog/up - Note-style Blog Post Editor Logic
   Designed for ichiHP / Clean, Distraction-Free UI
   Features: Real-time preview, Image upload, Scheduled posting
   =================================================== */

const GITHUB_OWNER = 'issei-desu';
const GITHUB_REPO = 'ichiHP';
const DATA_FILE_PATH = 'data.json';
const DRAFT_STORAGE_KEY = 'blog_up_draft_backup';

// Global state
let currentPostId = null;
let allPosts = [];
let pendingUploads = {}; // path -> dataUrl
let currentViewMode = 'edit';
let isDirty = false;
let autoSaveTimer = null;

// DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  setupEventListeners();
  setupDragAndDrop();
  setupViewMode();
  setupDateDefault();
  handlePublishTypeChange();
  await checkAuthStatus();
  await loadBlogData();

  // Check URL params for editing a specific post (e.g. ?id=post-123)
  const urlParams = new URLSearchParams(window.location.search);
  const targetId = urlParams.get('id');
  if (targetId) {
    loadPostIntoEditor(targetId);
  } else {
    checkDraftBackupOnLoad();
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
   Publish Type & Scheduling Handling
   ========================================== */
function handlePublishTypeChange() {
  const typeSelect = document.getElementById('post-publish-type');
  const type = typeSelect ? typeSelect.value : 'published';
  const schedGroup = document.getElementById('schedule-datetime-group');
  const schedInput = document.getElementById('post-schedule-datetime');
  const saveBtnText = document.getElementById('btn-save-text');

  if (type === 'scheduled') {
    if (schedGroup) schedGroup.style.display = 'flex';
    if (schedInput && !schedInput.value) {
      // Default to tomorrow 18:00
      const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
      d.setHours(18, 0, 0, 0);
      schedInput.value = toDatetimeLocalValue(d);

      const dateInput = document.getElementById('post-date');
      if (dateInput) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dateInput.value = `${y}/${m}/${day} 18:00`;
      }
    }
    if (saveBtnText) saveBtnText.textContent = currentPostId ? '予約日時を更新して保存' : '予約投稿として保存';
  } else if (type === 'draft') {
    if (schedGroup) schedGroup.style.display = 'none';
    if (saveBtnText) saveBtnText.textContent = '下書きとして保存';
  } else {
    // published
    if (schedGroup) schedGroup.style.display = 'none';
    if (saveBtnText) saveBtnText.textContent = currentPostId ? '更新して保存' : '保存して公開する';
  }
}

function setQuickSchedule(val, type) {
  const d = new Date();
  if (type === 'hours') {
    d.setTime(d.getTime() + val * 60 * 60 * 1000);
    d.setSeconds(0, 0);
  } else if (type === 'today_time') {
    d.setHours(val, 0, 0, 0);
    if (d.getTime() <= Date.now()) {
      d.setDate(d.getDate() + 1);
    }
  } else if (type === 'tomorrow_time') {
    d.setDate(d.getDate() + 1);
    d.setHours(val, 0, 0, 0);
  }
  const schedInput = document.getElementById('post-schedule-datetime');
  if (schedInput) {
    schedInput.value = toDatetimeLocalValue(d);
    schedInput.style.borderColor = '';
    schedInput.dispatchEvent(new Event('change'));
  }
}

function submitFromPrimaryBtn() {
  const type = document.getElementById('post-publish-type')?.value || 'published';
  submitPost(type);
}

function getPostStatus(post) {
  if (!post || post.isPublished === false) {
    return { type: 'draft', label: '下書き' };
  }
  if (post.scheduledAt) {
    const scheduledTime = new Date(post.scheduledAt).getTime();
    if (!isNaN(scheduledTime) && Date.now() < scheduledTime) {
      return { type: 'scheduled', label: '予約中', timeStr: formatScheduleDisplay(post.scheduledAt) };
    }
  }
  return { type: 'published', label: '公開中' };
}

function toDatetimeLocalValue(d) {
  if (!d) return '';
  const date = (d instanceof Date) ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function formatScheduleDisplay(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
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
  const scheduleInput = document.getElementById('post-schedule-datetime');

  if (titleInput) {
    titleInput.addEventListener('input', () => {
      isDirty = true;
      renderLivePreview();
      queueAutoSaveBackup();
    });
  }

  if (contentInput) {
    contentInput.addEventListener('input', () => {
      isDirty = true;
      updateStats();
      renderLivePreview();
      queueAutoSaveBackup();
    });

    // Tab key indentation & shortcuts inside content textarea
    contentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = contentInput.selectionStart;
        const end = contentInput.selectionEnd;
        const val = contentInput.value;

        if (!e.shiftKey) {
          // Insert 2 spaces
          contentInput.value = val.substring(0, start) + '  ' + val.substring(end);
          contentInput.selectionStart = contentInput.selectionEnd = start + 2;
        } else {
          // Shift+Tab: remove up to 2 leading spaces before cursor
          const lineStart = val.lastIndexOf('\n', start - 1) + 1;
          const linePrefix = val.substring(lineStart, start);
          if (linePrefix.startsWith('  ')) {
            contentInput.value = val.substring(0, lineStart) + val.substring(lineStart + 2);
            contentInput.selectionStart = contentInput.selectionEnd = Math.max(lineStart, start - 2);
          } else if (linePrefix.startsWith(' ')) {
            contentInput.value = val.substring(0, lineStart) + val.substring(lineStart + 1);
            contentInput.selectionStart = contentInput.selectionEnd = Math.max(lineStart, start - 1);
          }
        }
        isDirty = true;
        updateStats();
        renderLivePreview();
        queueAutoSaveBackup();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        insertTag('**', '**');
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openInsertLinkModal();
      }
    });
  }

  if (tagsInput) {
    tagsInput.addEventListener('input', () => {
      isDirty = true;
      renderLivePreview();
      queueAutoSaveBackup();
    });
  }

  if (dateInput) {
    dateInput.addEventListener('input', () => {
      isDirty = true;
      renderLivePreview();
      queueAutoSaveBackup();
    });
  }

  if (scheduleInput) {
    scheduleInput.addEventListener('input', () => {
      scheduleInput.style.borderColor = '';
    });
    scheduleInput.addEventListener('change', () => {
      isDirty = true;
      scheduleInput.style.borderColor = '';
      if (scheduleInput.value) {
        const d = new Date(scheduleInput.value);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const h = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          if (dateInput) dateInput.value = `${y}/${m}/${day} ${h}:${min}`;
        }
      }
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
        queueAutoSaveBackup();
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
      queueAutoSaveBackup();
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
      queueAutoSaveBackup();
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
        queueAutoSaveBackup();
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

  // Keyboard shortcut: Ctrl+S to save, Esc to exit Zen Mode
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      submitFromPrimaryBtn();
    } else if (e.key === 'Escape' && document.body.classList.contains('zen-mode')) {
      toggleZenMode();
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
  // Preserve zen-mode class if set
  const wasZen = document.body.classList.contains('zen-mode');
  document.body.className = `mode-${mode}${wasZen ? ' zen-mode' : ''}`;

  document.querySelectorAll('.view-tab-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`tab-btn-${mode}`);
  if (activeBtn) activeBtn.classList.add('active');

  if (mode === 'preview' || mode === 'split') {
    renderLivePreview();
  }
}

/* ==========================================
   Zen Mode (Distraction-Free Writing)
   ========================================== */
function toggleZenMode() {
  const isZen = document.body.classList.toggle('zen-mode');
  const btn = document.getElementById('btn-zen-mode');
  if (btn) {
    btn.textContent = isZen ? '通常表示' : '全画面';
    btn.classList.toggle('active', isZen);
  }
  showToast(isZen ? '執筆集中モードに入りました (Escで解除)' : '通常モードに戻りました', 'info');
}

/* ==========================================
   Drag & Drop Image Upload
   ========================================== */
function setupDragAndDrop() {
  const contentEl = document.getElementById('post-content');
  if (contentEl) {
    contentEl.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        contentEl.style.boxShadow = '0 0 0 3px rgba(34, 197, 94, 0.4)';
      }
    });
    contentEl.addEventListener('dragleave', () => {
      contentEl.style.boxShadow = '';
    });
    contentEl.addEventListener('drop', async (e) => {
      contentEl.style.boxShadow = '';
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith('image/')) return;
      e.preventDefault();

      try {
        showToast('画像を圧縮処理中...', 'info');
        const dataUrl = await processAndResizeImage(file, 1200);
        const rand = Math.random().toString(36).substring(2, 7);
        const path = `images/blog/img_${Date.now()}_${rand}.jpg`;
        pendingUploads[path] = dataUrl;

        const tag = `\n[img=${path}]\n`;
        insertTag(tag, '');
        isDirty = true;
        renderLivePreview();
        queueAutoSaveBackup();
        showToast('本文に画像をドロップ挿入しました', 'success');
      } catch (err) {
        console.error('Drop image error:', err);
        showToast('画像の処理に失敗しました', 'error');
      }
    });
  }

  const coverBox = document.querySelector('.cover-picker-box');
  if (coverBox) {
    coverBox.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        coverBox.style.borderColor = 'var(--note-green)';
        coverBox.style.background = '#f0fdf4';
      }
    });
    const resetCoverBox = () => {
      coverBox.style.borderColor = '';
      coverBox.style.background = '';
    };
    coverBox.addEventListener('dragleave', resetCoverBox);
    coverBox.addEventListener('drop', async (e) => {
      resetCoverBox();
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith('image/')) return;
      e.preventDefault();

      try {
        showToast('カバー画像を処理中...', 'info');
        const dataUrl = await processAndResizeImage(file, 1200);
        const rand = Math.random().toString(36).substring(2, 7);
        const path = `images/blog/cover_${Date.now()}_${rand}.jpg`;
        pendingUploads[path] = dataUrl;

        const coverUrlInput = document.getElementById('cover-url-input');
        if (coverUrlInput) coverUrlInput.value = path;

        updateCoverPreview(dataUrl);
        isDirty = true;
        renderLivePreview();
        queueAutoSaveBackup();
        showToast('カバー画像をドロップ設定しました', 'success');
      } catch (err) {
        console.error('Cover drop error:', err);
        showToast('カバー画像の処理に失敗しました', 'error');
      }
    });
  }
}

/* ==========================================
   Draft Local Auto-Save & Recovery
   ========================================== */
function queueAutoSaveBackup() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveDraftBackup();
  }, 1200);
}

function saveDraftBackup() {
  const title = document.getElementById('post-title')?.value || '';
  const content = document.getElementById('post-content')?.value || '';
  const tags = document.getElementById('post-tags')?.value || '';
  const cover = document.getElementById('cover-url-input')?.value || '';
  const date = document.getElementById('post-date')?.value || '';
  const publishType = document.getElementById('post-publish-type')?.value || 'published';
  const scheduledAt = document.getElementById('post-schedule-datetime')?.value || '';

  if (!title.trim() && !content.trim()) return;

  const draftData = {
    postId: currentPostId || null,
    title,
    content,
    tags,
    cover,
    date,
    publishType,
    scheduledAt,
    savedAt: Date.now()
  };

  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
  } catch (e) {
    console.warn('Draft auto-save failed:', e);
  }
}

function checkDraftBackupOnLoad() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft || (!draft.title && !draft.content)) return;

    if (currentPostId && draft.postId && draft.postId !== currentPostId) return;

    const banner = document.getElementById('draft-recovery-banner');
    const msg = document.getElementById('draft-recovery-msg');
    if (banner && msg) {
      const d = new Date(draft.savedAt);
      const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      msg.textContent = `${timeStr} に自動保存された未保存の下書きがあります（「${draft.title || '無題'}」）`;
      banner.style.display = 'flex';
    }
  } catch (e) {
    console.warn('Check draft backup error:', e);
  }
}

function restoreDraftBackup() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft) return;

    if (draft.title !== undefined) document.getElementById('post-title').value = draft.title;
    if (draft.content !== undefined) document.getElementById('post-content').value = draft.content;
    if (draft.tags !== undefined) document.getElementById('post-tags').value = draft.tags;
    if (draft.date !== undefined && draft.date) document.getElementById('post-date').value = draft.date;
    if (draft.cover !== undefined) {
      document.getElementById('cover-url-input').value = draft.cover;
      updateCoverPreview(draft.cover);
    }
    if (draft.publishType) {
      const pubSelect = document.getElementById('post-publish-type');
      if (pubSelect) pubSelect.value = draft.publishType;
    }
    if (draft.scheduledAt) {
      const schedInput = document.getElementById('post-schedule-datetime');
      if (schedInput) schedInput.value = draft.scheduledAt;
    }
    handlePublishTypeChange();
    updateStats();
    renderLivePreview();

    const banner = document.getElementById('draft-recovery-banner');
    if (banner) banner.style.display = 'none';

    showToast('自動保存された下書きを復元しました', 'success');
  } catch (e) {
    console.error('Restore draft backup error:', e);
    showToast('下書きの復元に失敗しました', 'error');
  }
}

function discardDraftBackup() {
  localStorage.removeItem(DRAFT_STORAGE_KEY);
  const banner = document.getElementById('draft-recovery-banner');
  if (banner) banner.style.display = 'none';
  showToast('保存されていた下書きを破棄しました', 'info');
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
    const status = getPostStatus(post);
    const date = escapeHtml(post.date || '日付未設定');
    const title = escapeHtml(post.title || '無題の記事');

    let badgeHtml = '';
    if (status.type === 'scheduled') {
      badgeHtml = `<span style="font-size: 0.72rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;">予約: ${escapeHtml(status.timeStr)}</span>`;
    } else if (status.type === 'draft') {
      badgeHtml = `<span style="font-size: 0.72rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #64748b;">下書き</span>`;
    } else {
      badgeHtml = `<span style="font-size: 0.72rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #ecfdf5; color: #059669;">公開中</span>`;
    }

    return `
      <div class="drawer-post-item ${isCurrent ? 'active' : ''}">
        <div class="drawer-post-header">
          <span class="drawer-post-date">${date}</span>
          ${badgeHtml}
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

  const publishTypeSelect = document.getElementById('post-publish-type');
  if (publishTypeSelect) publishTypeSelect.value = 'published';
  const schedInput = document.getElementById('post-schedule-datetime');
  if (schedInput) schedInput.value = '';
  handlePublishTypeChange();

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

  const publishTypeSelect = document.getElementById('post-publish-type');
  const schedInput = document.getElementById('post-schedule-datetime');

  if (post.isPublished === false) {
    if (publishTypeSelect) publishTypeSelect.value = 'draft';
    if (schedInput) schedInput.value = '';
  } else if (post.scheduledAt && new Date(post.scheduledAt).getTime() > Date.now()) {
    if (publishTypeSelect) publishTypeSelect.value = 'scheduled';
    if (schedInput) schedInput.value = toDatetimeLocalValue(new Date(post.scheduledAt));
  } else {
    if (publishTypeSelect) publishTypeSelect.value = 'published';
    if (schedInput) schedInput.value = '';
  }
  handlePublishTypeChange();

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
  const publishType = document.getElementById('post-publish-type')?.value || 'published';

  if (currentPostId) {
    if (modeTag) {
      modeTag.className = 'up-status-tag tag-edit';
      modeTag.textContent = '編集中';
    }
    if (modeDesc) modeDesc.textContent = `ID: ${currentPostId} を編集中です`;
  } else {
    if (modeTag) {
      modeTag.className = 'up-status-tag tag-new';
      modeTag.textContent = '新規記事';
    }
    if (modeDesc) modeDesc.textContent = '新しい記事を作成しています';
  }

  handlePublishTypeChange();
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
async function submitPost(overrideType) {
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
  const scheduleInput = document.getElementById('post-schedule-datetime');

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

  // Determine publication & scheduling state
  const publishType = overrideType || document.getElementById('post-publish-type')?.value || 'published';
  let isPublished = true;
  let scheduledAt = null;

  if (publishType === 'draft') {
    isPublished = false;
    scheduledAt = null;
  } else if (publishType === 'scheduled') {
    isPublished = true;
    const schedVal = (scheduleInput?.value || '').trim();
    if (!schedVal) {
      alert('【時間の指定が必要です】\n予約投稿には「公開日」と「時間（時:分）」の入力が必須です。\n日時を設定してください。');
      if (scheduleInput) {
        scheduleInput.focus();
        scheduleInput.style.borderColor = '#ef4444';
      }
      return;
    }
    if (!schedVal.includes('T')) {
      alert('【時間の指定が必要です】\n予約投稿には時間（時:分）の設定が必須です。時間まで指定してください。');
      if (scheduleInput) {
        scheduleInput.focus();
        scheduleInput.style.borderColor = '#ef4444';
      }
      return;
    }
    const schedDate = new Date(schedVal);
    if (isNaN(schedDate.getTime())) {
      alert('予約日時の形式が正しくありません。正しい日付と時間を指定してください。');
      if (scheduleInput) scheduleInput.focus();
      return;
    }
    if (schedDate.getTime() <= Date.now()) {
      alert('【時間の指定が必要です】\n予約投稿日時は、現在より未来の時間を設定してください。\n（※今すぐ公開したい場合は、公開設定を「今すぐ公開」に切り替えてください）');
      if (scheduleInput) {
        scheduleInput.focus();
        scheduleInput.style.borderColor = '#ef4444';
      }
      return;
    }
    if (scheduleInput) scheduleInput.style.borderColor = '';
    scheduledAt = schedDate.toISOString();
  } else {
    isPublished = true;
    scheduledAt = null;
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
          isPublished,
          scheduledAt
        };
      } else {
        fullData.blog.posts.unshift({
          id: targetId,
          title,
          date,
          tags,
          cover,
          excerpt,
          content,
          likes: 0,
          isPublished,
          scheduledAt
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
        isPublished,
        scheduledAt
      };
      fullData.blog.posts.unshift(newPost);
    }

    // 3. Commit updated data.json to GitHub API
    if (saveBtnText) saveBtnText.textContent = '反映中...';
    const updatedJsonStr = JSON.stringify(fullData, null, 2);
    const contentBase64 = utf8ToBase64(updatedJsonStr);

    let commitMsg = `Publish blog post "${title}" via blog/up`;
    if (scheduledAt) {
      commitMsg = `Schedule blog post "${title}" for ${scheduledAt} via blog/up`;
    } else if (!isPublished) {
      commitMsg = `Draft blog post "${title}" via blog/up`;
    }

    const putUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`;
    const putPayload = {
      message: commitMsg,
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
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    const recoveryBanner = document.getElementById('draft-recovery-banner');
    if (recoveryBanner) recoveryBanner.style.display = 'none';

    updateNavCount();
    renderDrawerPosts();
    updateEditorModeTag();

    const saveStatus = document.getElementById('save-status-indicator');
    if (saveStatus) saveStatus.style.display = 'inline';

    if (scheduledAt) {
      showToast(`「${formatScheduleDisplay(scheduledAt)}」に予約投稿を設定しました！`, 'success');
    } else if (isPublished) {
      showToast('保存＆公開完了！ブログに反映されました', 'success');
    } else {
      showToast('下書きとして保存しました', 'success');
    }

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

  // Fenced Code Blocks ```lang \n code \n ```
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const cleanLang = lang.trim();
    return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang-label">${cleanLang || 'code'}</span></div><pre class="code-block-pre"><code>${code.trim()}</code></pre></div>`;
  });

  // Inline Code `code`
  html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

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
