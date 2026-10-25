(function () {
  'use strict';

  let ownedSet = null;
  let mutationObserver = null;
  let debounceTimer = null;
  let lastUrl = location.href;
  let initVersion = 0;
  let observedBody = null;

  // Game bundle pages have a slug after /games, e.g. /games/some-bundle-slug.
  // Listing pages (/games) and non-game bundle categories (/books, /software)
  // are skipped because this extension only checks Steam game ownership.
  function isBundlePage() {
    return /^\/games\/[^/]+/.test(location.pathname);
  }

  function isChoicePage() {
    return /^\/membership(?:\/|$)/.test(location.pathname);
  }

  function getPageKind() {
    if (isChoicePage()) return 'choice';
    if (isBundlePage()) return 'bundle';
    return null;
  }

  async function init() {
    const version = ++initVersion;
    const url = location.href;
    const pageKind = getPageKind();
    if (!pageKind) {
      cleanupOverlay();
      return;
    }

    let response;
    try {
      response = await chrome.runtime.sendMessage({ type: 'getOwnedSet' });
    } catch {
      console.warn('[Humble Owned Overlay] Could not load the saved Steam library. Try reloading the extension.');
      return;
    }
    if (version !== initVersion || location.href !== url) return;

    if (!response || response.error === 'not_configured') return;

    if (response.error) {
      console.warn('[Humble Owned Overlay]', response.error, response.message || response.hint || '');
      return;
    }

    if (!Array.isArray(response.owned)) return;
    ownedSet = new Set(response.owned.filter(title => typeof title === 'string' && title));
    tagPage();
    startMutationObserver();
  }

  // -- DOM tagging -----------------------------------------------------------

  function tagPage() {
    if (!ownedSet) return;

    const pageKind = getPageKind();
    if (!pageKind) {
      cleanupOverlay();
      return;
    }

    const tiles = pageKind === 'choice' ? findChoiceTiles() : findBundleTiles();
    const titles = new Set();
    const ownedTitles = new Set();
    const ownedCards = new Set();

    for (const { cardEl, titleText } of tiles) {
      titles.add(titleText);
      const norm = normalizeTitle(titleText);
      if (norm && ownedSet.has(norm)) {
        ownedTitles.add(titleText);
        ownedCards.add(cardEl);
        if (!cardEl.querySelector('.hbo-badge')) {
          const badge = document.createElement('span');
          badge.className = pageKind === 'choice' && hasClaimedBadge(cardEl)
            ? 'hbo-badge hbo-badge-below-claimed'
            : 'hbo-badge';
          badge.textContent = 'Owned';
          cardEl.appendChild(badge);
          // cardEl needs relative positioning for the badge to anchor correctly;
          // force it if the element doesn't already establish a stacking context.
          const pos = getComputedStyle(cardEl).position;
          if (pos === 'static') cardEl.style.position = 'relative';
        }
        cardEl.querySelector('.hbo-badge').classList.toggle(
          'hbo-badge-below-claimed', pageKind === 'choice' && hasClaimedBadge(cardEl)
        );
      }
    }

    document.querySelectorAll('.hbo-badge').forEach(badge => {
      if (!ownedCards.has(badge.parentElement)) badge.remove();
    });

    updateCounter(ownedTitles.size, titles.size, pageKind);
  }

  function cleanupOverlay() {
    document.getElementById('hbo-counter-row')?.remove();
    document.getElementById('hbo-counter')?.remove();
    cleanupBadges();
  }

  function cleanupBadges() {
    document.querySelectorAll('.hbo-badge').forEach(badge => badge.remove());
  }

  function hasClaimedBadge(cardEl) {
    return /\bclaimed\b/i.test(cardEl.textContent || '');
  }

  // -- Bundle tile discovery ------------------------------------------------
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

  function findBundleTiles() {
    // Prefer scoping to the bundle's tier view when present; fall back to the
    // whole document for legacy layouts that don't expose that container.
    const scopes = [document.querySelector('.js-desktop-tiers-view'), document.querySelector('.js-mobile-tiers-view')]
      .filter(el => el?.childElementCount);
    const scope = scopes.find(el => el.getClientRects().length) || scopes[0] ||
      document.querySelector('.bundle-page') ||
      document;

    const candidates = new Set();

    // h3/h4 are the typical heading levels for game tiles on bundle pages.
    // h1/h2 are excluded - they tend to be bundle/tier headers.
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
    const seen = new Map();

    for (const titleEl of candidates) {
      // Defence-in-depth: if scope is the whole document (fallback), drop
      // anything inside a known cross-promo container.
      if (titleEl.closest(EXCLUDE_CONTAINER_SELECTOR)) continue;

      const text = (titleEl.textContent || '').trim();
      if (!isLikelyGameTitle(text)) continue;
      const cardEl = findCardAncestor(titleEl);
      if (!cardEl) continue;
      if (seen.get(cardEl)?.has(text)) continue;

      if (!seen.has(cardEl)) seen.set(cardEl, new Set());
      seen.get(cardEl).add(text);
      results.push({ titleEl, cardEl, titleText: text });
    }

    return results;
  }

  function isLikelyGameTitle(text) {
    if (!text || text.length < 2 || text.length > 100) return false;
    if (/^\d+%(?:\s|$)/.test(text)) return false;       // "94% Positive on Steam"
    if (/^steam deck\b/i.test(text)) return false;      // "Steam Deck Playable"
    if (/^steam$/i.test(text)) return false;
    if (/^claimed$/i.test(text)) return false;
    if (/^redeemed\b/i.test(text)) return false;
    if (/^pay\b/i.test(text)) return false;             // "Pay at least £8.80..."
    if (/\bitem bundle\b/i.test(text)) return false;    // "8 Item Bundle"
    if (/\bplaytest\b/i.test(text)) return false;
    if (/^[$£€]/.test(text)) return false;              // prices
    // Section headers Humble shows on bundle pages - not games.
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

  // -- Humble Choice discovery ---------------------------------------------

  function findChoiceTiles() {
    const results = [];
    const seen = new Set();

    document.querySelectorAll('.js-discover-game-slide').forEach(slide => {
      const dataEl = slide.querySelector('[data-machine-name][data-content-choice-data]');
      if (!dataEl) return;

      const choiceData = parseJsonAttribute(dataEl, 'contentChoiceData');
      const machineName = dataEl.dataset.machineName;
      const choice = choiceData?.[machineName];
      if (!isTrackableChoiceItem(choice)) return;

      const titleText = choice.title.trim();
      const cardEl =
        slide.querySelector('.main-image-wrapper') ||
        slide.querySelector('img')?.parentElement ||
        slide;

      if (seen.has(cardEl)) return;
      seen.add(cardEl);
      results.push({ titleEl: dataEl, cardEl, titleText });
    });

    if (results.length > 0) return results;

    return findChoiceSteamIconTiles(seen);
  }

  function findChoiceSteamIconTiles(seen) {
    const results = [];

    document.querySelectorAll('.hb-steam, [aria-label="Steam"], [title="Steam"], img[alt="Steam"]').forEach(steamEl => {
      const cardEl = findChoiceCardAncestor(steamEl);
      if (!cardEl) return;

      const titleText = findChoiceCardTitle(cardEl);
      if (!titleText || seen.has(cardEl)) return;

      seen.add(cardEl);
      results.push({ titleEl: steamEl, cardEl, titleText });
    });

    return results;
  }

  function findChoiceCardAncestor(el) {
    let current = el.parentElement;
    for (let i = 0; i < 8 && current; i++) {
      if (current.querySelector('img') && findChoiceCardTitle(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function findChoiceCardTitle(cardEl) {
    const imageTitle = Array.from(cardEl.querySelectorAll('img[alt]'))
      .map(img => (img.getAttribute('alt') || '').trim())
      .find(isLikelyGameTitle);
    if (imageTitle) return imageTitle;

    const titleSelectors = [
      '[class*="game-title"]',
      '[class*="game-name"]',
      '[class*="human-name"]',
      '[class*="product-title"]',
      '[class*="product-name"]',
      '[class*="title"]',
      'h3',
      'h4',
      'h5'
    ];

    for (const selector of titleSelectors) {
      const title = Array.from(cardEl.querySelectorAll(selector))
        .map(el => (el.textContent || '').trim())
        .find(isLikelyGameTitle);
      if (title) return title;
    }

    return '';
  }

  function parseJsonAttribute(el, datasetKey) {
    try {
      const value = el.dataset?.[datasetKey];
      return value ? JSON.parse(value) : null;
    } catch (err) {
      console.warn('[Humble Owned Overlay] Could not parse Choice data', err);
      return null;
    }
  }

  function isTrackableChoiceItem(choice) {
    if (typeof choice?.title !== 'string' || !choice.title.trim() || !choice.image) return false;
    if (/\bplaytest\b/i.test(choice.title)) return false;

    const deliveryMethods = Array.isArray(choice.delivery_methods) ? choice.delivery_methods : [];
    return deliveryMethods.includes('steam');
  }

  // -- Counter banner -------------------------------------------------------

  function updateCounter(ownedCount, total, pageKind) {
    let counter = document.getElementById('hbo-counter');

    if (total === 0) {
      document.getElementById('hbo-counter-row')?.remove();
      counter?.remove();
      return;
    }

    if (!counter) {
      counter = document.createElement('div');
      counter.id = 'hbo-counter';
    }

    counter.classList.toggle('hbo-choice-counter', pageKind === 'choice');

    if (pageKind === 'choice') {
      placeChoiceCounter(counter);
    } else {
      placeBundleCounter(counter);
    }

    const label = buildCounterLabel(ownedCount, total, pageKind);
    if (counter.textContent !== label) counter.textContent = label;
  }

  function placeChoiceCounter(counter) {
    let row = document.getElementById('hbo-counter-row');
    if (!row) {
      row = document.createElement('div');
      row.id = 'hbo-counter-row';
    }

    if (counter.parentElement !== row) row.appendChild(counter);

    const placement = findChoiceCounterPlacement();
    row.classList.toggle('hbo-public-choice-counter-row', placement?.kind === 'public-choice-games');

    if (placement) {
      placeAdjacent(placement.element, placement.position, row);
    } else {
      if (document.body.firstElementChild !== row) document.body.prepend(row);
    }
  }

  function placeBundleCounter(counter) {
    document.getElementById('hbo-counter-row')?.remove();

    const anchor = findCounterAnchor('bundle');
    if (anchor) {
      placeAdjacent(anchor, 'afterend', counter);
    } else {
      if (document.body.firstElementChild !== counter) document.body.prepend(counter);
    }
  }

  function placeAdjacent(anchor, position, element) {
    const sibling = position === 'beforebegin' ? anchor.previousElementSibling : anchor.nextElementSibling;
    if (sibling !== element) anchor.insertAdjacentElement(position, element);
  }

  function findChoiceCounterPlacement() {
    const monthHeader = findShortTextElement(/^[a-z]+\s+\d{4}\s+games$/i);
    const monthSection = monthHeader ? findChoiceMonthSection(monthHeader) : null;
    if (monthSection) {
      return { element: monthSection, position: 'beforebegin' };
    }

    const publicChoiceIntro = findPublicChoiceGamesIntro();
    if (publicChoiceIntro) {
      return { element: publicChoiceIntro, position: 'afterend', kind: 'public-choice-games' };
    }

    const gamesContainer = findChoiceGamesContainer();
    if (gamesContainer) {
      return { element: gamesContainer, position: 'beforebegin' };
    }

    const yourGames = findShortTextElement(/^your games$/i) || findTextElement(/^your games$/i);
    if (yourGames) {
      return { element: yourGames, position: 'afterend' };
    }

    const choiceTitle = findShortTextElement(/^humble choice$/i) || findTextElement(/^humble choice$/i);
    if (choiceTitle) {
      return { element: choiceTitle, position: 'afterend' };
    }

    const gamesView = document.querySelector('.js-games-view, [class*="games-list"], [class*="content-choice"]');
    if (gamesView) {
      return { element: gamesView, position: 'beforebegin' };
    }

    return null;
  }

  function findPublicChoiceGamesIntro() {
    const heading = findShortTextElement(/^this month's games$/i) || findTextElement(/^this month's games$/i);
    if (!heading) return null;

    let current = heading.parentElement;
    for (let i = 0; i < 6 && current; i++) {
      const text = normalizeElementText(current);
      const imageCount = current.querySelectorAll('img').length;
      if (/^this month's games\b/i.test(text) && text.length <= 400 && imageCount === 0) {
        return current;
      }
      current = current.parentElement;
    }

    return heading;
  }

  function findChoiceMonthSection(monthHeader) {
    let current = monthHeader.parentElement;
    for (let i = 0; i < 8 && current; i++) {
      const steamIconCount = current.querySelectorAll(
        '.hb-steam, [aria-label="Steam"], [title="Steam"], img[alt="Steam"]'
      ).length;
      const imageCount = current.querySelectorAll('img').length;

      if (steamIconCount >= 2 || imageCount >= 4) return current;
      current = current.parentElement;
    }

    return monthHeader;
  }

  function findChoiceGamesContainer() {
    const steamSelector = '.hb-steam, [aria-label="Steam"], [title="Steam"], img[alt="Steam"]';
    const subhubPage = document.querySelector('.subhub-page');
    const candidates = subhubPage
      ? Array.from(subhubPage.children)
      : Array.from(document.querySelectorAll('.grid, [class*="games-list"], [class*="content-choice"]'));

    return candidates.find(el => (
      el.querySelectorAll(steamSelector).length >= 2 ||
      el.querySelectorAll('img').length >= 4
    )) || null;
  }

  function findCounterAnchor(pageKind) {
    if (pageKind === 'choice') {
      const placement = findChoiceCounterPlacement();
      return placement?.element || null;
    }

    return document.querySelector(
      'h1, h2, [class*="bundle-name"], [class*="page-title"], [class*="bundle-title"]'
    );
  }

  function findTextElement(pattern) {
    const selectors = 'h1, h2, h3, h4, [class*="title"], [class*="heading"], [class*="header"]';
    return Array.from(document.querySelectorAll(selectors)).find(el => {
      const text = (el.textContent || '').trim();
      return pattern.test(text);
    }) || null;
  }

  function findShortTextElement(pattern) {
    const selectors = 'h1, h2, h3, h4, div, span, p, [class*="title"], [class*="heading"], [class*="header"]';

    return Array.from(document.querySelectorAll(selectors)).find(el => {
      const text = normalizeElementText(el);
      if (!text || text.length > 80 || !pattern.test(text)) return false;

      return Array.from(el.children).every(child => normalizeElementText(child) !== text);
    }) || null;
  }

  function normalizeElementText(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function buildCounterLabel(ownedCount, total, pageKind) {
    const noun = total === 1 ? 'game' : 'games';
    const context = pageKind === 'choice' ? "this month's Choice" : 'this bundle';

    if (ownedCount === 0) return `You own 0 / ${total} ${noun} in ${context}`;
    if (ownedCount === total) return `You own all ${total} ${noun} in ${context}`;
    return `You own ${ownedCount} / ${total} ${noun} in ${context}`;
  }

  // -- MutationObserver (lazy tiles + SPA navigation) ----------------------

  function startMutationObserver() {
    if (mutationObserver) mutationObserver.disconnect();

    mutationObserver = new MutationObserver(records => {
      if (records.every(isOverlayMutation)) return;
      scheduleTagging();
    });

    observedBody = document.body;
    mutationObserver.observe(observedBody, { childList: true, subtree: true, characterData: true });
  }

  function scheduleTagging() {
    if (!ownedSet || !getPageKind()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(tagPage, 300);
  }

  function isOverlayMutation(record) {
    const selector = '.hbo-badge, #hbo-counter, #hbo-counter-row';
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (target?.closest(selector)) return true;
    const nodes = [...record.addedNodes, ...record.removedNodes];
    return nodes.length > 0 && nodes.every(node => node.nodeType === 1 && node.matches(selector));
  }

  function reloadLibrary() {
    ownedSet = null;
    clearTimeout(debounceTimer);
    mutationObserver?.disconnect();
    observedBody = null;
    cleanupOverlay();
    init();
  }

  function checkNavigation() {
    if (location.href !== lastUrl || (observedBody && observedBody !== document.body)) {
      lastUrl = location.href;
      reloadLibrary();
    }
  }

  // Watch the document so navigation still works when Humble replaces the body.
  new MutationObserver(checkNavigation).observe(document, { subtree: true, childList: true });
  window.addEventListener('popstate', checkNavigation);
  window.addEventListener('resize', scheduleTagging);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.hasOwn(changes, 'ownedGamesCache')) reloadLibrary();
  });

  init();
})();
