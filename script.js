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

let activeSiteData = null;

async function loadPageData() {
  // 1. If opened inside Admin Preview Modal, use live preview state
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('preview')) {
    try {
      const previewRaw = localStorage.getItem('hp_preview_data');
      if (previewRaw) {
        activeSiteData = JSON.parse(previewRaw);
        applyData(activeSiteData);
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
        activeSiteData = cached.data;
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
    if (res.ok) {
      const data = await res.json();
      activeSiteData = data;
      // Always apply fetched data to ensure fresh updates override stale localStorage cache
      applyData(data);
    }
  } catch (err) {
    console.log('Using default HTML data:', err);
  }

  // 4. Record visitor access log asynchronously
  recordVisitorLog(activeSiteData);
}

const FONT_FAMILY_MAP = {
  rounded: "'M PLUS Rounded 1c', -apple-system, BlinkMacSystemFont, sans-serif",
  sans: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif",
  serif: "'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', serif",
  handwriting: "'Yomogi', cursive, sans-serif",
  pop: "'Mochiy Pop One', sans-serif",
  marupop: "'Hachi Maru Pop', cursive, sans-serif",
  pixel: "'DotGothic16', monospace, sans-serif"
};

function getFontFamilyCss(fontKey) {
  return FONT_FAMILY_MAP[fontKey] || '';
}

function applyData(data) {
  if (!data) return;

  const { site, profile, twitter, tabs, theme } = data;

  // Apply Color & Font Theme
  if (theme) {
    applyTheme(theme);
  }

  // Site Title / Footer texts
  if (site) {
    if (site.title !== undefined && site.title !== '') {
      document.title = stripRichTags(site.title);
      const pt = document.getElementById('page-title');
      if (pt) pt.textContent = stripRichTags(site.title);
    }
    if (site.footerText !== undefined && site.footerText !== '') {
      const ft = document.getElementById('footer-text');
      if (ft) ft.innerHTML = formatRichText(site.footerText);
    }
  }

  // Profile
  if (profile) {
    const heroSection = document.querySelector('.hero-section');
    if (heroSection) {
      heroSection.style.fontFamily = getFontFamilyCss(profile.font);
    }

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
        heroTitle.innerHTML = formatRichText(profile.name);
        heroTitle.style.color = profile.nameColor || '';
        heroTitle.style.display = profile.name ? 'block' : 'none';
      }
    }

    if (profile.bio !== undefined) {
      const heroDesc = document.getElementById('hero-desc');
      if (heroDesc) {
        const bioStr = String(profile.bio);
        heroDesc.style.color = profile.bioColor || '';
        if (bioStr.trim().length > 0) {
          heroDesc.innerHTML = formatRichText(bioStr);
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
  renderLinks(resolvedLinksTitle, resolvedLinksSubtitle, resolvedLinks || [], {
    font: data.linksFont || '',
    titleColor: data.linksTitleColor || ''
  });

  // Apply Comments Section Customization
  renderCommentsSection(data.comments || {});
}

let inlineSensitiveCounter = 0;

function renderSensitiveGuard(uid, warningText, innerHtml) {
  const safeUid = escapeAttr(uid);
  const note = warningText && warningText.trim() ? warningText.trim() : '';
  return `
    <div class="sensitive-container" id="sens-wrap-${safeUid}">
      <div class="sensitive-guard-box" id="sens-guard-${safeUid}">
        ${note ? `<div class="sensitive-guard-note">${escapeHtml(note)}</div>` : ''}
        <div id="sens-step1-${safeUid}">
          <button type="button" class="sensitive-btn-step1" onclick="requestSensitiveUnlock('${safeUid}')">表示する</button>
        </div>
        <div id="sens-step2-${safeUid}" style="display: none !important;">
          <div class="sensitive-guard-note" style="color: var(--primary); font-weight: 800; margin-top: 4px;">
            本当に表示しますか？
          </div>
          <div class="sensitive-confirm-row">
            <button type="button" class="sensitive-btn-cancel" onclick="cancelSensitiveUnlock('${safeUid}')">キャンセル</button>
            <button type="button" class="sensitive-btn-confirm" id="sens-confirm-btn-${safeUid}" disabled onclick="confirmSensitiveUnlock('${safeUid}')">準備中...</button>
          </div>
        </div>
      </div>
      <div id="sens-unlocked-${safeUid}" style="display: none !important;">
        <div class="sensitive-rehide-bar">
          <button type="button" class="sensitive-btn-rehide" onclick="rehideSensitiveContent('${safeUid}')">隠す</button>
        </div>
        <div id="sens-body-${safeUid}"></div>
      </div>
      <template id="sens-tpl-${safeUid}">${innerHtml}</template>
    </div>
  `;
}

window.requestSensitiveUnlock = function(uid) {
  const step1 = document.getElementById(`sens-step1-${uid}`);
  const step2 = document.getElementById(`sens-step2-${uid}`);
  const confirmBtn = document.getElementById(`sens-confirm-btn-${uid}`);
  if (!step1 || !step2 || !confirmBtn) return;

  step1.style.setProperty('display', 'none', 'important');
  step2.style.setProperty('display', 'block', 'important');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '確認中...';

  // 500ms anti-lag / anti-double-tap guard so buffered taps or scroll lag can NEVER trigger unlock
  setTimeout(() => {
    if (document.body.contains(confirmBtn)) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'はい、表示する';
    }
  }, 500);
};

window.cancelSensitiveUnlock = function(uid) {
  const step1 = document.getElementById(`sens-step1-${uid}`);
  const step2 = document.getElementById(`sens-step2-${uid}`);
  const confirmBtn = document.getElementById(`sens-confirm-btn-${uid}`);
  if (step1) step1.style.setProperty('display', 'block', 'important');
  if (step2) step2.style.setProperty('display', 'none', 'important');
  if (confirmBtn) confirmBtn.disabled = true;
};

window.confirmSensitiveUnlock = function(uid) {
  const confirmBtn = document.getElementById(`sens-confirm-btn-${uid}`);
  if (!confirmBtn || confirmBtn.disabled) return;

  const guardBox = document.getElementById(`sens-guard-${uid}`);
  const unlockedBox = document.getElementById(`sens-unlocked-${uid}`);
  const bodyBox = document.getElementById(`sens-body-${uid}`);
  const tpl = document.getElementById(`sens-tpl-${uid}`);
  if (!guardBox || !unlockedBox || !bodyBox || !tpl) return;

  bodyBox.innerHTML = tpl.innerHTML;
  guardBox.style.setProperty('display', 'none', 'important');
  unlockedBox.style.setProperty('display', 'block', 'important');
};

window.rehideSensitiveContent = function(uid) {
  const guardBox = document.getElementById(`sens-guard-${uid}`);
  const unlockedBox = document.getElementById(`sens-unlocked-${uid}`);
  const bodyBox = document.getElementById(`sens-body-${uid}`);
  if (bodyBox) bodyBox.innerHTML = '';
  if (unlockedBox) unlockedBox.style.setProperty('display', 'none', 'important');
  if (guardBox) guardBox.style.setProperty('display', 'flex', 'important');
  window.cancelSensitiveUnlock(uid);
};

window.requestInlineSensitiveUnlock = function(uid) {
  const step1Btn = document.getElementById(`inl-sens-s1-${uid}`);
  const step2Span = document.getElementById(`inl-sens-s2-${uid}`);
  const confirmBtn = document.getElementById(`inl-sens-confirm-${uid}`);
  if (!step1Btn || !step2Span || !confirmBtn) return;

  step1Btn.style.setProperty('display', 'none', 'important');
  step2Span.style.setProperty('display', 'inline-flex', 'important');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '確認...';

  setTimeout(() => {
    if (document.body.contains(confirmBtn)) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'はい、表示する';
    }
  }, 450);
};

window.cancelInlineSensitiveUnlock = function(uid) {
  const step1Btn = document.getElementById(`inl-sens-s1-${uid}`);
  const step2Span = document.getElementById(`inl-sens-s2-${uid}`);
  const confirmBtn = document.getElementById(`inl-sens-confirm-${uid}`);
  if (step1Btn) step1Btn.style.setProperty('display', 'inline-flex', 'important');
  if (step2Span) step2Span.style.setProperty('display', 'none', 'important');
  if (confirmBtn) confirmBtn.disabled = true;
};

window.confirmInlineSensitiveUnlock = function(uid) {
  const confirmBtn = document.getElementById(`inl-sens-confirm-${uid}`);
  if (!confirmBtn || confirmBtn.disabled) return;
  const step2Span = document.getElementById(`inl-sens-s2-${uid}`);
  const unlockedSpan = document.getElementById(`inl-sens-open-${uid}`);
  const bodySpan = document.getElementById(`inl-sens-body-${uid}`);
  const tpl = document.getElementById(`inl-sens-tpl-${uid}`);
  if (!step2Span || !unlockedSpan || !bodySpan || !tpl) return;

  bodySpan.innerHTML = tpl.innerHTML;
  step2Span.style.setProperty('display', 'none', 'important');
  unlockedSpan.style.setProperty('display', 'inline', 'important');
};

window.rehideInlineSensitive = function(uid) {
  const unlockedSpan = document.getElementById(`inl-sens-open-${uid}`);
  const bodySpan = document.getElementById(`inl-sens-body-${uid}`);
  if (bodySpan) bodySpan.innerHTML = '';
  if (unlockedSpan) unlockedSpan.style.setProperty('display', 'none', 'important');
  window.cancelInlineSensitiveUnlock(uid);
};

function renderAboutItemsGrid(items, parentUid, defaultTitleColor, defaultTextColor) {
  return `
    <div class="about-grid">
      ${(items || []).map((item, itemIdx) => {
        const itemUid = `${parentUid}_item_${itemIdx}`;
        const itemFontCss = getFontFamilyCss(item.font);
        const itemStyle = itemFontCss ? `style="font-family: ${escapeAttr(itemFontCss)};"` : '';
        const labelColor = item.labelColor || defaultTitleColor || '';
        const valueColor = item.valueColor || defaultTextColor || '';
        const labelStyle = labelColor ? `style="color: ${escapeAttr(labelColor)};"` : '';
        const valueStyle = valueColor ? `style="color: ${escapeAttr(valueColor)};"` : '';

        const hasSubItems = Array.isArray(item.subItems) && item.subItems.length > 0;
        const mainValueHtml = (item.value || !hasSubItems)
          ? `<p class="about-value" ${valueStyle}>${formatRichText(item.value)}</p>`
          : '';

        const subItemsHtml = hasSubItems ? `
          <div class="about-subitems-stack">
            ${item.subItems.map((sub, subIdx) => {
              const subBody = `<p class="about-value" ${valueStyle}>${formatRichText(sub.value)}</p>`;
              return `
                <div class="about-subitem-box">
                  ${sub.label ? `<span class="about-subitem-label" ${labelStyle}>${formatRichText(sub.label)}</span>` : ''}
                  ${sub.isSensitive
                    ? renderSensitiveGuard(`${itemUid}_sub_${subIdx}`, sub.sensitiveWarning, subBody)
                    : subBody
                  }
                </div>
              `;
            }).join('')}
          </div>
        ` : '';

        const combinedBodyHtml = `${mainValueHtml}${subItemsHtml}`;

        return `
          <div class="about-item" ${itemStyle}>
            <span class="about-label" ${labelStyle}>${formatRichText(item.label)}</span>
            ${item.isSensitive
              ? renderSensitiveGuard(itemUid, item.sensitiveWarning, combinedBodyHtml)
              : combinedBodyHtml
            }
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderTabs(tabs) {
  const navContainer = document.getElementById('tabs-nav');
  const panesContainer = document.getElementById('tab-panes-container');
  if (!navContainer || !panesContainer) return;

  if (!currentActiveTabId || !tabs.find(t => t.id === currentActiveTabId)) {
    currentActiveTabId = tabs[0].id;
  }

  // 1. Render Tab Buttons
  navContainer.innerHTML = tabs.map(tab => {
    const tabFontCss = getFontFamilyCss(tab.font);
    return `
      <button type="button" 
              class="tab-btn ${tab.id === currentActiveTabId ? 'active' : ''}" 
              style="${tabFontCss ? `font-family: ${escapeAttr(tabFontCss)};` : ''}"
              onclick="switchTab('${escapeAttr(tab.id)}')">
        ${formatRichText(tab.name)}
      </button>
    `;
  }).join('');

  // 2. Render Tab Panes (Main Block + Any Vertically Stacked Blocks)
  panesContainer.innerHTML = tabs.map(tab => {
    const tabFontCss = getFontFamilyCss(tab.font);
    const paneStyleParts = [];
    if (tabFontCss) paneStyleParts.push(`font-family: ${tabFontCss}`);
    const paneStyleAttr = paneStyleParts.length ? `style="${escapeAttr(paneStyleParts.join('; '))}"` : '';
    const titleColorStyle = tab.titleColor ? `style="color: ${escapeAttr(tab.titleColor)};"` : '';

    const mainItemsGridHtml = renderAboutItemsGrid(tab.items, `tab_${tab.id}`, tab.titleColor, tab.textColor);

    const extraBlocksHtml = (tab.blocks || []).map((block, blockIdx) => {
      const blockUid = `tab_${tab.id}_blk_${blockIdx}`;
      const blkFontCss = getFontFamilyCss(block.font || tab.font);
      const blkStyleAttr = blkFontCss ? `style="font-family: ${escapeAttr(blkFontCss)};"` : '';
      const blkTitleColor = block.titleColor || tab.titleColor || '';
      const blkTextColor = block.textColor || tab.textColor || '';
      const blkTitleStyle = blkTitleColor ? `style="color: ${escapeAttr(blkTitleColor)};"` : '';
      const blkItemsGridHtml = renderAboutItemsGrid(block.items, blockUid, blkTitleColor, blkTextColor);
      const hasHeader = Boolean((block.tag && block.tag.trim()) || (block.aboutTitle && block.aboutTitle.trim()) || (block.aboutSubtitle && block.aboutSubtitle.trim()));

      return `
        <section class="section about-section tab-block-section" ${blkStyleAttr}>
          ${hasHeader ? `
            <div class="section-header">
              ${block.tag ? `<span class="section-tag">${formatRichText(block.tag)}</span>` : ''}
              ${block.aboutTitle ? `<h2 class="section-title" ${blkTitleStyle}>${formatRichText(block.aboutTitle)}</h2>` : ''}
              ${block.aboutSubtitle ? `<p class="section-subtitle" ${blkTitleStyle}>${formatRichText(block.aboutSubtitle)}</p>` : ''}
            </div>
          ` : ''}
          <div class="card about-card">
            ${block.isSensitive
              ? renderSensitiveGuard(blockUid, block.sensitiveWarning, blkItemsGridHtml)
              : blkItemsGridHtml
            }
          </div>
        </section>
      `;
    }).join('');

    return `
      <div id="tab-pane-${escapeAttr(tab.id)}" class="tab-pane ${tab.id === currentActiveTabId ? 'active' : ''}" ${paneStyleAttr}>
        <div class="tab-blocks-stack">
          <section class="section about-section" style="padding-top: 10px;">
            <div class="section-header">
              <span class="section-tag">${formatRichText(tab.name)}</span>
              ${tab.aboutTitle ? `<h2 class="section-title" ${titleColorStyle}>${formatRichText(tab.aboutTitle)}</h2>` : ''}
              ${tab.aboutSubtitle ? `<p class="section-subtitle" ${titleColorStyle}>${formatRichText(tab.aboutSubtitle)}</p>` : ''}
            </div>

            <div class="card about-card">
              ${tab.isSensitive
                ? renderSensitiveGuard(`tab_${tab.id}`, tab.sensitiveWarning, mainItemsGridHtml)
                : mainItemsGridHtml
              }
            </div>
          </section>
          ${extraBlocksHtml}
        </div>
      </div>
    `;
  }).join('');
}

function renderLinks(title, subtitle, links, linksStyle = {}) {
  const sectionEl = document.getElementById('links');
  const titleEl = document.getElementById('links-section-title');
  const subtitleEl = document.getElementById('links-section-subtitle');
  const listEl = document.getElementById('links-list');
  if (!listEl) return;

  if (sectionEl) {
    sectionEl.style.fontFamily = getFontFamilyCss(linksStyle.font);
  }

  if (titleEl) {
    titleEl.innerHTML = formatRichText(title || 'Links');
    titleEl.style.color = linksStyle.titleColor || '';
  }
  if (subtitleEl) {
    subtitleEl.innerHTML = formatRichText(subtitle || '');
    subtitleEl.style.color = linksStyle.titleColor || '';
    subtitleEl.style.display = subtitle ? 'block' : 'none';
  }

  if (Array.isArray(links) && links.length > 0) {
    listEl.innerHTML = links.map((link, linkIdx) => {
      const linkFontCss = getFontFamilyCss(link.font);
      const itemStyle = linkFontCss ? `style="font-family: ${escapeAttr(linkFontCss)};"` : '';
      const titleStyle = link.titleColor ? `style="color: ${escapeAttr(link.titleColor)};"` : '';
      const subStyle = link.subColor ? `style="color: ${escapeAttr(link.subColor)};"` : '';

      const anchorHtml = `
        <a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer" class="link-item" ${itemStyle}>
          <div class="link-icon">
            ${getIconSvg(link.icon)}
          </div>
          <div class="link-text">
            <span class="link-title" ${titleStyle}>${formatRichText(link.title)}</span>
            ${link.sub ? `<span class="link-sub" ${subStyle}>${formatRichText(link.sub)}</span>` : ''}
          </div>
          <span class="link-arrow">→</span>
        </a>
      `;

      if (link.isSensitive) {
        return `
          <div class="card" style="padding: 14px;" ${itemStyle}>
            <div style="font-size: 0.85rem; font-weight: 700; margin-bottom: 6px;" ${titleStyle}>
              ${formatRichText(link.title)}
            </div>
            ${renderSensitiveGuard(`link_${linkIdx}`, link.sensitiveWarning, anchorHtml)}
          </div>
        `;
      }
      return anchorHtml;
    }).join('');
  } else {
    listEl.innerHTML = '<div class="link-placeholder"><span>リンクがまだありません</span></div>';
  }
}

function renderCommentsSection(commentsConfig = {}) {
  const sectionEl = document.getElementById('comments-section');
  const titleEl = document.getElementById('comments-title');
  const subtitleEl = document.getElementById('comments-subtitle');
  const btnTextEl = document.getElementById('comment-btn-text');
  const bodyTextarea = document.getElementById('comment-body');

  if (!sectionEl) return;

  if (commentsConfig.font) {
    sectionEl.style.fontFamily = getFontFamilyCss(commentsConfig.font);
  } else {
    sectionEl.style.fontFamily = '';
  }

  if (titleEl) {
    const rawTitle = commentsConfig.title !== undefined && commentsConfig.title !== '' ? commentsConfig.title : 'Message / コメント 💌';
    titleEl.innerHTML = formatRichText(rawTitle);
    titleEl.style.color = commentsConfig.titleColor || '';
  }

  if (subtitleEl) {
    const rawSub = commentsConfig.subtitle !== undefined ? commentsConfig.subtitle : 'サイトを見に来た感想やひとこと、メッセージを気軽にどうぞ！';
    subtitleEl.innerHTML = formatRichText(rawSub);
    subtitleEl.style.color = commentsConfig.titleColor || '';
    subtitleEl.style.display = rawSub ? 'block' : 'none';
  }

  if (btnTextEl) {
    const rawBtn = commentsConfig.buttonText || '📨 メッセージを送る';
    btnTextEl.innerHTML = formatRichText(rawBtn);
  }

  if (bodyTextarea && commentsConfig.placeholder !== undefined) {
    bodyTextarea.placeholder = commentsConfig.placeholder;
  }
}


window.switchTab = function(tabId) {
  currentActiveTabId = tabId;

  // Auto re-lock any unlocked or half-open sensitive blocks when switching tabs
  document.querySelectorAll('.sensitive-container').forEach(el => {
    const uid = (el.id || '').replace(/^sens-wrap-/, '');
    if (uid) window.rehideSensitiveContent(uid);
  });
  document.querySelectorAll('.sensitive-inline-wrapper').forEach(el => {
    const uid = (el.id || '').replace(/^inl-sens-wrap-/, '');
    if (uid) window.rehideInlineSensitive(uid);
  });

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

let svgGradCounter = 0;

function getIconSvg(type) {
  switch (type) {
    case 'twitter':
    case 'x':
      return '<svg viewBox="0 0 24 24" fill="#1DA1F2"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>';
    case 'instagram': {
      const gid = `ig_grad_${++svgGradCounter}`;
      return `<svg viewBox="0 0 24 24"><defs><radialGradient id="${gid}" cx="30%" cy="107%" r="125%"><stop offset="0%" stop-color="#fdf497"/><stop offset="5%" stop-color="#fdf497"/><stop offset="45%" stop-color="#fd5949"/><stop offset="60%" stop-color="#d6249f"/><stop offset="90%" stop-color="#285AEB"/></radialGradient></defs><path fill="url(#${gid})" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`;
    }
    case 'youtube':
      return '<svg viewBox="0 0 24 24"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
    case 'tiktok':
      return '<svg viewBox="0 0 24 24"><path fill="#25F4EE" transform="translate(-0.8, -0.6)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.16 1.18 2.09 2.35 2.31.88.16 1.8-.02 2.53-.55.69-.51 1.1-1.32 1.14-2.18.06-3.87.03-7.74.04-11.61z"/><path fill="#FE2C55" transform="translate(0.8, 0.6)" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.16 1.18 2.09 2.35 2.31.88.16 1.8-.02 2.53-.55.69-.51 1.1-1.32 1.14-2.18.06-3.87.03-7.74.04-11.61z"/><path fill="#111111" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.16 1.18 2.09 2.35 2.31.88.16 1.8-.02 2.53-.55.69-.51 1.1-1.32 1.14-2.18.06-3.87.03-7.74.04-11.61z"/></svg>';
    case 'github':
      return '<svg viewBox="0 0 24 24" fill="#181717"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>';
    default:
      return '<svg viewBox="0 0 24 24" fill="#0284c7"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  const primary = theme.primary || '#f43f5e';
  const secondary = theme.secondary || '#8b5cf6';
  const bg = theme.bg || '#fff5f7';

  // Apply base font if selected
  const baseFontCss = getFontFamilyCss(theme.font || 'rounded');
  if (baseFontCss) {
    root.style.setProperty('--font-base', baseFontCss);
  }

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

  // Override site-wide text color if explicitly specified
  if (theme.textColor && /^#[0-9a-fA-F]{6}$/.test(theme.textColor)) {
    root.style.setProperty('--text-main', theme.textColor);
    root.style.setProperty('--text-muted', mixHex(theme.textColor, isDark ? '#0f172a' : '#ffffff', 0.25));
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

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;');
}

function stripRichTags(str) {
  if (!str) return '';
  return String(str)
    .replace(/\[hide\][\s\S]*?\[\/hide\]/gi, '[非表示]')
    .replace(/\[img=[^\]]+\]/gi, '[画像]')
    .replace(/\[(?:color|bg|font|size)=[^\]]+\]/gi, '')
    .replace(/\[\/(?:color|bg|font|size|b|hide)\]/gi, '')
    .replace(/\[(?:b|hide)\]/gi, '');
}

function renderInlineImageHtml(src, size) {
  const cleanSrc = String(src || '').trim();
  const cached = localStorage.getItem('hp_inline_cache_' + cleanSrc);
  const finalSrc = escapeAttr(cached || cleanSrc);
  const sizeClass = size === 'sm' ? 'inline-img-sm' : (size === 'md' ? 'inline-img-md' : 'inline-img-lg');
  return `<span class="inline-image-container ${sizeClass}"><img src="${finalSrc}" alt="" class="inline-content-img" loading="lazy" onclick="openImageLightbox(this.src)"></span>`;
}

function formatRichText(str) {
  if (!str) return '';
  let html = escapeHtml(str);

  for (let i = 0; i < 8; i++) {
    const prev = html;
    html = html
      .replace(/\[color=(#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/color\]/gi, '<span style="color: $1;">$2</span>')
      .replace(/\[bg=(#[0-9a-fA-F]{3,6})\]([\s\S]*?)\[\/bg\]/gi, '<span style="background-color: $1; padding: 1px 5px; border-radius: 4px;">$2</span>')
      .replace(/\[font=(rounded|sans|serif|handwriting|pop|marupop|pixel)\]([\s\S]*?)\[\/font\]/gi, '<span class="font-$1">$2</span>')
      .replace(/\[size=(sm|lg|xl)\]([\s\S]*?)\[\/size\]/gi, '<span class="text-size-$1">$2</span>')
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
      .replace(/\n?\[img=([^\]|]+)(?:\|(sm|md|lg))?\]\n?/gi, (_, src, size) => renderInlineImageHtml(src.replace(/&amp;/g, '&'), size))
      .replace(/\[hide\]([\s\S]*?)\[\/hide\]/gi, (_, inner) => {
        const uid = `inl_${++inlineSensitiveCounter}`;
        return `<span class="sensitive-inline-wrapper" id="inl-sens-wrap-${uid}"><button type="button" class="sensitive-inline-pill" id="inl-sens-s1-${uid}" onclick="event.preventDefault();event.stopPropagation();requestInlineSensitiveUnlock('${uid}')">表示する</button><span class="sensitive-inline-confirm" id="inl-sens-s2-${uid}" style="display: none !important;"><button type="button" class="sensitive-inline-btn-cancel" onclick="event.preventDefault();event.stopPropagation();cancelInlineSensitiveUnlock('${uid}')">✕</button><button type="button" class="sensitive-inline-btn-ok" id="inl-sens-confirm-${uid}" disabled onclick="event.preventDefault();event.stopPropagation();confirmInlineSensitiveUnlock('${uid}')">確認...</button></span><span class="sensitive-inline-revealed" id="inl-sens-open-${uid}" style="display: none !important;"><span id="inl-sens-body-${uid}"></span><button type="button" class="sensitive-inline-btn-rehide" onclick="event.preventDefault();event.stopPropagation();rehideInlineSensitive('${uid}')">隠す</button></span><template id="inl-sens-tpl-${uid}">${inner}</template></span>`;
      });
    if (html === prev) break;
  }

  return html.replace(/\n/g, '<br>');
}

// Lightbox Modal for Inline Images
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
  if (modal) {
    modal.classList.remove('show');
  }
};

// Visitor Access Logger (IP, Region, ISP, Device, Browser, Referrer)
const VISITOR_LOG_TOPIC = 'ichihp_logs_8f4e2a9c1b7d';

function fetchJsonWithTimeout(url, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => {
      if (ctrl) ctrl.abort();
      resolve(null);
    }, timeoutMs);
    fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        clearTimeout(timer);
        resolve(json);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

async function recordVisitorLog(data) {
  try {
    // Skip if admin opted out of logging their own device
    if (localStorage.getItem('hp_ignore_my_visits') === '1') {
      return;
    }

    // Throttle duplicate logs within 1 minute per session
    const lastLogged = Number(sessionStorage.getItem('hp_visit_logged_at') || 0);
    if (Date.now() - lastLogged < 60 * 1000) {
      return;
    }
    sessionStorage.setItem('hp_visit_logged_at', String(Date.now()));

    // Fetch Geo/IP (ipwho.is in Japanese) + IPv4 (ipify) in parallel with timeout
    const [whoRaw, v4Raw] = await Promise.all([
      fetchJsonWithTimeout('https://ipwho.is/?lang=ja', 3500),
      fetchJsonWithTimeout('https://api.ipify.org?format=json', 3500)
    ]);

    const who = (whoRaw && whoRaw.success !== false) ? whoRaw : null;
    const v4 = (v4Raw && v4Raw.ip) ? v4Raw.ip : '';

    const primaryIp = v4 || (who && who.ip) || '不明（ブロッカー等）';
    const ipv6 = (who && who.ip && who.ip !== v4) ? who.ip : '';
    const flag = (who && who.flag && who.flag.emoji) ? who.flag.emoji : '🌐';
    const locParts = [who && who.country, who && who.region, who && who.city].filter(Boolean);
    const locationStr = locParts.length > 0 ? `${flag} ${locParts.join(' / ')}` : '地域不明';
    const ispStr = (who && who.connection && (who.connection.isp || who.connection.org)) || '';

    const uaInfo = parseVisitorAgent(navigator.userAgent || '');
    const refStr = formatVisitorReferrer(document.referrer || '');

    const logEntry = {
      id: 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      time: Date.now(),
      ip: primaryIp,
      ipv6: ipv6,
      location: locationStr,
      isp: ispStr,
      device: uaInfo.device,
      browser: uaInfo.browser,
      screen: `${window.screen ? window.screen.width : 0}×${window.screen ? window.screen.height : 0}`,
      referrer: refStr
    };

    // 1. Send to cloud log stream (ntfy.sh) with keepalive
    fetch(`https://ntfy.sh/${VISITOR_LOG_TOPIC}`, {
      method: 'POST',
      body: JSON.stringify(logEntry),
      keepalive: true
    }).catch(() => {});

    // 2. Optional Discord Webhook real-time notification if configured in data.json
    const webhookUrl = data && data.site && data.site.discordWebhook;
    if (webhookUrl && webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      const embedPayload = {
        username: 'HPアクセス通知 📊',
        embeds: [{
          title: '👀 ホームページにアクセスがありました！',
          color: 0x9333ea,
          fields: [
            { name: '🌐 IPアドレス', value: `\`${primaryIp}\`${ipv6 ? `\n(IPv6: \`${ipv6}\`)` : ''}`, inline: true },
            { name: '📍 地域・回線', value: `${locationStr}${ispStr ? `\n(${ispStr})` : ''}`, inline: true },
            { name: '📱 端末・ブラウザ', value: `${uaInfo.device} / ${uaInfo.browser} (${logEntry.screen})`, inline: false },
            { name: '🔗 アクセス元', value: refStr, inline: false }
          ],
          timestamp: new Date().toISOString()
        }]
      };
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(embedPayload),
        keepalive: true
      }).catch(() => {});
    }
  } catch (e) {
    // Silently ignore logging errors so visitor experience is never affected
  }
}

function parseVisitorAgent(ua) {
  let device = '💻 PC / その他';
  if (/iPhone/i.test(ua)) {
    const m = ua.match(/OS (\d+[_\d]*)/);
    device = `📱 iPhone${m ? ' (iOS ' + m[1].replace(/_/g, '.') + ')' : ''}`;
  } else if (/iPad/i.test(ua)) {
    device = '📱 iPad';
  } else if (/Android/i.test(ua)) {
    const m = ua.match(/Android (\d+(?:\.\d+)?)/);
    device = `📱 Android${m ? ' ' + m[1] : ''}`;
  } else if (/Windows/i.test(ua)) {
    device = '💻 Windows PC';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    device = '💻 Mac';
  } else if (/Linux/i.test(ua)) {
    device = '🐧 Linux';
  }

  let browser = '標準ブラウザ';
  if (/Twitter/i.test(ua)) {
    browser = '🐦 Twitterアプリ内';
  } else if (/Instagram/i.test(ua)) {
    browser = '📸 Instagramアプリ内';
  } else if (/Line\//i.test(ua)) {
    browser = '💬 LINEアプリ内';
  } else if (/Discord/i.test(ua)) {
    browser = '🎮 Discord内';
  } else if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/CriOS|Chrome\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/FxiOS|Firefox\//i.test(ua)) {
    browser = 'Firefox';
  } else if (/Safari\//i.test(ua)) {
    browser = 'Safari';
  }

  return { device, browser };
}

function formatVisitorReferrer(ref) {
  // 1. Check URL parameters for explicit campaign / source tracking
  let paramTag = '';
  try {
    const params = new URLSearchParams(window.location.search);
    paramTag = (params.get('from') || params.get('src') || params.get('ref') || params.get('utm_source') || '').trim();
  } catch (e) {}

  let labelFromParam = '';
  if (paramTag) {
    const lower = paramTag.toLowerCase();
    if (lower === 'x' || lower === 'twitter' || lower.includes('tweet') || lower.includes('bio')) {
      labelFromParam = `🐦 X / Twitter (?from=${paramTag})`;
    } else if (lower.includes('insta') || lower === 'ig') {
      labelFromParam = `📸 Instagram (?from=${paramTag})`;
    } else if (lower.includes('line')) {
      labelFromParam = `💬 LINE (?from=${paramTag})`;
    } else if (lower.includes('discord') || lower === 'dc') {
      labelFromParam = `🎮 Discord (?from=${paramTag})`;
    } else if (lower.includes('qr')) {
      labelFromParam = `📱 QRコード (?from=${paramTag})`;
    } else if (lower.includes('youtube') || lower === 'yt') {
      labelFromParam = `▶️ YouTube (?from=${paramTag})`;
    } else if (lower.includes('tiktok') || lower === 'tt') {
      labelFromParam = `🎵 TikTok (?from=${paramTag})`;
    } else if (lower.includes('github') || lower === 'gh') {
      labelFromParam = `🐙 GitHub (?from=${paramTag})`;
    } else {
      labelFromParam = `🏷️ URLタグ (?from=${paramTag})`;
    }
  }

  // 2. Format browser document.referrer if available
  let labelFromRef = '';
  if (ref) {
    if (/t\.co|twitter\.com|x\.com/i.test(ref)) labelFromRef = `🐦 Twitter / X (${ref})`;
    else if (/instagram\.com/i.test(ref)) labelFromRef = `📸 Instagram (${ref})`;
    else if (/google\./i.test(ref)) labelFromRef = `🔍 Google検索 (${ref})`;
    else if (/yahoo\./i.test(ref)) labelFromRef = `🔍 Yahoo!検索 (${ref})`;
    else if (/line\./i.test(ref)) labelFromRef = `💬 LINE (${ref})`;
    else if (/discord/i.test(ref)) labelFromRef = `🎮 Discord (${ref})`;
    else labelFromRef = ref;
  }

  // 3. Combine both signals
  if (labelFromParam && labelFromRef) {
    return `${labelFromParam} 【参照元: ${labelFromRef}】`;
  }
  if (labelFromParam) {
    return labelFromParam;
  }
  if (labelFromRef) {
    return labelFromRef;
  }
  return '直接アクセス / ブックマーク';
}

// ==========================================
// Visitor Message / Comment Submission
// ==========================================
async function submitVisitorComment(e) {
  if (e) e.preventDefault();

  const nameInput = document.getElementById('comment-name');
  const bodyInput = document.getElementById('comment-body');
  const submitBtn = document.getElementById('comment-submit-btn');
  const btnText = document.getElementById('comment-btn-text');
  const spinner = document.getElementById('comment-btn-spinner');
  const statusEl = document.getElementById('comment-status-msg');

  const senderName = (nameInput?.value || '').trim() || '名無しさん';
  const commentText = (bodyInput?.value || '').trim();

  if (!commentText) {
    if (statusEl) {
      statusEl.className = 'comment-status-msg error';
      statusEl.textContent = '⚠️ メッセージを入力してください';
      statusEl.style.display = 'block';
    }
    return;
  }

  // Throttle duplicate comments (15 seconds)
  const lastSubmitted = Number(sessionStorage.getItem('hp_last_comment_time') || 0);
  if (Date.now() - lastSubmitted < 15000) {
    if (statusEl) {
      statusEl.className = 'comment-status-msg error';
      statusEl.textContent = '⏳ 送信直後です。少し時間を置いてから送ってください';
      statusEl.style.display = 'block';
    }
    return;
  }

  // Determine webhook URL: prioritize discordCommentWebhook, fallback to discordWebhook
  const site = activeSiteData?.site || {};
  const commentWebhook = site.discordCommentWebhook || site.discordWebhook;

  if (!commentWebhook || !commentWebhook.startsWith('https://discord.com/api/webhooks/')) {
    if (statusEl) {
      statusEl.className = 'comment-status-msg error';
      statusEl.textContent = '⚠️ コメント通知先のDiscord Webhookがまだ設定されていません（管理画面で設定してください）';
      statusEl.style.display = 'block';
    }
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.textContent = '送信中...';
  if (spinner) spinner.style.display = 'inline-block';
  if (statusEl) statusEl.style.display = 'none';

  try {
    const uaInfo = parseVisitorAgent(navigator.userAgent || '');
    const refStr = formatVisitorReferrer(document.referrer || '');

    const discordPayload = {
      username: 'HP訪問者メッセージ 💌',
      embeds: [{
        title: `💬 ${senderName} さんからメッセージが届きました！`,
        description: commentText,
        color: 0xec4899,
        fields: [
          { name: '👤 送信者名', value: senderName, inline: true },
          { name: '📱 端末・環境', value: `${uaInfo.device} / ${uaInfo.browser}`, inline: true },
          { name: '🔗 アクセス元', value: refStr, inline: false }
        ],
        timestamp: new Date().toISOString()
      }]
    };

    const res = await fetch(commentWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload)
    });

    if (res.ok || res.status === 204) {
      sessionStorage.setItem('hp_last_comment_time', String(Date.now()));
      if (bodyInput) bodyInput.value = '';
      if (statusEl) {
        statusEl.className = 'comment-status-msg success';
        statusEl.innerHTML = '✨ メッセージを送信しました！ありがとうございます🥰';
        statusEl.style.display = 'block';
      }
    } else {
      throw new Error(`送信エラー: ${res.status}`);
    }
  } catch (err) {
    if (statusEl) {
      statusEl.className = 'comment-status-msg error';
      statusEl.textContent = '❌ 送信に失敗しました。時間をおいて再度お試しください';
      statusEl.style.display = 'block';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (btnText) btnText.textContent = '📨 メッセージを送る';
    if (spinner) spinner.style.display = 'none';
  }
}



