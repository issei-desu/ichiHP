// Dynamic data loader and tab interaction
let currentActiveTabId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Smooth scroll
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }
    });
  });

  loadPageData();
});

async function loadPageData() {
  // 1. If opened inside Admin Preview Modal, use live preview state
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('preview')) {
    try {
      const previewRaw = localStorage.getItem('hp_preview_data');
      if (previewRaw) {
        applyData(JSON.parse(previewRaw));
        return;
      }
    } catch (e) {
      console.warn('Preview data parse error:', e);
    }
  }

  // 2. Check if admin recently saved data (within 3 minutes) to bypass GitHub Pages CDN delay
  let appliedRecentCache = false;
  try {
    const cachedRaw = localStorage.getItem('hp_latest_data');
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (cached && cached.savedAt && (Date.now() - cached.savedAt < 180000) && cached.data) {
        applyData(cached.data);
        appliedRecentCache = true;
      }
    }
  } catch (e) {
    console.warn('Recent cache read error:', e);
  }

  // 3. Fetch data.json with no-store to avoid browser cache
  try {
    const res = await fetch(`data.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (!appliedRecentCache) {
      applyData(data);
    }
  } catch (err) {
    console.log('Using default HTML data:', err);
  }
}

function applyData(data) {
  if (!data) return;

  const { site, profile, twitter, tabs, theme } = data;

  // Apply Color Theme
  if (theme) {
    applyTheme(theme);
  }

  // Site Title / Footer texts
  if (site) {
    if (site.title !== undefined && site.title !== '') {
      document.title = site.title;
      const pt = document.getElementById('page-title');
      if (pt) pt.textContent = site.title;
    }
    if (site.footerText !== undefined && site.footerText !== '') {
      const ft = document.getElementById('footer-text');
      if (ft) ft.textContent = site.footerText;
    }
  }

  // Profile
  if (profile) {
    const heroAvatarImg = document.getElementById('hero-avatar-img');
    const heroAvatarPlaceholder = document.getElementById('hero-avatar-placeholder');

    if (profile.avatar) {
      if (heroAvatarImg) {
        heroAvatarImg.src = profile.avatar;
        heroAvatarImg.style.display = 'block';
      }
      if (heroAvatarPlaceholder) heroAvatarPlaceholder.style.display = 'none';
    } else {
      if (heroAvatarImg) heroAvatarImg.style.display = 'none';
      if (heroAvatarPlaceholder) heroAvatarPlaceholder.style.display = 'flex';
    }

    if (profile.name !== undefined) {
      const heroTitle = document.getElementById('hero-title');
      if (heroTitle) {
        heroTitle.textContent = profile.name;
        heroTitle.style.display = profile.name ? 'block' : 'none';
      }
    }

    if (profile.bio !== undefined) {
      const heroDesc = document.getElementById('hero-desc');
      if (heroDesc) {
        const bioStr = String(profile.bio);
        if (bioStr.trim().length > 0) {
          heroDesc.innerHTML = escapeHtml(bioStr).replace(/\n/g, '<br>');
          heroDesc.style.display = 'block';
        } else {
          heroDesc.innerHTML = '';
          heroDesc.style.display = 'none';
        }
      }
    }
  }

  // Twitter Button
  if (twitter) {
    const username = (twitter.username || '').replace(/^@/, '');
    const heroXBtn = document.getElementById('hero-x-btn');
    const heroXBtnText = document.getElementById('hero-x-btn-text');
    if (username) {
      const xUrl = `https://x.com/${username}`;
      if (heroXBtn) {
        heroXBtn.href = xUrl;
        heroXBtn.style.display = 'inline-flex';
      }
      if (heroXBtnText) heroXBtnText.textContent = `Twitter (@${username})`;
    } else if (heroXBtn) {
      heroXBtn.style.display = 'none';
    }
  }

  // Render Tabs
  let resolvedTabs = tabs;
  if (!Array.isArray(resolvedTabs) || resolvedTabs.length === 0) {
    resolvedTabs = [
      {
        id: 'real',
        name: 'リアル・日常 🌿',
        aboutTitle: 'About Me（リアル）',
        aboutSubtitle: '日常やリアルの自己紹介',
        items: [
          { label: 'お名前 / 呼び名', value: (profile && profile.name) || 'いち' },
          { label: '好きなこと / 趣味', value: 'こんな感じのページを作ったりしてます。AIで作ってる部分が結構あったりします。' },
          { label: 'ひとこと', value: '気ままにのんびりやってます。仲良くしてください✨' }
        ]
      },
      {
        id: 'oshi',
        name: '推し活 🎀',
        aboutTitle: 'My Favorite（推しについて）',
        aboutSubtitle: '推しへの愛や活動情報',
        items: [
          { label: '最推し / 担当', value: '（ここに推しの名前を入力！）' },
          { label: '推し歴 / きっかけ', value: '（推し始めた時期やきっかけ）' },
          { label: '推しへのひとこと', value: 'いつも元気をくれてありがとう！一生推します✨' }
        ]
      }
    ];
  }
  renderTabs(resolvedTabs);

  // Render Unified Links Section (with fallback if links were stored in tabs)
  let resolvedLinks = Array.isArray(data.links) ? data.links : null;
  if (!resolvedLinks && Array.isArray(tabs)) {
    resolvedLinks = [];
    tabs.forEach(tab => {
      if (Array.isArray(tab.links)) {
        resolvedLinks.push(...tab.links);
      }
    });
  }
  const tabWithTitle = Array.isArray(tabs) ? tabs.find(t => t.linksTitle !== undefined) : null;
  const tabWithSubtitle = Array.isArray(tabs) ? tabs.find(t => t.linksSubtitle !== undefined) : null;
  const resolvedLinksTitle = data.linksTitle !== undefined ? data.linksTitle : (tabWithTitle ? tabWithTitle.linksTitle : 'Links');
  const resolvedLinksSubtitle = data.linksSubtitle !== undefined ? data.linksSubtitle : (tabWithSubtitle ? tabWithSubtitle.linksSubtitle : '関連リンク');
  renderLinks(resolvedLinksTitle, resolvedLinksSubtitle, resolvedLinks || []);
}

function renderTabs(tabs) {
  const navContainer = document.getElementById('tabs-nav');
  const panesContainer = document.getElementById('tab-panes-container');
  if (!navContainer || !panesContainer) return;

  if (!currentActiveTabId || !tabs.find(t => t.id === currentActiveTabId)) {
    currentActiveTabId = tabs[0].id;
  }

  // 1. Render Tab Buttons
  navContainer.innerHTML = tabs.map(tab => `
    <button type="button" 
            class="tab-btn ${tab.id === currentActiveTabId ? 'active' : ''}" 
            onclick="switchTab('${escapeHtml(tab.id)}')">
      ${escapeHtml(tab.name)}
    </button>
  `).join('');

  // 2. Render Tab Panes (About Section only)
  panesContainer.innerHTML = tabs.map(tab => `
    <div id="tab-pane-${escapeHtml(tab.id)}" class="tab-pane ${tab.id === currentActiveTabId ? 'active' : ''}">
      <section class="section about-section" style="padding-top: 10px;">
        <div class="section-header">
          <span class="section-tag">${escapeHtml(tab.name)}</span>
          <h2 class="section-title">${escapeHtml(tab.aboutTitle || 'About Me')}</h2>
          ${tab.aboutSubtitle ? `<p class="section-subtitle">${escapeHtml(tab.aboutSubtitle)}</p>` : ''}
        </div>

        <div class="card about-card">
          <div class="about-grid">
            ${(tab.items || []).map(item => `
              <div class="about-item">
                <span class="about-label">${escapeHtml(item.label)}</span>
                <p class="about-value">${escapeHtml(item.value).replace(/\n/g, '<br>')}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    </div>
  `).join('');
}

function renderLinks(title, subtitle, links) {
  const titleEl = document.getElementById('links-section-title');
  const subtitleEl = document.getElementById('links-section-subtitle');
  const listEl = document.getElementById('links-list');
  if (!listEl) return;

  if (titleEl) titleEl.textContent = title || 'Links';
  if (subtitleEl) {
    subtitleEl.textContent = subtitle || '';
    subtitleEl.style.display = subtitle ? 'block' : 'none';
  }

  if (Array.isArray(links) && links.length > 0) {
    listEl.innerHTML = links.map(link => `
      <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="link-item">
        <div class="link-icon">
          ${getIconSvg(link.icon)}
        </div>
        <div class="link-text">
          <span class="link-title">${escapeHtml(link.title)}</span>
          ${link.sub ? `<span class="link-sub">${escapeHtml(link.sub)}</span>` : ''}
        </div>
        <span class="link-arrow">→</span>
      </a>
    `).join('');
  } else {
    listEl.innerHTML = '<div class="link-placeholder"><span>リンクがまだありません</span></div>';
  }
}

window.switchTab = function(tabId) {
  currentActiveTabId = tabId;

  // Update Buttons
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${tabId}'`));
  });

  // Update Panes
  const panes = document.querySelectorAll('.tab-pane');
  panes.forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-pane-${tabId}`);
  });
};

function getIconSvg(type) {
  switch (type) {
    case 'twitter':
    case 'x':
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>';
    case 'instagram':
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>';
    case 'youtube':
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
    case 'tiktok':
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.16 1.18 2.09 2.35 2.31.88.16 1.8-.02 2.53-.55.69-.51 1.1-1.32 1.14-2.18.06-3.87.03-7.74.04-11.61z"/></svg>';
    case 'github':
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>';
    default:
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  const primary = theme.primary || '#f43f5e';
  const secondary = theme.secondary || '#8b5cf6';
  const bg = theme.bg || '#fff5f7';

  const pRgb = hexToRgb(primary) || { r: 244, g: 63, b: 94 };
  const sRgb = hexToRgb(secondary) || { r: 139, g: 92, b: 246 };
  const bgRgb = hexToRgb(bg) || { r: 255, g: 245, b: 247 };

  const luminance = (0.299 * bgRgb.r + 0.587 * bgRgb.g + 0.114 * bgRgb.b) / 255;
  const isDark = luminance < 0.45;

  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-hover', mixHex(primary, '#000000', 0.12));
  root.style.setProperty('--primary-glow', `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.25)`);
  root.style.setProperty('--primary-gradient-end', mixHex(primary, secondary, 0.35));
  root.style.setProperty('--secondary', secondary);
  root.style.setProperty('--avatar-ring-gradient', `linear-gradient(135deg, ${primary}, ${secondary}, ${mixHex(primary, '#ffffff', 0.25)})`);
  root.style.setProperty('--shadow-lg', `0 12px 32px rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, ${isDark ? 0.28 : 0.15})`);

  if (isDark) {
    const cardBg = mixHex(bg, '#ffffff', 0.08);
    const cardSubtle = mixHex(bg, '#ffffff', 0.04);
    const midBg = mixHex(bg, primary, 0.12);
    root.style.setProperty('--bg-base', bg);
    root.style.setProperty('--bg-gradient', `linear-gradient(180deg, ${bg} 0%, ${midBg} 50%, ${bg} 100%)`);
    root.style.setProperty('--bg-card', cardBg);
    root.style.setProperty('--bg-card-subtle', cardSubtle);
    root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.12)');
    root.style.setProperty('--item-divider', 'rgba(255, 255, 255, 0.08)');
    root.style.setProperty('--text-main', '#f8fafc');
    root.style.setProperty('--text-muted', '#cbd5e1');
    root.style.setProperty('--text-light', '#64748b');
    root.style.setProperty('--primary-light', `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.2)`);
    root.style.setProperty('--secondary-light', `rgba(${sRgb.r}, ${sRgb.g}, ${sRgb.b}, 0.2)`);
    root.style.setProperty('--blob-1', `rgba(${pRgb.r}, ${pRgb.g}, ${pRgb.b}, 0.28)`);
    root.style.setProperty('--blob-2', `rgba(${sRgb.r}, ${sRgb.g}, ${sRgb.b}, 0.28)`);
    root.style.setProperty('--tabs-nav-bg', 'rgba(255, 255, 255, 0.08)');
    root.style.setProperty('--tabs-nav-border', 'rgba(255, 255, 255, 0.14)');
  } else {
    const midBg = mixHex(bg, '#ffffff', 0.35);
    const endBg = mixHex(bg, '#f8fafc', 0.75);
    root.style.setProperty('--bg-base', endBg);
    root.style.setProperty('--bg-gradient', `linear-gradient(180deg, ${bg} 0%, ${midBg} 40%, ${endBg} 100%)`);
    root.style.setProperty('--bg-card', '#ffffff');
    root.style.setProperty('--bg-card-subtle', '#f9fafb');
    root.style.setProperty('--border-color', 'rgba(226, 232, 240, 0.85)');
    root.style.setProperty('--item-divider', '#f1f5f9');
    root.style.setProperty('--text-main', '#1e293b');
    root.style.setProperty('--text-muted', '#64748b');
    root.style.setProperty('--text-light', '#94a3b8');
    root.style.setProperty('--primary-light', mixHex(primary, '#ffffff', 0.9));
    root.style.setProperty('--secondary-light', mixHex(secondary, '#ffffff', 0.9));
    root.style.setProperty('--blob-1', mixHex(primary, '#ffffff', 0.72));
    root.style.setProperty('--blob-2', mixHex(secondary, '#ffffff', 0.75));
    root.style.setProperty('--tabs-nav-bg', 'rgba(226, 232, 240, 0.6)');
    root.style.setProperty('--tabs-nav-border', 'rgba(255, 255, 255, 0.6)');
  }
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16)
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.substring(0, 2), 16),
      g: parseInt(clean.substring(2, 4), 16),
      b: parseInt(clean.substring(4, 6), 16)
    };
  }
  return null;
}

function mixHex(hex1, hex2, weight2) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return hex1;
  const w1 = 1 - weight2;
  const r = Math.round(c1.r * w1 + c2.r * weight2);
  const g = Math.round(c1.g * w1 + c2.g * weight2);
  const b = Math.round(c1.b * w1 + c2.b * weight2);
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
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
