(function () {
  'use strict';

  let ownedAppids = null;   // Set<number>
  let ownedNames = null;    // Set<string> (normalized)
  let mutationObserver = null;
  let debounceTimer = null;
  let lastUrl = location.href;
  let loggedDiagnostics = false;

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
    const unmatched = [];

    for (const tile of tiles) {
      const { cardEl, titleText, appid } = tile;
      const normalizedTitle = normalizeTitle(titleText);
      const matchedByAppid = appid && ownedAppids.has(appid);
      const matchedByName = ownedNames.has(normalizedTitle);
      const isOwned = matchedByAppid || matchedByName;

      if (!isOwned) {
        unmatched.push({ titleText, normalizedTitle, appid });
        continue;
      }

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

    // Diagnostic: when nothing matches but tiles were found, log details so
    // the user can inspect the page DevTools console and tell us what's there.
    // Runs only on first pass per page to avoid spam.
    if (!loggedDiagnostics && tiles.length > 0 && ownedCount === 0) {
      loggedDiagnostics = true;
      console.group('[Humble Owned Overlay] No matches — diagnostics');
      console.log(`Owned: ${ownedAppids.size} appids, ${ownedNames.size} names`);
      console.log('Sample owned appids:', [...ownedAppids].slice(0, 5));
      console.log('Sample owned names:', [...ownedNames].slice(0, 5));
      console.log(`Found ${tiles.length} tiles on page`);
      console.table(unmatched.slice(0, 15));
      console.groupEnd();
    }
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
    const seenAppids = new Set();
    const seenTitles = new Set();

    for (const titleEl of candidates) {
      const text = (titleEl.textContent || '').trim();
      if (!isLikelyGameTitle(text)) continue;

      const cardEl = findCardAncestor(titleEl);
      if (!cardEl) continue;

      const appid = getAppIdFromCard(cardEl);

      // Dedup: if we've already seen this appid OR this title, skip. Humble
      // renders hidden tile clones per bundle-filter (8/6/3 items), so the
      // same game shows up multiple times in the DOM.
      if (appid && seenAppids.has(appid)) continue;
      if (seenTitles.has(text)) continue;

      if (appid) seenAppids.add(appid);
      seenTitles.add(text);
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

  // Pull the Steam appid out of any Steam link inside the card.
  // "% Positive on Steam" links typically go to steamcommunity.com/app/<id>/reviews/;
  // "Steam Deck Verified/Playable" links go to store.steampowered.com or Steam
  // Deck status pages — both include /app/<id>/ in the URL. We also accept
  // Humble redirect URLs that embed the Steam appid as a query parameter.
  function getAppIdFromCard(cardEl) {
    const links = cardEl.querySelectorAll(
      'a[href*="steampowered.com/app/"], ' +
      'a[href*="steamcommunity.com/app/"], ' +
      'a[href*="/app/"]'
    );
    for (const link of links) {
      const href = link.href || '';
      // Skip generic /app/ URLs that aren't pointed at Steam at all.
      if (!/steam(powered|community)\.com/.test(href)) continue;
      const match = href.match(/\/app\/(\d+)/);
      if (match) return parseInt(match[1], 10);
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
      loggedDiagnostics = false;
      mutationObserver?.disconnect();
      document.getElementById('hbo-counter')?.remove();
      init();
    }
  }).observe(document, { subtree: true, childList: true });

  init();
})();
