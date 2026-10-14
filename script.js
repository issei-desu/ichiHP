// Dynamic data loader and interactions
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

  // Load data.json
  loadPageData();
});

async function loadPageData() {
  try {
    const res = await fetch(`data.json?t=${Date.now()}`);
    if (!res.ok) return;
    const data = await res.json();
    applyData(data);
  } catch (err) {
    console.log('Using default HTML data:', err);
  }
}

function applyData(data) {
  if (!data) return;

  const { profile, twitter, links } = data;

  if (profile) {
    if (profile.name) {
      const navName = document.getElementById('nav-name');
      const heroTitle = document.getElementById('hero-title');
      const cardName = document.getElementById('card-name');
      const footerName = document.getElementById('footer-name');
      if (navName) navName.textContent = profile.name;
      if (heroTitle) heroTitle.textContent = profile.name;
      if (cardName) cardName.textContent = profile.name;
      if (footerName) footerName.textContent = profile.name;
    }
    if (profile.handle) {
      const heroHandle = document.getElementById('hero-handle');
      const cardHandle = document.getElementById('card-handle');
      if (heroHandle) heroHandle.textContent = profile.handle;
      if (cardHandle) cardHandle.textContent = profile.handle;
    }
    if (profile.bio) {
      const heroDesc = document.getElementById('hero-desc');
      if (heroDesc) {
        heroDesc.innerHTML = escapeHtml(profile.bio).replace(/\n/g, '<br>');
      }
    }
    if (profile.cardBio) {
      const cardBio = document.getElementById('card-bio');
      if (cardBio) {
        cardBio.innerHTML = escapeHtml(profile.cardBio).replace(/\n/g, '<br>');
      }
    }
    if (profile.about) {
      const aboutName = document.getElementById('about-name');
      const aboutHobby = document.getElementById('about-hobby');
      const aboutMessage = document.getElementById('about-message');
      if (aboutName && profile.about.name) aboutName.textContent = profile.about.name;
      if (aboutHobby && profile.about.hobby) aboutHobby.textContent = profile.about.hobby;
      if (aboutMessage && profile.about.message) aboutMessage.textContent = profile.about.message;
    }
  }

  if (twitter) {
    const username = (twitter.username || '').replace(/^@/, '');
    if (username) {
      const heroXBtn = document.getElementById('hero-x-btn');
      const heroXBtnText = document.getElementById('hero-x-btn-text');
      const cardXLink = document.getElementById('card-x-link');
      
      const xUrl = `https://x.com/${username}`;
      if (heroXBtn) heroXBtn.href = xUrl;
      if (heroXBtnText) heroXBtnText.textContent = `X (@${username}) を見に行く`;
      if (cardXLink) cardXLink.href = xUrl;
    }

    const timelineWrapper = document.getElementById('timeline-card-wrapper');
    if (timelineWrapper) {
      timelineWrapper.style.display = twitter.showTimeline === false ? 'none' : 'block';
    }
  }

  if (Array.isArray(links)) {
    renderLinks(links);
  }
}

function getIconSvg(type) {
  switch (type) {
    case 'twitter':
    case 'x':
      return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
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

function renderLinks(links) {
  const container = document.getElementById('links-container');
  if (!container) return;

  if (links.length === 0) {
    container.innerHTML = '<div class="link-placeholder"><span>リンクがまだありません</span></div>';
    return;
  }

  container.innerHTML = links.map(link => `
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
