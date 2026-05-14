(function () {
  'use strict';

  let processedUrl = null;

  async function run() {
    if (processedUrl === location.href) return;

    const games = extractBundleGames();
    if (!games || games.length === 0) return;

    // Mark this URL as handled only once extraction succeeded — otherwise
    // we'd permanently skip pages where the embedded JSON wasn't ready on
    // the first pass.
    processedUrl = location.href;

    console.log('[hbo] found', games.length, 'bundle games — checking ownership');
    document.getElementById('hbo-counter')?.remove();

    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'check',
        games: games.map(g => ({ machineName: g.machineName, name: g.humanName })),
      });
    } catch (err) {
      console.warn('[hbo] message to background failed:', err);
      return;
    }

    if (!response) {
      console.warn('[hbo] no response from background');
      return;
    }
    if (response.error) {
      console.warn('[hbo] error:', response.error);
      return;
    }

    const owned = new Set(response.ownedMachineNames || []);
    let count = 0;
    for (const game of games) {
      if (!owned.has(game.machineName)) continue;
      count++;
      const tile = findTile(game.machineName);
      if (tile) injectBadge(tile);
    }
    console.log('[hbo]', count, '/', games.length, 'owned');
    showCounter(count, games.length);
  }

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
    if (!items) return null;

    return Object.entries(items)
      .filter(([, item]) =>
        item.item_content_type === 'game' &&
        item.platforms_and_oses?.game?.steam &&
        item.human_name
      )
      .map(([machineName, item]) => ({ machineName, humanName: item.human_name }));
  }

  function findTile(machineName) {
    const img = document.querySelector(
      `img[src*="${machineName}_storefront"], img[src*="/${machineName}_"], img[src*="${machineName}.jpg"], img[src*="${machineName}.png"]`
    );
    if (!img) return null;

    let el = img.parentElement;
    for (let i = 0; i < 8 && el; i++) {
      const w = el.offsetWidth;
      if (w >= 120 && w <= 480) return el;
      el = el.parentElement;
    }
    return img.parentElement;
  }

  function injectBadge(tile) {
    if (tile.querySelector('.hbo-badge')) return;
    const badge = document.createElement('span');
    badge.className = 'hbo-badge';
    badge.textContent = 'Owned';
    tile.appendChild(badge);
    if (getComputedStyle(tile).position === 'static') {
      tile.style.position = 'relative';
    }
  }

  function showCounter(owned, total) {
    const counter = document.createElement('div');
    counter.id = 'hbo-counter';
    counter.textContent =
      owned === total
        ? `You own all ${total} games in this bundle`
        : `You own ${owned} / ${total} games in this bundle`;
    document.body.appendChild(counter);
  }

  // Re-run when the SPA URL changes. The observer fires a lot on a busy
  // page, but the URL-equality check above keeps the hot path cheap.
  new MutationObserver(() => {
    if (processedUrl !== location.href) run();
  }).observe(document, { subtree: true, childList: true });

  console.log('[hbo] content script loaded');
  run();
})();
