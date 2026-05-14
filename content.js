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

    // Prefer Humble's own embedded bundle JSON when present — it's an
    // authoritative list of the bundle's games with canonical human names.
    // Falls back to DOM scraping for non-bundle pages (e.g. /games storefront).
    const bundleGames = extractBundleGames();
    if (bundleGames && bundleGames.length > 0) {
      await tagFromBundleData(bundleGames);
    } else {
      tagPage();
    }

    startMutationObserver();
  }

  // ── Embedded bundle data ─────────────────────────────────────────────────

  function extractBundleGames() {
    const script = document.getElementById('webpack-bundle-page-data');
    if (!script?.textContent) return null;

    let data;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      return null;
    }

    const items = data?.bundleData?.tier_item_data;
    if (!items || typeof items !== 'object') return null;

    const games = [];
    for (const [machineName, item] of Object.entries(items)) {
      // Only include actual games (skip books, soundtracks, etc.)
      if (item.item_content_type && item.item_content_type !== 'game') continue;
      // Only games that ship via Steam.
      if (!item.platforms_and_oses?.game?.steam) continue;
      if (!item.human_name) continue;

      games.push({
        machineName,
        humanName: item.human_name,
      });
    }
    return games;
  }

  async function tagFromBundleData(games) {
    // Ask background to resolve each game name to a Steam appid via Steam's
    // storesearch API (cached). This gives us bulletproof appid matching
    // even when the user's profile is private and no names are available.
    const response = await chrome.runtime.sendMessage({
      type: 'lookupAppids',
      games: games.map(g => ({ machineName: g.machineName, name: g.humanName })),
    });
    const appidMap = response?.appids || {};

    let ownedCount = 0;
    const diagnostics = [];

    for (const game of games) {
      const appid = appidMap[game.machineName] || null;
      const normalizedName = normalizeTitle(game.humanName);
      const matchedByAppid = appid && ownedAppids.has(appid);
      const matchedByName = ownedNames.has(normalizedName);
      const isOwned = matchedByAppid || matchedByName;

      diagnostics.push({
        humanName: game.humanName,
        machineName: game.machineName,
        appid,
        matchedByAppid,
        matchedByName,
      });

      const tileEl = findTileForGame(game);
      if (isOwned) {
        ownedCount++;
        if (tileEl) injectBadge(tileEl);
      }
    }

    updateCounter(ownedCount, games.length);

    if (!loggedDiagnostics) {
      loggedDiagnostics = true;
      console.group('[Humble Owned Overlay] Bundle scan');
      console.log(`Owned set: ${ownedAppids.size} appids, ${ownedNames.size} names`);
      console.log(`Bundle games: ${games.length}, matched: ${ownedCount}`);
      console.table(diagnostics);
      if (ownedCount === 0 && games.length > 0) {
        console.warn(
          'No matches. If your Steam Game Details are private, the XML feed ' +
          "won't return names — only appids. We're using Steam's storesearch " +
          'to resolve appids per game; if those still don\'t match, your ' +
          'cached owned-set may be stale (click "Refresh from Steam" in the popup).'
        );
      }
      console.groupEnd();
    }
  }

  // Locate the DOM tile for a bundle game. Humble's tile images are named
  // like `<machineName>_storefront.jpg` or contain the machine_name, which
  // gives us a reliable hook into the DOM regardless of class-name changes.
  function findTileForGame(game) {
    const { machineName, humanName } = game;

    const img = document.querySelector(
      `img[src*="${machineName}_"], img[src*="/${machineName}."], ` +
      `img[src*="${machineName}.png"], img[src*="${machineName}.jpg"]`
    );
    if (img) {
      const card = findCardAncestor(img);
      if (card) return card;
    }

    // Fall back to title-text match.
    const headings = document.querySelectorAll(
      'h3, h4, [class*="entity-title"], [class*="game-name"], [class*="game-title"]'
    );
    for (const h of headings) {
      if (h.textContent?.trim() === humanName) {
        const card = findCardAncestor(h);
        if (card) return card;
      }
    }
    return null;
  }

  function injectBadge(cardEl) {
    if (cardEl.querySelector('.hbo-badge')) return;
    const badge = document.createElement('span');
    badge.className = 'hbo-badge';
    badge.textContent = 'Owned';
    cardEl.appendChild(badge);
    const pos = getComputedStyle(cardEl).position;
    if (pos === 'static') cardEl.style.position = 'relative';
  }

  // ── DOM tagging fallback (non-bundle pages) ──────────────────────────────

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
      injectBadge(cardEl);
    }

    updateCounter(ownedCount, tiles.length);
  }

  function findGameTiles() {
    const candidates = new Set();

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

  function getAppIdFromCard(cardEl) {
    const links = cardEl.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.href || '';
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

  // ── Observers (lazy tiles + SPA nav) ─────────────────────────────────────

  function startMutationObserver() {
    if (mutationObserver) mutationObserver.disconnect();
    mutationObserver = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const bundleGames = extractBundleGames();
        if (bundleGames && bundleGames.length > 0) {
          tagFromBundleData(bundleGames);
        } else {
          tagPage();
        }
      }, 300);
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
