(function () {
  'use strict';

  let debounceTimer = null;

  function isChoicePage() {
    return /^\/membership(?:\/|$)/.test(location.pathname);
  }

  function scheduleBadgePositioning() {
    clearTimeout(debounceTimer);
    if (!isChoicePage()) return;
    debounceTimer = setTimeout(positionChoiceOwnedBadges, 100);
  }

  function positionChoiceOwnedBadges() {
    if (!isChoicePage()) return;

    document.querySelectorAll('.hbo-badge').forEach(badge => {
      const cardEl = badge.parentElement;
      if (!cardEl) return;

      const claimedBadge = findClaimedBadge(cardEl);
      badge.classList.toggle('hbo-badge-below-claimed', !!claimedBadge);
      if (!claimedBadge) {
        badge.style.removeProperty('top');
        badge.style.removeProperty('left');
        return;
      }

      const cardRect = cardEl.getBoundingClientRect();
      const claimedRect = claimedBadge.getBoundingClientRect();
      if (!cardRect.width || !claimedRect.width || !claimedRect.height) return;

      const top = Math.max(6, Math.round(claimedRect.bottom - cardRect.top + 4));
      const left = Math.max(6, Math.round(claimedRect.left - cardRect.left));

      if (badge.style.top !== `${top}px`) badge.style.top = `${top}px`;
      if (badge.style.left !== `${left}px`) badge.style.left = `${left}px`;
    });
  }

  function findClaimedBadge(cardEl) {
    return Array.from(cardEl.querySelectorAll('*')).find(el => {
      if (el.classList?.contains('hbo-badge')) return false;

      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text !== 'claimed') return false;

      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || null;
  }

  scheduleBadgePositioning();
  window.addEventListener('resize', scheduleBadgePositioning);
  new MutationObserver(scheduleBadgePositioning).observe(document, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class']
  });
})();
