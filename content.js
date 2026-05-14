(function () {
  'use strict';

  let ownedSet = null;
  let mutationObserver = null;
  let debounceTimer = null;
  let lastUrl = location.href;

  async function init() {
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

  function findGameTiles() {
    // Strategy 1: data-machine-name tiles (most reliable — Humble uses machine
    // names as stable identifiers for products across the SPA).
    const byMachineName = collectTiles('[data-machine-name]', el => {
      // Look for a child element that is likely the title text.
      return (
        el.querySelector('p, h4, h3, [class*="name"], [class*="title"]') || el
      );
    });
    if (byMachineName.length > 0) return byMachineName;

    // Strategy 2: classic dd-image-box layout (still used on some pages).
    const byCaption = collectTiles('.dd-image-box-caption', el => el, el =>
      el.closest('.dd-image-box, .dd-image-box-plain') || el
    );
    if (byCaption.length > 0) return byCaption;

    // Strategy 3: class-name substring matches for newer React layouts.
    const classPatterns = [
      '[class*="game-name"]',
      '[class*="gameName"]',
      '[class*="item-title"]',
      '[class*="itemTitle"]',
      '[class*="product-name"]',
      '[class*="productName"]',
    ];
    for (const sel of classPatterns) {
      const tiles = collectTiles(sel, el => el, el =>
        el.closest('[class*="tile"], [class*="card"], [class*="item"], [class*="product"]') || el
      );
      if (tiles.length > 0) return tiles;
    }

    return [];
  }

  function collectTiles(containerSel, getTitleEl, getCardEl) {
    const results = [];
    const seenTexts = new Set();

    for (const el of document.querySelectorAll(containerSel)) {
      const titleEl = getTitleEl ? getTitleEl(el) : el;
      const cardEl = getCardEl ? getCardEl(el) : el;
      const text = titleEl?.textContent?.trim();

      if (!text || text.length < 2 || seenTexts.has(text)) continue;
      seenTexts.add(text);
      results.push({ titleEl, cardEl: cardEl || el, titleText: text });
    }

    return results;
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
