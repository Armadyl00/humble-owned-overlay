importScripts('lib/normalize.js');

const CACHE_KEY = 'ownedGamesCache';
const SEARCH_CACHE_KEY = 'steamSearchCache';
const XML_URL = 'https://steamcommunity.com/my/games/?tab=all&xml=1';
const USERDATA_URL = 'https://store.steampowered.com/dynamicstore/userdata/';
const SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(['steamApiKey', 'steamId']).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  if (message.type === 'getOwnedSet') {
    getOwnedSet().then(sendResponse);
    return true;
  }

  if (message.type === 'refreshNow') {
    refreshLibrary().then(sendResponse);
    return true;
  }

  if (message.type === 'lookupAppids') {
    lookupAppids(message.games || []).then(sendResponse);
    return true;
  }
});

async function getOwnedSet() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const cache = result[CACHE_KEY];
  if (!cache?.games) return { error: 'not_loaded' };
  return buildResult(cache.games, cache.fetchedAt);
}

async function refreshLibrary() {
  // Try the XML feed first — it carries appid + name pairs and is stable
  // because Steam exposes it as a documented data-export endpoint.
  const xmlResult = await tryFetchXml();
  if (xmlResult.ok) {
    return saveAndReturn(xmlResult.games);
  }

  // Fall back to dynamicstore/userdata. This works even for private profiles
  // (it's tied to your logged-in session, not profile visibility) but only
  // returns appids, not names. Name-based matching will be unavailable, but
  // appid matching on Humble tiles still works for any tile that links to
  // Steam — which is most of them.
  const userdataResult = await tryFetchUserdata();
  if (userdataResult.ok) {
    return saveAndReturn(userdataResult.games, { appidsOnly: true });
  }

  // Both failed. Surface whichever error is more informative.
  return xmlResult.error || userdataResult.error || { error: 'unknown' };
}

async function saveAndReturn(games, opts = {}) {
  if (!games.length) {
    return { error: 'empty', hint: 'Steam returned no games for your account.' };
  }

  await chrome.storage.local.set({
    [CACHE_KEY]: { fetchedAt: Date.now(), games, appidsOnly: !!opts.appidsOnly }
  });

  return buildResult(games, Date.now());
}

// ── XML endpoint ─────────────────────────────────────────────────────────────

async function tryFetchXml() {
  let text;
  try {
    const res = await fetch(XML_URL, { credentials: 'include', redirect: 'follow' });
    if (!res.ok) {
      return { ok: false, error: { error: 'fetch_failed', message: `XML HTTP ${res.status}` } };
    }
    text = await res.text();
  } catch (err) {
    return { ok: false, error: { error: 'fetch_failed', message: `XML: ${err.message}` } };
  }

  // If Steam returned an HTML login page instead of XML, we're not signed in.
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return { ok: false, error: { error: 'not_logged_in' } };
  }

  // Parse the gamesList XML.
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');

  if (doc.querySelector('parsererror')) {
    return { ok: false, error: { error: 'parse_failed', message: 'XML parse error', sample: text.slice(0, 300) } };
  }

  // A private-profile response includes <error>...</error>.
  const errorNode = doc.querySelector('response > error, gamesList > error');
  if (errorNode) {
    return { ok: false, error: { error: 'private_profile', message: errorNode.textContent?.trim() } };
  }

  const gameEls = doc.querySelectorAll('gamesList > games > game');
  const games = [];
  for (const g of gameEls) {
    const appidStr = g.querySelector('appID')?.textContent?.trim();
    const name = g.querySelector('name')?.textContent?.trim();
    const appid = appidStr ? parseInt(appidStr, 10) : NaN;
    if (Number.isFinite(appid) && name) {
      games.push({ appid, name });
    }
  }

  if (!games.length) {
    return { ok: false, error: { error: 'empty_xml', hint: 'XML had no <game> entries.' } };
  }

  return { ok: true, games };
}

// ── dynamicstore/userdata endpoint ───────────────────────────────────────────

async function tryFetchUserdata() {
  let data;
  try {
    const res = await fetch(USERDATA_URL, { credentials: 'include', redirect: 'follow' });
    if (!res.ok) {
      return { ok: false, error: { error: 'fetch_failed', message: `userdata HTTP ${res.status}` } };
    }
    data = await res.json();
  } catch (err) {
    return { ok: false, error: { error: 'fetch_failed', message: `userdata: ${err.message}` } };
  }

  // Anonymous responses return an empty / minimal object — owned apps list is
  // populated only for logged-in sessions.
  const ownedApps = Array.isArray(data?.rgOwnedApps) ? data.rgOwnedApps : null;
  if (!ownedApps) {
    return { ok: false, error: { error: 'not_logged_in' } };
  }

  if (ownedApps.length === 0) {
    return { ok: false, error: { error: 'empty', hint: 'Steam returned an empty owned-apps list.' } };
  }

  // Name is null when we only have appids — caller marks appidsOnly: true.
  const games = ownedApps.map(appid => ({ appid, name: null }));
  return { ok: true, games };
}

// ── Steam appid lookup by game name ──────────────────────────────────────────
// Used by content.js when scanning a Humble bundle page. Humble doesn't expose
// Steam appids in its bundle JSON, but Steam's storesearch endpoint resolves
// names to appids reliably. Results are cached keyed on the normalized name so
// repeat visits don't re-hit Steam.

async function lookupAppids(games) {
  if (!games.length) return { appids: {} };

  const { [SEARCH_CACHE_KEY]: rawCache } = await chrome.storage.local.get(SEARCH_CACHE_KEY);
  const cache = rawCache || {};
  const out = {};

  for (const { machineName, name } of games) {
    if (!name) continue;
    const key = normalizeTitle(name);

    if (cache[key] !== undefined) {
      // Treat null as "we already searched and found nothing" — don't retry.
      if (cache[key] !== null) out[machineName] = cache[key];
      continue;
    }

    const appid = await searchSteamForName(name);
    cache[key] = appid;
    if (appid !== null) out[machineName] = appid;
  }

  await chrome.storage.local.set({ [SEARCH_CACHE_KEY]: cache });
  return { appids: out };
}

async function searchSteamForName(name) {
  const url = `${SEARCH_URL}?term=${encodeURIComponent(name)}&l=english&cc=US`;
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return null;
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    // Prefer an exact case-insensitive name match; fall back to the first app.
    const lower = name.toLowerCase();
    const exact = items.find(it => it.type === 'app' && (it.name || '').toLowerCase() === lower);
    const top = items.find(it => it.type === 'app');
    return (exact?.id ?? top?.id) ?? null;
  } catch {
    return null;
  }
}

// ── result shaping ───────────────────────────────────────────────────────────

function buildResult(games, fetchedAt) {
  return {
    ownedAppids: games.map(g => g.appid),
    ownedNames: games.filter(g => g.name).map(g => normalizeTitle(g.name)),
    count: games.length,
    fetchedAt,
  };
}
