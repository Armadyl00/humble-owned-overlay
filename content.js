(function () {
  'use strict';

  let ownedAppids = null;   // Set<number>
  let ownedNames = null;    // Set<string> (normalized)
  let mutationObserver = null;
  let debounceTimer = null;
  let lastUrl = location.href;

  async function init() {
    const response = await chrome.runtime.sendMessage({ type: 'getOwnedSet' });

    if (!response) return;
    if (response.error === 'not_loaded') return;

    if (response.error) {
      console.warn('[Humble Owned Overlay]', response.error, response.message || response.hint || '');
      return;
    }

    ownedAppids = new Set(response.ownedAppids);
    ownedNames = new Set(response.ownedNames);
    tagPage();
    startMutationObserver();
  }

  // ── DOM tagging ──────────────────────────────────────────────────────────

  function tagPage() {
    if (!ownedAppids && !ownedNames) return;

    const tiles = findGameTiles();
    let ownedCount = 0;

    for (const { cardEl, titleText, appid } of tiles) {
      const isOwned =
        (appid && ownedAppids.has(appid)) ||
        ownedNames.has(normalizeTitle(titleText));

      if (!isOwned) continue;
      ownedCount++;

      if (!cardEl.querySelector('.hbo-badge')) {
        const badge = document.createElement('span');
        badge.className = 'hbo-badge';
        badge.textContent = 'Owned';
        cardEl.appendChild(badge);
        const pos = getComputedStyle(cardEl).position;
        if (pos === 'static') cardEl.style.position = 'relative';
      }
    }

    updateCounter(ownedCount, tiles.length);
  }

  // ── Tile discovery ───────────────────────────────────────────────────────
  //
  // Find candidate title elements with targeted selectors, filter out obvious
  // non-titles (review %, deck status, prices, tier headers), then walk up to
  // the smallest ancestor that contains an <img> — that's the visual card.
  // Within each card, look for a Steam store link to extract the appid.

  function findGameTiles() {
    const candidates = new Set();

    document.querySelectorAll('h3, h4').forEach(el => candidates.add(el));

    document.querySelectorAll(
      '[class*="entity-title"], [class*="entity-name"], ' +
      '[class*="game-name"], [class*="game-title"], ' +
      '[class*="GameName"], [class*="GameTitle"], ' +
      '[class*="item-title"], [class*="itemTitle"], ' +
      '[class*="product-name"], [class*="productName"]'
    ).forEach(el => candidates.add(el));

    document.querySelectorAll('.dd-image-box-caption').forEach(el => candidates.add(el));

    const results = [];
    const seen = new Set();

    for (const titleEl of candidates) {
      const text = (titleEl.textContent || '').trim();
      if (!isLikelyGameTitle(text)) continue;
      if (seen.has(text)) continue;

      const cardEl = findCardAncestor(titleEl);
      if (!cardEl) continue;

      const appid = getAppIdFromCard(cardEl);

      seen.add(text);
      results.push({ titleEl, cardEl, titleText: text, appid });
    }

    return results;
  }

  function isLikelyGameTitle(text) {
    if (!text || text.length < 2 || text.length > 100) return false;
    if (/^\d+%\b/.test(text)) return false;
    if (/^steam deck\b/i.test(text)) return false;
    if (/^pay\b/i.test(text)) return false;
    if (/\bitem bundle\b/i.test(text)) return false;
    if (/^[$£€]/.test(text)) return false;
    return true;
  }

  function findCardAncestor(el) {
    let current = el.parentElement;
    for (let i = 0; i < 10 && current; i++) {
      if (current.querySelector('img')) return current;
      current = current.parentElement;
    }
    return null;
  }

  // Pull the Steam appid out of any store.steampowered.com link inside the card.
  // Humble tiles for Steam keys typically include such a link (often the
  // "Steam Deck Verified" / "% Positive on Steam" link points there).
  function getAppIdFromCard(cardEl) {
    const link = cardEl.querySelector(
      'a[href*="store.steampowered.com/app/"], a[href*="//steampowered.com/app/"]'
    );
    if (!link) return null;
    const match = link.href.match(/\/app\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  // ── Counter banner ───────────────────────────────────────────────────────

  function updateCounter(ownedCount, total) {
    let counter = document.getElementById('hbo-counter');

    if (total === 0) {
      counter?.remove();
      return;
    }

    if (!counter) {
      counter = document.createElement('div');
      counter.id = 'hbo-counter';

      const anchor = document.querySelector(
        'h1, h2, [class*="bundle-name"], [class*="page-title"], [class*="bundle-title"]'
      );
      if (anchor) {
        anchor.insertAdjacentElement('afterend', counter);
      } else {
        document.body.prepend(counter);
      }
    }

    const label =
      ownedCount === 0 ? `You own 0 / ${total} games in this bundle` :
      ownedCount === total ? `You own all ${total} games in this bundle` :
      `You own ${ownedCount} / ${total} games in this bundle`;

    counter.textContent = label;
  }

  // ── MutationObserver (lazy tiles + SPA navigation) ───────────────────────

  function startMutationObserver() {
    if (mutationObserver) mutationObserver.disconnect();

    mutationObserver = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(tagPage, 300);
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      ownedAppids = null;
      ownedNames = null;
      mutationObserver?.disconnect();
      document.getElementById('hbo-counter')?.remove();
      init();
    }
  }).observe(document, { subtree: true, childList: true });

  init();
})();
