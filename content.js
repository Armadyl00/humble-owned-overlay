(function () {
  'use strict';

  let ownedSet = null;
  let steamAppIdsByTitle = {};
  let mutationObserver = null;
  let debounceTimer = null;
  let lastUrl = location.href;

  // Game bundle pages have a slug after /games, e.g. /games/some-bundle-slug.
  // Listing pages (/games) and non-game bundle categories (/books, /software)
  // are skipped because this extension only checks Steam game ownership.
  function isBundlePage() {
    return /^\/games\/[^/]+/.test(location.pathname);
  }

  function isChoicePage() {
    return /^\/membership(?:\/|$)/.test(location.pathname);
  }

  function isLibraryPage() {
    return /^\/home\/library(?:\/|$)/.test(location.pathname);
  }

  function isPurchasesPage() {
    return /^\/home\/purchases(?:\/|$)/.test(location.pathname);
  }

  function getPageKind() {
    if (isChoicePage()) return 'choice';
    if (isBundlePage()) return 'bundle';
    if (isLibraryPage()) return 'library';
    if (isPurchasesPage()) return 'purchases';
    return null;
  }

  async function init() {
    const pageKind = getPageKind();
    if (!pageKind) {
      cleanupOverlay();
      return;
    }

    const response = await chrome.runtime.sendMessage({ type: 'getOwnedSet' });

    if (!response || response.error === 'not_configured') return;

    if (response.error) {
      console.warn('[Humble Owned Overlay]', response.error, response.message || response.hint || '');
      return;
    }

    ownedSet = new Set(response.owned);
    steamAppIdsByTitle = response.appIdsByTitle || {};
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

    if (isAccountPageKind(pageKind)) {
      tagAccountPage(pageKind);
      return;
    }

    const tiles = pageKind === 'choice' ? findChoiceTiles() : findBundleTiles();
    let ownedCount = 0;

    for (const { cardEl, titleText } of tiles) {
      const norm = normalizeTitle(titleText);
      if (ownedSet.has(norm)) {
        ownedCount++;
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
      }
    }

    updateCounter(ownedCount, tiles.length, pageKind);
    linkExpandedSteamTitles(pageKind);
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

  function isAccountPageKind(pageKind) {
    return pageKind === 'library' || pageKind === 'purchases';
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
    const scope =
      document.querySelector('.js-desktop-tiers-view') ||
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

  function isLikelyAccountGameTitle(text) {
    if (!isLikelyGameTitle(text)) return false;
    if (/^(humble library|library|purchases|platform|sort|alphabetical|search)$/i.test(text)) return false;
    if (/^(in library|download|redeem|gift|key|keys|order|claimed|unclaimed)$/i.test(text)) return false;
    if (/^(windows|mac|linux|android|steam|gog|origin|uplay|epic games)$/i.test(text)) return false;
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

  // -- Account library/purchases discovery --------------------------------

  function tagAccountPage(pageKind) {
    document.getElementById('hbo-counter-row')?.remove();
    document.getElementById('hbo-counter')?.remove();

    const badgedRows = new Set();
    for (const { titleEl, cardEl, titleText } of findAccountTiles(pageKind)) {
      if (!ownedSet.has(normalizeTitle(titleText))) continue;
      if (cardEl && badgedRows.has(cardEl)) continue;
      if (findExistingInlineBadge(titleEl, cardEl)) continue;

      const badge = document.createElement('span');
      badge.className = 'hbo-badge hbo-inline-badge';
      badge.textContent = 'Owned';
      titleEl.insertAdjacentElement('afterend', badge);
      if (cardEl) badgedRows.add(cardEl);
    }
  }

  function findAccountTiles(pageKind) {
    const scope = findAccountScope(pageKind);
    const candidates = new Set();

    scope.querySelectorAll(
      'a, h2, h3, h4, span, div, ' +
      '[class*="title"], [class*="Title"], ' +
      '[class*="name"], [class*="Name"], ' +
      '[class*="game-title"], [class*="game-name"], ' +
      '[class*="product-title"], [class*="product-name"], ' +
      '[class*="entity-title"], [class*="entity-name"], ' +
      '[class*="item-title"], [class*="itemTitle"], ' +
      '[class*="purchase-title"], [class*="human-name"]'
    ).forEach(el => candidates.add(el));

    const results = [];

    for (const titleEl of candidates) {
      if (titleEl.closest('nav, header, footer, form, select, option, script, style, .hbo-badge')) continue;
      if (!isVisibleElement(titleEl)) continue;

      const titleText = getAccountTitleText(titleEl);
      if (!isLikelyAccountGameTitle(titleText)) continue;

      const rowEl = findAccountRowAncestor(titleEl);
      if (rowEl && !isLikelyAccountRow(rowEl)) continue;

      results.push({ titleEl, cardEl: rowEl || titleEl.parentElement || titleEl, titleText });
    }

    return results;
  }

  function findAccountScope(pageKind) {
    const pageSelector = pageKind === 'library'
      ? '.js-library-view, .library-view, .library-holder, .library-content, [class*="Library"]'
      : '.js-purchases-view, .purchases-view, .purchases-holder, .purchase-history, [class*="Purchases"]';

    const candidates = [
      ...document.querySelectorAll(pageSelector),
      document.querySelector('.base-main-wrapper'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.body
    ].filter(Boolean);

    return candidates
      .filter(isVisibleElement)
      .sort((a, b) => scoreAccountScope(b) - scoreAccountScope(a))[0] || document.body;
  }

  function getAccountTitleText(el) {
    const directText = Array.from(el.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const text = directText || normalizeElementText(el);
    return text.replace(/\s+(steam|windows|mac|linux|drm-free)$/i, '').trim();
  }

  function findAccountRowAncestor(el) {
    let current = el.parentElement;
    for (let i = 0; i < 8 && current; i++) {
      const text = normalizeElementText(current);
      const looksLikeRow = current.matches(
        'li, tr, [class*="row"], [class*="Row"], [class*="item"], [class*="Item"], ' +
        '[class*="game"], [class*="Game"], [class*="product"], [class*="Product"], ' +
        '[class*="purchase"], [class*="Purchase"], [class*="library"], [class*="Library"]'
      ) || current.querySelector('img, svg, use');

      if (text.length > 0 && text.length <= 800 && looksLikeRow) {
        return current;
      }
      current = current.parentElement;
    }

    return el.parentElement;
  }

  function isLikelyAccountRow(el) {
    if (!el) return false;
    if (el.querySelector('img, svg, use')) return true;
    if (el.matches('li, tr, [class*="row"], [class*="Row"], [class*="item"], [class*="Item"]')) return true;
    if (el.matches('[class*="game"], [class*="Game"], [class*="product"], [class*="Product"]')) return true;
    return false;
  }

  function scoreAccountScope(el) {
    const rows = el.querySelectorAll(
      'li, tr, [class*="row"], [class*="Row"], [class*="item"], [class*="Item"], ' +
      '[class*="game"], [class*="Game"], [class*="product"], [class*="Product"]'
    ).length;
    const titles = el.querySelectorAll('a, h2, h3, h4, [class*="title"], [class*="Title"], [class*="name"], [class*="Name"]').length;
    const media = el.querySelectorAll('img, svg').length;
    const textLength = normalizeElementText(el).length;
    return rows * 8 + titles * 3 + media + Math.min(textLength, 5000) / 500;
  }

  function isVisibleElement(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findExistingInlineBadge(titleEl, rowEl) {
    if (rowEl?.querySelector('.hbo-inline-badge')) return true;

    let current = titleEl.nextElementSibling;
    while (current) {
      if (current.classList?.contains('hbo-inline-badge')) return current;
      if (normalizeElementText(current)) return null;
      current = current.nextElementSibling;
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
      if (seen.has(titleText)) return;

      const cardEl =
        slide.querySelector('.main-image-wrapper') ||
        slide.querySelector('img')?.parentElement ||
        slide;

      seen.add(titleText);
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
      if (!titleText || seen.has(titleText)) return;

      seen.add(titleText);
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
    if (!choice?.title || !choice.image) return false;
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

    counter.textContent = buildCounterLabel(ownedCount, total, pageKind);
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
      placement.element.insertAdjacentElement(placement.position, row);
    } else {
      document.body.prepend(row);
    }
  }

  function placeBundleCounter(counter) {
    document.getElementById('hbo-counter-row')?.remove();

    const anchor = findCounterAnchor('bundle');
    if (anchor) {
      anchor.insertAdjacentElement('afterend', counter);
    } else {
      document.body.prepend(counter);
    }
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

  // -- Exact Steam title links ---------------------------------------------

  function linkExpandedSteamTitles(pageKind) {
    if (pageKind !== 'bundle') return;

    for (const panelEl of findExpandedGamePanels()) {
      const titleEl = findExpandedPanelTitle(panelEl);
      if (!titleEl || titleEl.querySelector('.hbo-steam-title-link')) continue;

      const titleText = normalizeElementText(titleEl);
      const appid = findSteamAppIdForTitle(titleText, panelEl);
      if (!appid) continue;

      linkTitleElement(titleEl, titleText, appid);
    }
  }

  function findExpandedGamePanels() {
    const selector = [
      '.dd-game-row-expanded',
      '.dd-game-row-details',
      '[class*="game-detail"]',
      '[class*="GameDetail"]',
      '[class*="expanded-game"]',
      '[class*="expandedGame"]',
      '[class*="details-view"]'
    ].join(', ');

    return Array.from(document.querySelectorAll(selector)).filter(el => {
      const rect = el.getBoundingClientRect();
      const text = normalizeElementText(el);
      return rect.width > 0 && rect.height > 0 && text.length > 0 && text.length <= 2000;
    });
  }

  function findExpandedPanelTitle(panelEl) {
    const selectors = [
      'h2',
      'h3',
      '[class*="game-title"]',
      '[class*="game-name"]',
      '[class*="product-title"]',
      '[class*="entity-title"]'
    ];

    for (const selector of selectors) {
      const title = Array.from(panelEl.querySelectorAll(selector)).find(el => {
        if (el.closest('button, .hbo-badge')) return false;
        const text = normalizeElementText(el);
        return isLikelyGameTitle(text) && !el.querySelector('a, button, input, select, textarea');
      });

      if (title) return title;
    }

    return null;
  }

  function findSteamAppIdForTitle(titleText, panelEl) {
    const cachedAppId = steamAppIdsByTitle[normalizeTitle(titleText)];
    if (cachedAppId) return cachedAppId;

    return findSteamAppIdFromLinks(panelEl);
  }

  function findSteamAppIdFromLinks(rootEl) {
    for (const link of rootEl.querySelectorAll('a[href*="store.steampowered.com/app/"], a[href*="steamcommunity.com/app/"]')) {
      const appid = extractSteamAppId(link.href);
      if (appid) return appid;
    }
    return null;
  }

  function extractSteamAppId(url) {
    const match = String(url).match(/(?:store\.steampowered\.com|steamcommunity\.com)\/app\/(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function linkTitleElement(titleEl, titleText, appid) {
    const link = document.createElement('a');
    link.className = 'hbo-steam-title-link';
    link.href = `https://store.steampowered.com/app/${appid}/`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = titleText;

    titleEl.textContent = '';
    titleEl.appendChild(link);
  }

  // -- MutationObserver (lazy tiles + SPA navigation) ----------------------

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
      steamAppIdsByTitle = {};
      mutationObserver?.disconnect();
      cleanupOverlay();
      init();
    }
  }).observe(document, { subtree: true, childList: true });

  init();
})();
