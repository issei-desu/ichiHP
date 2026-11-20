// ===================================================
// note-style Blog Engine for ichiHP/blog
// ===================================================

let blogData = {
  title: 'いちのブログ',
  subtitle: '日常や推し活、作ったものの記録ノート',
  posts: []
};
let siteProfile = {
  name: 'いち',
  avatar: '',
  bio: 'どうも、いちです。日常や推し活、自作Webサイトのことなどを気ままに綴っています。',
  twitter: 'jk_na_ri_ta_i'
};
let currentActiveTag = 'ALL';
let currentSearchQuery = '';
let currentViewingPost = null;
let inlineSensitiveCounter = 0;

document.addEventListener('DOMContentLoaded', () => {
  initBlog();
  window.addEventListener('hashchange', handleHashRouting);
});

async function initBlog() {
  try {
    const res = await fetch(`../data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load data.json');
    const data = await res.json();
    parseSiteData(data);
  } catch (err) {
    console.warn('Could not load data.json, using fallback:', err);
    useFallbackData();
  }

  renderCreatorHeader();
  renderTagFilters();
  setupReadingProgressBar();
  handleHashRouting();
}

function parseSiteData(data) {
  if (data.profile) {
    siteProfile.name = data.profile.name || 'いち';
    siteProfile.avatar = data.profile.avatar || '';
    siteProfile.bio = data.profile.bio || '';
  }
  if (data.twitter && data.twitter.username) {
    siteProfile.twitter = data.twitter.username.replace(/^@/, '');
  }

  if (data.blog) {
    blogData.title = data.blog.title || 'いちのブログ';
    blogData.subtitle = data.blog.subtitle || '';
    blogData.posts = Array.isArray(data.blog.posts) ? data.blog.posts : [];
  } else {
    blogData.posts = [];
  }
}

function useFallbackData() {
  blogData.posts = [];
}

/* ==========================================
   Header & Creator Card Rendering
   ========================================== */
function renderCreatorHeader() {
  const pageTitle = document.getElementById('page-title');
  const headerBlogTitle = document.getElementById('header-blog-title');
  const blogSubtitle = document.getElementById('blog-subtitle');
  const creatorName = document.getElementById('creator-name');
  const creatorBio = document.getElementById('creator-bio');
  const creatorAvatar = document.getElementById('creator-avatar');
  const creatorAvatarFallback = document.getElementById('creator-avatar-fallback');
  const creatorXLink = document.getElementById('creator-x-link');
  const footerText = document.getElementById('blog-footer-text');

  if (pageTitle) pageTitle.textContent = `${blogData.title} - note風ブログ`;
  if (headerBlogTitle) headerBlogTitle.textContent = blogData.title;

  if (blogSubtitle) {
    if (blogData.subtitle && blogData.subtitle.trim()) {
      blogSubtitle.textContent = blogData.subtitle;
      blogSubtitle.style.display = 'block';
    } else {
      blogSubtitle.style.display = 'none';
    }
  }

  if (creatorName) creatorName.textContent = siteProfile.name;
  if (creatorBio) {
    if (siteProfile.bio && siteProfile.bio.trim()) {
      creatorBio.innerHTML = formatRichText(siteProfile.bio);
      creatorBio.style.display = 'block';
    } else {
      creatorBio.style.display = 'none';
    }
  }

  if (creatorAvatar) {
    if (siteProfile.avatar) {
      const avatarSrc = siteProfile.avatar.startsWith('http') || siteProfile.avatar.startsWith('data:')
        ? siteProfile.avatar
        : `../${siteProfile.avatar}`;
      creatorAvatar.src = avatarSrc;
      creatorAvatar.style.display = 'block';
      if (creatorAvatarFallback) creatorAvatarFallback.style.display = 'none';
    } else {
      creatorAvatar.style.display = 'none';
      if (creatorAvatarFallback) creatorAvatarFallback.style.display = 'none';
    }
  }

  if (creatorXLink && siteProfile.twitter) {
    creatorXLink.href = `https://x.com/${siteProfile.twitter}`;
  }

  if (footerText) {
    footerText.innerHTML = `&copy; 2026 ${escapeHtml(siteProfile.name)}. All rights reserved.`;
  }

  updateStatsCounts();
}

/* ==========================================
   Visibility & Scheduling Helpers
   ========================================== */
function isPostVisible(post) {
  if (!post || post.isPublished === false) return false;
  if (post.scheduledAt) {
    const scheduledTime = new Date(post.scheduledAt).getTime();
    if (!isNaN(scheduledTime) && Date.now() < scheduledTime) {
      return false; // Still scheduled for the future
    }
  }
  return true;
}

function isPostScheduled(post) {
  if (!post || post.isPublished === false) return false;
  if (post.scheduledAt) {
    const scheduledTime = new Date(post.scheduledAt).getTime();
    return !isNaN(scheduledTime) && Date.now() < scheduledTime;
  }
  return false;
}

function updateStatsCounts() {
  const publishedPosts = blogData.posts.filter(isPostVisible);
  const postsCountEl = document.getElementById('stat-posts-count');
  const likesCountEl = document.getElementById('stat-likes-count');

  if (postsCountEl) postsCountEl.textContent = publishedPosts.length;

  let totalLikes = 0;
  publishedPosts.forEach(p => {
    const localLiked = localStorage.getItem(`note_liked_${p.id}`) === '1';
    const baseLikes = Number(p.likes) || 0;
    totalLikes += baseLikes + (localLiked && !p.hasLocalCounted ? 1 : 0);
  });
  if (likesCountEl) likesCountEl.textContent = totalLikes;
}

/* ==========================================
   Tag Filter & Search Navigation
   ========================================== */
function renderTagFilters() {
  const container = document.getElementById('tags-filter-row');
  if (!container) return;

  const publishedPosts = blogData.posts.filter(isPostVisible);
  const tagsSet = new Set();
  publishedPosts.forEach(p => {
    if (Array.isArray(p.tags)) {
      p.tags.forEach(t => {
        const clean = String(t || '').trim();
        if (clean) tagsSet.add(clean);
      });
    }
  });

  const tags = Array.from(tagsSet);
  if (tags.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';

  let html = `<button type="button" class="tag-pill ${currentActiveTag === 'ALL' ? 'active' : ''}" onclick="filterByTag('ALL')">すべて</button>`;

  tags.forEach(tag => {
    const isActive = currentActiveTag === tag;
    html += `<button type="button" class="tag-pill ${isActive ? 'active' : ''}" onclick="filterByTag('${escapeAttr(tag)}')">#${escapeHtml(tag)}</button>`;
  });

  container.innerHTML = html;
}

window.filterByTag = function(tag) {
  currentActiveTag = tag;
  renderTagFilters();
  renderPostsFeed();
};

window.toggleSearchBox = function() {
  const box = document.getElementById('search-box-wrap');
  const input = document.getElementById('search-input');
  if (!box) return;

  if (box.style.display === 'none') {
    box.style.display = 'flex';
    if (input) input.focus();
  } else {
    box.style.display = 'none';
    clearSearch();
  }
};

window.onSearchInput = function(val) {
  currentSearchQuery = String(val || '').trim().toLowerCase();
  renderPostsFeed();
};

window.clearSearch = function() {
  currentSearchQuery = '';
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  renderPostsFeed();
};

window.clearFiltersAndSearch = function() {
  currentActiveTag = 'ALL';
  currentSearchQuery = '';
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  renderTagFilters();
  renderPostsFeed();
};

/* ==========================================
   Article Feed List (note-style Cards)
   ========================================== */
function renderPostsFeed() {
  const listEl = document.getElementById('posts-list');
  if (!listEl) return;

  const allVisiblePosts = blogData.posts.filter(isPostVisible);

  if (allVisiblePosts.length === 0) {
    const hasToken = !!localStorage.getItem('gh_token');
    listEl.innerHTML = `
      <div class="empty-feed">
        <div class="empty-feed-icon">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--blog-text-main); margin: 10px 0 6px;">まだ記事がありません</h3>
        <p style="font-size: 0.9rem; color: var(--blog-text-muted); line-height: 1.6; max-width: 380px; margin: 0 auto;">最初の記事が投稿されるのをお楽しみに！</p>
        ${hasToken ? `
          <div style="margin-top: 18px;">
            <a href="up/" class="header-btn primary" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 0.88rem; text-decoration: none;">
              <span>＋ 最初の記事を書く (blog/up)</span>
            </a>
          </div>
        ` : ''}
      </div>
    `;
    return;
  }

  let posts = allVisiblePosts;

  // Tag filter
  if (currentActiveTag !== 'ALL') {
    posts = posts.filter(p => Array.isArray(p.tags) && p.tags.includes(currentActiveTag));
  }

  // Keyword Search filter
  if (currentSearchQuery) {
    posts = posts.filter(p => {
      const titleMatch = (p.title || '').toLowerCase().includes(currentSearchQuery);
      const excerptMatch = (p.excerpt || '').toLowerCase().includes(currentSearchQuery);
      const contentMatch = (p.content || '').toLowerCase().includes(currentSearchQuery);
      const tagsMatch = (Array.isArray(p.tags) ? p.tags.join(' ') : '').toLowerCase().includes(currentSearchQuery);
      return titleMatch || excerptMatch || contentMatch || tagsMatch;
    });
  }

  if (posts.length === 0) {
    listEl.innerHTML = `
      <div class="empty-feed">
        <h3 style="font-size: 1.1rem; font-weight: 800; color: var(--blog-text-main); margin-bottom: 6px;">検索条件に一致する記事がありませんでした</h3>
        <p style="font-size: 0.88rem; color: var(--blog-text-muted); margin-bottom: 14px;">条件を変えて検索するか、タグの絞り込みを解除してみてください。</p>
        <button type="button" class="header-btn" onclick="clearFiltersAndSearch()" style="padding: 6px 14px; font-size: 0.85rem;">
          絞り込みをリセット
        </button>
      </div>
    `;
    return;
  }

  listEl.innerHTML = posts.map(post => {
    const postId = escapeAttr(post.id);
    const postTitle = formatRichText(post.title || '無題の記事');
    const postDate = escapeHtml(post.date || '');
    const readTime = estimateReadTime(post.content || '');
    const excerpt = escapeHtml(post.excerpt || stripRichTags(post.content || '').substring(0, 110) + '...');
    const tags = Array.isArray(post.tags) ? post.tags : [];
    const isLiked = localStorage.getItem(`note_liked_${post.id}`) === '1';
    const likesCount = (Number(post.likes) || 0) + (isLiked ? 1 : 0);

    const coverHtml = post.cover ? `
      <div class="post-card-cover">
        <img src="${resolveAssetUrl(post.cover)}" alt="${escapeAttr(post.title)}" loading="lazy">
      </div>
    ` : '';

    const avatarSrc = siteProfile.avatar ? resolveAssetUrl(siteProfile.avatar) : '';

    return `
      <article class="post-card" onclick="openArticle('${postId}')">
        ${coverHtml}
        <div class="post-card-content">
          <div class="post-card-meta">
            <span>${postDate}</span>
            <span>·</span>
            <span>${readTime}</span>
          </div>
          <h2 class="post-card-title">${postTitle}</h2>
          <p class="post-card-excerpt">${excerpt}</p>
          ${tags.length > 0 ? `
            <div class="post-card-tags">
              ${tags.map(t => `<span class="post-tag">#${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}
          <div class="post-card-footer">
            <div class="card-author-mini">
              ${avatarSrc ? `<img src="${avatarSrc}" class="author-mini-avatar" alt="">` : ''}
              <span>${escapeHtml(siteProfile.name)}</span>
            </div>
            <span class="post-like-count ${isLiked ? 'liked' : ''}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${isLiked ? '#ea3556' : 'none'}" stroke="${isLiked ? '#ea3556' : 'currentColor'}" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              <span>${likesCount}</span>
            </span>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

/* ==========================================
   Article Detail View (Single Post Reader)
   ========================================== */
window.openArticle = function(postId) {
  window.location.hash = `post-${postId}`;
};

function showArticleDetail(post, isAdminPreview = false) {
  currentViewingPost = post;
  const feedView = document.getElementById('view-feed');
  const detailView = document.getElementById('view-detail');
  if (!detailView) return;

  if (feedView) feedView.style.display = 'none';
  detailView.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Update Page Title
  document.title = `${post.title} - ${blogData.title}`;

  // Admin Preview Banner for Scheduled / Draft Posts
  let banner = document.getElementById('detail-admin-preview-banner');
  if (isAdminPreview) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'detail-admin-preview-banner';
      banner.style.cssText = 'background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 0.88rem; font-weight: 700; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;';
      const backBar = detailView.querySelector('.detail-back-bar');
      if (backBar) backBar.after(banner);
      else detailView.prepend(banner);
    }
    let msg = '管理者プレビュー: 下書きです（一般には公開されていません）';
    if (isPostScheduled(post)) {
      const d = new Date(post.scheduledAt);
      const timeStr = isNaN(d.getTime()) ? post.scheduledAt : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      msg = `管理者プレビュー: 予約投稿（${timeStr} に自動公開予定）`;
    }
    banner.innerHTML = `<span>${escapeHtml(msg)}</span><a href="up/?id=${escapeAttr(post.id)}" style="color: #2563eb; text-decoration: underline; font-size: 0.8rem;">記事を編集 ↗</a>`;
    banner.style.display = 'flex';
  } else if (banner) {
    banner.style.display = 'none';
  }

  // Tags
  const tagsRow = document.getElementById('detail-tags-row');
  if (tagsRow) {
    const tags = Array.isArray(post.tags) ? post.tags : [];
    tagsRow.innerHTML = tags.map(t => `<span class="post-tag">#${escapeHtml(t)}</span>`).join('');
  }

  // Title
  const titleEl = document.getElementById('detail-title');
  if (titleEl) titleEl.innerHTML = formatRichText(post.title);

  // Author & Publish Meta
  const authorAvatar = document.getElementById('detail-author-avatar');
  const authorName = document.getElementById('detail-author-name');
  const publishMeta = document.getElementById('detail-publish-meta');
  const avatarSrc = siteProfile.avatar ? resolveAssetUrl(siteProfile.avatar) : '';

  if (authorAvatar && avatarSrc) authorAvatar.src = avatarSrc;
  if (authorName) authorName.textContent = siteProfile.name;
  if (publishMeta) {
    const readTime = estimateReadTime(post.content || '');
    publishMeta.textContent = `${post.date || ''} · ${readTime}`;
  }

  // Cover Box
  const coverBox = document.getElementById('detail-cover-box');
  const coverImg = document.getElementById('detail-cover-img');
  if (coverBox && coverImg) {
    if (post.cover) {
      coverImg.src = resolveAssetUrl(post.cover);
      coverBox.style.display = 'block';
    } else {
      coverBox.style.display = 'none';
    }
  }

  // Body Content
  const bodyEl = document.getElementById('detail-body');
  if (bodyEl) {
    bodyEl.innerHTML = formatRichArticleBody(post.content || '');
    generateTableOfContents(bodyEl);
  }

  // Like Button State
  const likeBtn = document.getElementById('detail-like-btn');
  if (likeBtn) likeBtn.style.display = 'inline-flex';
  updateDetailLikeButtonState();

  // Bottom Creator Card
  const bottomAvatar = document.getElementById('detail-bottom-avatar');
  const bottomName = document.getElementById('detail-bottom-name');
  const bottomBio = document.getElementById('detail-bottom-bio');
  if (bottomAvatar && avatarSrc) bottomAvatar.src = avatarSrc;
  if (bottomName) bottomName.textContent = siteProfile.name;
  if (bottomBio && siteProfile.bio) bottomBio.innerHTML = formatRichText(siteProfile.bio);

  // Prev / Next Navigation
  renderPrevNextNav(post);
}

function formatJapaneseScheduledDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');

  return `${y}年${m}月${day}日 ${h}:${min}`;
}

function showScheduledArticleNotice(post, isAdmin = false) {
  currentViewingPost = post;
  const feedView = document.getElementById('view-feed');
  const detailView = document.getElementById('view-detail');
  if (!detailView) return;

  if (feedView) feedView.style.display = 'none';
  detailView.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const schedDateStr = formatJapaneseScheduledDate(post.scheduledAt);

  // Update Page Title
  document.title = `${post.title} (公開予定) - ${blogData.title}`;

  // Admin Banner
  let banner = document.getElementById('detail-admin-preview-banner');
  if (isAdmin) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'detail-admin-preview-banner';
      banner.style.cssText = 'background: #eff6ff; border: 1.5px solid #bfdbfe; color: #1e40af; padding: 12px 18px; border-radius: 8px; margin-bottom: 24px; font-size: 0.88rem; font-weight: 700; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;';
      const backBar = detailView.querySelector('.detail-back-bar');
      if (backBar) backBar.after(banner);
      else detailView.prepend(banner);
    }
    banner.innerHTML = `
      <div>
        <div>管理者プレビュー: 予約投稿中</div>
        <div style="font-weight: normal; font-size: 0.8rem; margin-top: 2px; color: #2563eb;">一般の読者には「この記事は ${escapeHtml(schedDateStr)} に投稿されます」と表示されています。</div>
      </div>
      <a href="up/?id=${escapeAttr(post.id)}" style="background: #2563eb; color: #ffffff; padding: 5px 12px; border-radius: 6px; text-decoration: none; font-size: 0.8rem; font-weight: 600;">記事を編集 ↗</a>
    `;
    banner.style.display = 'flex';
  } else if (banner) {
    banner.style.display = 'none';
  }

  // Tags
  const tagsRow = document.getElementById('detail-tags-row');
  if (tagsRow) {
    const tags = Array.isArray(post.tags) ? post.tags : [];
    const tagPills = tags.map(t => `<span class="post-tag">#${escapeHtml(t)}</span>`).join('');
    tagsRow.innerHTML = `<span class="post-tag" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; font-weight:700;">予約投稿</span>` + tagPills;
  }

  // Title
  const titleEl = document.getElementById('detail-title');
  if (titleEl) titleEl.innerHTML = formatRichText(post.title);

  // Author & Publish Meta
  const authorAvatar = document.getElementById('detail-author-avatar');
  const authorName = document.getElementById('detail-author-name');
  const publishMeta = document.getElementById('detail-publish-meta');
  const avatarSrc = siteProfile.avatar ? resolveAssetUrl(siteProfile.avatar) : '';

  if (authorAvatar && avatarSrc) authorAvatar.src = avatarSrc;
  if (authorName) authorName.textContent = siteProfile.name;
  if (publishMeta) {
    publishMeta.textContent = `${schedDateStr} 公開予定`;
  }

  // Cover Box
  const coverBox = document.getElementById('detail-cover-box');
  const coverImg = document.getElementById('detail-cover-img');
  if (coverBox && coverImg) {
    if (post.cover) {
      coverImg.src = resolveAssetUrl(post.cover);
      coverBox.style.display = 'block';
    } else {
      coverBox.style.display = 'none';
    }
  }

  // Body: Display the Scheduled Notice Card
  const bodyEl = document.getElementById('detail-body');
  if (bodyEl) {
    let noticeCardHtml = `
      <div class="scheduled-post-card">
        <div class="scheduled-icon-circle">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </div>
        <h2 class="scheduled-notice-title">この記事は${escapeHtml(schedDateStr)}に投稿されます。</h2>
        <p class="scheduled-notice-desc">
          現在、公開予約が設定されています。<br>
          公開日時になると、このURLで記事の本文が読めるようになります。どうぞお楽しみに！
        </p>
        <div class="scheduled-actions-row">
          <button type="button" class="header-btn primary" onclick="goToFeed(event)" style="padding: 9px 20px; font-size: 0.9rem;">
            ほかの記事を読む
          </button>
          <button type="button" class="header-btn" onclick="copyCurrentArticleLink()" style="padding: 9px 20px; font-size: 0.9rem;">
            記事URLをコピー
          </button>
        </div>
      </div>
    `;

    // If author/admin is logged in, also show full body preview below the announcement
    if (isAdmin) {
      noticeCardHtml += `
        <div style="margin-top: 36px; padding-top: 24px; border-top: 2px dashed #cbd5e1;">
          <div style="font-size: 0.88rem; font-weight: 700; color: #475569; margin-bottom: 16px;">▼ 管理者用本文プレビュー（一般読者には非表示）</div>
          <div class="admin-preview-content">
            ${formatRichArticleBody(post.content || '')}
          </div>
        </div>
      `;
    }

    bodyEl.innerHTML = noticeCardHtml;
  }

  // Disable like button for scheduled teaser (keep share enabled)
  const likeBtn = document.getElementById('detail-like-btn');
  if (likeBtn) {
    likeBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  // Bottom Creator Card
  const bottomAvatar = document.getElementById('detail-bottom-avatar');
  const bottomName = document.getElementById('detail-bottom-name');
  const bottomBio = document.getElementById('detail-bottom-bio');
  if (bottomAvatar && avatarSrc) bottomAvatar.src = avatarSrc;
  if (bottomName) bottomName.textContent = siteProfile.name;
  if (bottomBio && siteProfile.bio) bottomBio.innerHTML = formatRichText(siteProfile.bio);

  // Prev / Next Navigation
  renderPrevNextNav(post);
}

window.goToFeed = function(e) {
  if (e) e.preventDefault();
  if (window.location.hash) {
    history.pushState(null, '', window.location.pathname);
  }
  showFeedView();
};

function showFeedView() {
  currentViewingPost = null;
  const feedView = document.getElementById('view-feed');
  const detailView = document.getElementById('view-detail');
  if (detailView) detailView.style.display = 'none';
  if (feedView) feedView.style.display = 'block';
  document.title = `${blogData.title} - note風ブログ`;
  renderPostsFeed();
}

function handleHashRouting() {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('post-')) {
    const postId = hash.replace(/^post-/, '');
    const post = blogData.posts.find(p => p.id === postId);
    if (post) {
      if (isPostVisible(post)) {
        showArticleDetail(post);
        return;
      }
      if (isPostScheduled(post)) {
        const hasToken = !!localStorage.getItem('gh_token');
        showScheduledArticleNotice(post, hasToken);
        return;
      }
      // Non-published draft
      const hasToken = !!localStorage.getItem('gh_token');
      if (hasToken) {
        showArticleDetail(post, true);
        return;
      }
      showToast('この記事は現在非公開（下書き）です');
    }
  }
  showFeedView();
}

/* ==========================================
   Like (スキ) Button Logic
   ========================================== */
window.toggleArticleLike = async function() {
  if (!currentViewingPost) return;
  const postId = currentViewingPost.id;
  const storageKey = `note_liked_${postId}`;
  const isLiked = localStorage.getItem(storageKey) === '1';

  const btn = document.getElementById('detail-like-btn');
  const countEl = document.getElementById('detail-like-count');

  let baseLikes = Number(currentViewingPost.likes) || 0;

  if (isLiked) {
    // Unlike
    localStorage.removeItem(storageKey);
    showToast('スキを取り消しました');
  } else {
    // Like
    localStorage.setItem(storageKey, '1');
    showToast('スキをしました！ありがとうございます！');
    triggerHeartConfetti();
    notifyLikeToDiscord(currentViewingPost);
  }

  updateDetailLikeButtonState();
  updateStatsCounts();
  renderPostsFeed();
};

function updateDetailLikeButtonState() {
  if (!currentViewingPost) return;
  const btn = document.getElementById('detail-like-btn');
  const countEl = document.getElementById('detail-like-count');
  if (!btn || !countEl) return;

  const storageKey = `note_liked_${currentViewingPost.id}`;
  const isLiked = localStorage.getItem(storageKey) === '1';
  const baseLikes = Number(currentViewingPost.likes) || 0;
  const currentCount = baseLikes + (isLiked ? 1 : 0);

  countEl.textContent = currentCount;
  btn.classList.toggle('liked', isLiked);

  const heartSvg = btn.querySelector('.note-like-heart');
  if (heartSvg) {
    heartSvg.setAttribute('fill', isLiked ? '#ea3556' : 'none');
    heartSvg.setAttribute('stroke', isLiked ? '#ea3556' : 'currentColor');
  }
}

function triggerHeartConfetti() {
  const btn = document.getElementById('detail-like-btn');
  if (!btn) return;
  btn.style.transform = 'scale(1.15)';
  setTimeout(() => {
    btn.style.transform = '';
  }, 250);
}

// Optional Discord notification for article like
function notifyLikeToDiscord(post) {
  try {
    const payload = {
      content: `ブログ記事「**${post.title}**」にスキが届きました！\nhttps://issei-desu.github.io/ichiHP/blog/#post-${post.id}`
    };
    // Send to visitor logs topic or webhook if accessible
    fetch(`https://ntfy.sh/ichihp_logs_8f4e2a9c1b7d`, {
      method: 'POST',
      body: `ブログにスキが届きました: ${post.title}`,
      headers: { 'Title': 'Blog Like' }
    }).catch(() => {});
  } catch (e) {}
}

/* ==========================================
   Share Features (X / Twitter & Copy URL)
   ========================================== */
window.shareCurrentArticleOnX = function() {
  if (!currentViewingPost) return;
  const url = window.location.href;
  const text = `${currentViewingPost.title} | ${blogData.title}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  window.open(twitterUrl, '_blank', 'noopener,noreferrer');
};

window.copyCurrentArticleLink = function() {
  const url = window.location.href;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('記事URLをコピーしました！');
    }).catch(() => fallbackCopy(url));
  } else {
    fallbackCopy(url);
  }
};

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('記事URLをコピーしました！');
  } catch (e) {
    prompt('URLをコピーしてください:', text);
  }
  document.body.removeChild(ta);
}

/* ==========================================
   Prev / Next Article Navigation
   ========================================== */
function renderPrevNextNav(currentPost) {
  const navContainer = document.getElementById('prev-next-nav');
  if (!navContainer) return;

  const published = blogData.posts.filter(isPostVisible);
  const currentIndex = published.findIndex(p => p.id === currentPost.id);

  let html = '';
  if (currentIndex > 0) {
    const prev = published[currentIndex - 1];
    html += `
      <div class="nav-post-card" onclick="openArticle('${escapeAttr(prev.id)}')">
        <span class="nav-post-dir">← 前の記事</span>
        <span class="nav-post-title">${escapeHtml(prev.title)}</span>
      </div>
    `;
  } else {
    html += `<div></div>`;
  }

  if (currentIndex >= 0 && currentIndex < published.length - 1) {
    const next = published[currentIndex + 1];
    html += `
      <div class="nav-post-card" style="text-align: right;" onclick="openArticle('${escapeAttr(next.id)}')">
        <span class="nav-post-dir">次の記事 →</span>
        <span class="nav-post-title">${escapeHtml(next.title)}</span>
      </div>
    `;
  }

  navContainer.innerHTML = html;
}

/* ==========================================
   Rich Text Formatter & Markdown Renderer
   ========================================== */
function formatRichArticleBody(str) {
  if (!str) return '';
  let html = escapeHtml(str);

  // Fenced Code Blocks (```lang ... ```)
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const l = lang ? lang.toUpperCase() : 'CODE';
    return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-block-lang">${escapeHtml(l)}</span><button type="button" class="code-copy-btn" onclick="copyCodeBlock(this)">コピー</button></div><pre class="code-block-pre"><code>${code.trim()}</code></pre></div>`;
  });

  // Inline Code (`...`)
  html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');

  // Markdown-like Headings
  html = html.replace(/^###\s*(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s*(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s*(.+)$/gm, '<h2>$1</h2>');

  // Markdown quotes & dividers
  html = html.replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---$/gm, '<hr>');

  // Markdown bullet list lines
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
      .replace(/\[font=(rounded|sans|serif|handwriting|pop|marupop|pixel)\]([\s\S]*?)\[\/font\]/gi, '<span class="font-$1">$2</span>')
      .replace(/\[size=(sm|lg|xl)\]([\s\S]*?)\[\/size\]/gi, '<span class="text-size-$1">$2</span>')
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[url=([^\s\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, url, text) => {
        const cleanUrl = url.replace(/&amp;/g, '&');
        return `<a href="${resolveAssetUrl(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="rich-link">${text || cleanUrl}</a>`;
      })
      .replace(/\[url\]([^\s\]]+)\[\/url\]/gi, (_, url) => {
        const cleanUrl = url.replace(/&amp;/g, '&');
        return `<a href="${resolveAssetUrl(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="rich-link">${cleanUrl}</a>`;
      })
      .replace(/\n?\[img=([^\]|]+)(?:\|(sm|md|lg))?\]\n?/gi, (_, src, size) => renderInlineImageHtml(src.replace(/&amp;/g, '&'), size))
      .replace(/\[hide\]([\s\S]*?)\[\/hide\]/gi, (_, inner) => {
        const uid = `b_inl_${++inlineSensitiveCounter}`;
        return `<span class="sensitive-inline-wrapper" id="inl-sens-wrap-${uid}"><button type="button" class="sensitive-inline-pill" id="inl-sens-s1-${uid}" onclick="requestInlineSensitiveUnlock('${uid}')">表示する</button><span class="sensitive-inline-revealed" id="inl-sens-open-${uid}" style="display: none;"><span id="inl-sens-body-${uid}"></span><button type="button" style="margin-left:6px; background:none; border:none; cursor:pointer; color:#888;" onclick="rehideInlineSensitive('${uid}')">✕</button></span><template id="inl-sens-tpl-${uid}">${inner}</template></span>`;
      });
    if (html === prev) break;
  }

  // Auto-linkify raw URLs
  html = autolinkRawUrls(html);

  // Convert double newlines to paragraph breaks, single newlines to <br>
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/\n/g, '<br>');

  // Clean empty tags
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<(?:h2|h3|blockquote|hr|div|figure|span class="inline-image-container)[^>]*>)/gi, '$1');
  html = html.replace(/(<\/(?:h2|h3|blockquote|div|figure|span)>)\s*<\/p>/gi, '$1');

  return html;
}

function formatRichText(str) {
  if (!str) return '';
  let html = escapeHtml(str);
  for (let i = 0; i < 6; i++) {
    const prev = html;
    html = html
      .replace(/\[color=(#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/color\]/gi, '<span style="color: $1;">$2</span>')
      .replace(/\[bg=(#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/bg\]/gi, '<span style="background-color: $1; padding: 1px 5px; border-radius: 4px;">$2</span>')
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    if (html === prev) break;
  }
  return html.replace(/\n/g, '<br>');
}

function stripRichTags(str) {
  if (!str) return '';
  return String(str)
    .replace(/\[hide\][\s\S]*?\[\/hide\]/gi, '[非表示]')
    .replace(/\[img=[^\]]+\]/gi, '[画像]')
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[(?:color|bg|font|size|h2|h3|quote)=[^\]]+\]/gi, '')
    .replace(/\[\/(?:color|bg|font|size|b|hide|url|h2|h3|quote)\]/gi, '')
    .replace(/\[(?:b|hide|url)\]/gi, '')
    .replace(/^[#>-]+\s*/gm, '')
    .replace(/\*\*/g, '');
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
        return `<a href="${escapeAttr(cleanUrl)}" target="_blank" rel="noopener noreferrer" class="rich-link">${url}</a>${suffix}`;
      });
    }
  }
  return parts.join('');
}

function renderInlineImageHtml(src, size) {
  const cleanSrc = String(src || '').trim();
  const finalSrc = resolveAssetUrl(cleanSrc);
  const sizeClass = size === 'sm' ? 'inline-img-sm' : (size === 'md' ? 'inline-img-md' : 'inline-img-lg');
  return `<span class="inline-image-container ${sizeClass}"><img src="${escapeAttr(finalSrc)}" alt="" class="inline-content-img" loading="lazy" onclick="openImageLightbox(this.src)"></span>`;
}

function resolveAssetUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  if (path.startsWith('../') || path.startsWith('/')) {
    return path;
  }
  return `../${path}`;
}

function estimateReadTime(content) {
  const plainText = stripRichTags(content || '');
  const charCount = plainText.length;
  // Japanese reading speed is typically 500-600 characters per minute
  const minutes = Math.max(1, Math.ceil(charCount / 500));
  return `${minutes}分で読めます`;
}

/* ==========================================
   Sensitive / Spoiler Inline Unlock Handlers
   ========================================== */
window.requestInlineSensitiveUnlock = function(uid) {
  const pill = document.getElementById(`inl-sens-s1-${uid}`);
  const openBox = document.getElementById(`inl-sens-open-${uid}`);
  const body = document.getElementById(`inl-sens-body-${uid}`);
  const tpl = document.getElementById(`inl-sens-tpl-${uid}`);

  if (pill && openBox && body && tpl) {
    body.innerHTML = tpl.innerHTML;
    pill.style.display = 'none';
    openBox.style.display = 'inline-flex';
  }
};

window.rehideInlineSensitive = function(uid) {
  const pill = document.getElementById(`inl-sens-s1-${uid}`);
  const openBox = document.getElementById(`inl-sens-open-${uid}`);
  const body = document.getElementById(`inl-sens-body-${uid}`);
  if (pill && openBox) {
    if (body) body.innerHTML = '';
    openBox.style.display = 'none';
    pill.style.display = 'inline-flex';
  }
};

/* ==========================================
   Image Lightbox Modal
   ========================================== */
window.openImageLightbox = function(src) {
  const modal = document.getElementById('image-lightbox-modal');
  const img = document.getElementById('lightbox-img');
  if (modal && img) {
    img.src = src;
    modal.classList.add('show');
  }
};

window.closeImageLightbox = function() {
  const modal = document.getElementById('image-lightbox-modal');
  if (modal) modal.classList.remove('show');
};

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
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;');
}

function showToast(message) {
  const toast = document.getElementById('blog-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

/* ==========================================
   Table of Contents (目次) Generator
   ========================================== */
function generateTableOfContents(bodyEl) {
  if (!bodyEl) return;
  const headings = bodyEl.querySelectorAll('h2, h3');
  if (headings.length < 2) return;

  const tocCard = document.createElement('div');
  tocCard.className = 'article-toc-box';

  let listHtml = '';
  headings.forEach((heading, idx) => {
    const id = `heading-${idx + 1}`;
    heading.id = id;
    const isH3 = heading.tagName.toLowerCase() === 'h3';
    const text = heading.textContent.trim();
    listHtml += `
      <li class="toc-item ${isH3 ? 'toc-sub' : 'toc-main'}">
        <a href="#${id}" onclick="smoothScrollToHeading(event, '${id}')">${escapeHtml(text)}</a>
      </li>
    `;
  });

  tocCard.innerHTML = `
    <div class="toc-header" onclick="toggleToc(this)">
      <span class="toc-title">目次</span>
      <span class="toc-toggle-icon">▼</span>
    </div>
    <ol class="toc-list" id="article-toc-list">
      ${listHtml}
    </ol>
  `;

  const firstHeading = headings[0];
  if (firstHeading && firstHeading.parentNode) {
    firstHeading.parentNode.insertBefore(tocCard, firstHeading);
  }
}

window.smoothScrollToHeading = function(e, id) {
  e.preventDefault();
  const el = document.getElementById(id);
  if (el) {
    const headerOffset = 70;
    const elementPosition = el.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  }
};

window.toggleToc = function(headerEl) {
  const list = headerEl.parentElement.querySelector('.toc-list');
  const icon = headerEl.querySelector('.toc-toggle-icon');
  if (list) {
    const isClosed = list.style.display === 'none';
    list.style.display = isClosed ? 'block' : 'none';
    if (icon) icon.style.transform = isClosed ? '' : 'rotate(-90deg)';
  }
};

window.copyCodeBlock = function(btn) {
  const wrapper = btn.closest('.code-block-wrapper');
  if (!wrapper) return;
  const codeEl = wrapper.querySelector('code');
  if (!codeEl) return;
  const text = codeEl.innerText || codeEl.textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'コピー完了';
      setTimeout(() => { btn.textContent = 'コピー'; }, 2000);
    });
  }
};

/* ==========================================
   Reading Progress Bar & Scroll To Top
   ========================================== */
function setupReadingProgressBar() {
  const progressBar = document.getElementById('reading-progress-bar');
  const scrollTopBtn = document.getElementById('scroll-top-btn');

  window.addEventListener('scroll', () => {
    const detailView = document.getElementById('view-detail');
    const scrollY = window.scrollY;

    // Scroll top button
    if (scrollTopBtn) {
      if (scrollY > 300) {
        scrollTopBtn.classList.add('show');
      } else {
        scrollTopBtn.classList.remove('show');
      }
    }

    // Reading progress bar
    if (progressBar) {
      if (!detailView || detailView.style.display === 'none') {
        progressBar.style.width = '0%';
        return;
      }

      const totalHeight = detailView.offsetHeight - window.innerHeight;
      if (totalHeight <= 0) {
        progressBar.style.width = '100%';
        return;
      }

      const currentScroll = scrollY - detailView.offsetTop;
      const percent = Math.min(100, Math.max(0, (currentScroll / totalHeight) * 100));
      progressBar.style.width = `${percent}%`;
    }
  }, { passive: true });
}

window.scrollToTop = function() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
