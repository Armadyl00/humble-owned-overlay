(function () {
  'use strict';

  let ownedSet = null;
  let mutationObserver = null;
  let debounceTimer = null;
  let lastUrl = location.href;

  // Bundle pages have a slug after the category segment, e.g.
  // /games/some-bundle-slug. Listing pages (/games, /books, /software) and
  // unrelated pages (/, /store, /blog) must be skipped — otherwise the
  // bundle-card headings on those listings get treated as game tiles.
  function isBundlePage() {
    return /^\/(games|books|software|membership)\/[^/]+/.test(location.pathname);
  }

  async function init() {
    if (!isBundlePage()) {
      document.getElementById('hbo-counter')?.remove();
      return;
    }

    const response = await chrome.runtime.sendMessage({ type: 'getOwnedSet' });

    if (!response || response.error === 'not_configured') return;

    if (response.error) {
      console.warn('[Humble Owned Overlay]', response.error, response.message || response.hint || '');
      return;
    }

    ownedSet = new Set(response.owned);
    tagPage();
    startMutationObserver();
  }

  // ── DOM tagging ──────────────────────────────────────────────────────────

  function tagPage() {
    if (!ownedSet) return;

    const tiles = findGameTiles();
    let ownedCount = 0;

    for (const { titleEl, cardEl, titleText } of tiles) {
      const norm = normalizeTitle(titleText);
      if (ownedSet.has(norm)) {
        ownedCount++;
        if (!cardEl.querySelector('.hbo-badge')) {
          const badge = document.createElement('span');
          badge.className = 'hbo-badge';
          badge.textContent = 'Owned';
          cardEl.appendChild(badge);
          // cardEl needs relative positioning for the badge to anchor correctly;
          // force it if the element doesn't already establish a stacking context.
          const pos = getComputedStyle(cardEl).position;
          if (pos === 'static') cardEl.style.position = 'relative';
        }
      }
    }

    updateCounter(ownedCount, tiles.length);
  }

  // ── Tile discovery ───────────────────────────────────────────────────────
  //
  // Approach: find candidate title elements with targeted selectors, filter
  // out obviously-non-title text (review %, deck status, prices, tier headers),
  // then walk up the DOM from each title to find the smallest ancestor that
  // also contains an <img>. That ancestor is the visual game card; the badge
  // sits in its top-left corner.

  // Containers Humble uses for cross-promotional content alongside the
  // actual bundle (other bundles, Humble Choice promo, book/software
  // recommendations). Anything inside these must be skipped.
  const EXCLUDE_CONTAINER_SELECTOR =
    '.js-other-bundles-view, .other-bundles-view-container, ' +
    '[class*="cross-sell"], [class*="recommend"], [class*="related-bundle"]';

  function findGameTiles() {
    // Prefer scoping to the bundle's tier view when present; fall back to the
    // whole document for legacy layouts that don't expose that container.
    const scope =
      document.querySelector('.js-desktop-tiers-view') ||
      document.querySelector('.bundle-page') ||
      document;

    const candidates = new Set();

    // h3/h4 are the typical heading levels for game tiles on bundle pages.
    // h1/h2 are excluded — they tend to be bundle/tier headers.
    scope.querySelectorAll('h3, h4').forEach(el => candidates.add(el));

    // Class-name patterns used across various Humble layouts (specific
    // enough to avoid matching review-name / section-title / tier-name).
    scope.querySelectorAll(
      '[class*="entity-title"], [class*="entity-name"], ' +
      '[class*="game-name"], [class*="game-title"], ' +
      '[class*="GameName"], [class*="GameTitle"], ' +
      '[class*="item-title"], [class*="itemTitle"], ' +
      '[class*="product-name"], [class*="productName"]'
    ).forEach(el => candidates.add(el));

    // Classic dd-image-box layout (older bundle pages).
    scope.querySelectorAll('.dd-image-box-caption').forEach(el => candidates.add(el));

    const results = [];
    const seen = new Set();

    for (const titleEl of candidates) {
      // Defence-in-depth: if scope is the whole document (fallback), drop
      // anything inside a known cross-promo container.
      if (titleEl.closest(EXCLUDE_CONTAINER_SELECTOR)) continue;

      const text = (titleEl.textContent || '').trim();
      if (!isLikelyGameTitle(text)) continue;
      if (seen.has(text)) continue;

      const cardEl = findCardAncestor(titleEl);
      if (!cardEl) continue;

      seen.add(text);
      results.push({ titleEl, cardEl, titleText: text });
    }

    return results;
  }

  function isLikelyGameTitle(text) {
    if (!text || text.length < 2 || text.length > 100) return false;
    if (/^\d+%\b/.test(text)) return false;             // "94% Positive on Steam"
    if (/^steam deck\b/i.test(text)) return false;      // "Steam Deck Playable"
    if (/^pay\b/i.test(text)) return false;             // "Pay at least £8.80..."
    if (/\bitem bundle\b/i.test(text)) return false;    // "8 Item Bundle"
    if (/^[$£€]/.test(text)) return false;              // prices
    // Section headers Humble shows on bundle pages — not games.
    if (/^(bundle filters|bundle details|charity information|leaderboard|free with this purchase)$/i.test(text)) return false;
    return true;
  }

  // Walk up from the title until we find an ancestor that contains an <img>.
  // That's the visual game card; badge anchors there so it overlays the art.
  function findCardAncestor(el) {
    let current = el.parentElement;
    for (let i = 0; i < 10 && current; i++) {
      if (current.querySelector('img')) return current;
      current = current.parentElement;
    }
    return null;
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

    const label = ownedCount === 0
      ? `You own 0 / ${total} games in this bundle`
      : ownedCount === total
        ? `You own all ${total} games in this bundle`
        : `You own ${ownedCount} / ${total} games in this bundle`;

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

  // SPA URL change watcher (separate observer on document so it survives body replacement).
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      ownedSet = null;
      mutationObserver?.disconnect();
      document.getElementById('hbo-counter')?.remove();
      init();
    }
  }).observe(document, { subtree: true, childList: true });

  init();
})();
