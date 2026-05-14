(function () {
  'use strict';

  let processedUrl = null;

  async function run() {
    if (processedUrl === location.href) return;
    processedUrl = location.href;

    document.getElementById('hbo-counter')?.remove();

    const games = extractBundleGames();
    if (!games || games.length === 0) return;

    const response = await chrome.runtime.sendMessage({
      type: 'check',
      games: games.map(g => ({ machineName: g.machineName, name: g.humanName })),
    });

    if (!response) return;
    if (response.error) {
      console.warn('[Humble Owned Overlay]', response.error);
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

  // Humble's tile images are named like `<machineName>_storefront.jpg`. Find
  // the image, then climb to the smallest sensibly-sized card ancestor.
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

  // Re-run when the user navigates between bundles in the SPA.
  new MutationObserver(() => {
    if (processedUrl !== location.href) run();
  }).observe(document, { subtree: true, childList: true });

  run();
})();
