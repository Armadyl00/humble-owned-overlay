importScripts('lib/normalize.js');

const CACHE_KEY = 'ownedGamesCache';
const CACHE_TTL_MS = 60 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  if (message.type === 'getOwnedSet') {
    getOwnedSet().then(sendResponse);
    return true;
  }

  if (message.type === 'refreshNow') {
    refreshCache().then(sendResponse);
    return true;
  }
});

async function getOwnedSet() {
  const cached = await loadFromCache();
  if (cached) return cached;
  return refreshCache();
}

async function loadFromCache() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const cache = result[CACHE_KEY];
  if (!cache) return null;
  if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null;
  return buildResult(cache.games, cache.fetchedAt);
}

async function refreshCache() {
  const stored = await chrome.storage.local.get(['steamApiKey', 'steamId']);
  const { steamApiKey, steamId } = stored;

  if (!steamApiKey || !steamId) {
    return { error: 'not_configured' };
  }

  const url =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
    `?key=${steamApiKey}&steamid=${steamId}&include_appinfo=1&format=json`;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    return { error: 'fetch_failed', message: err.message };
  }

  const games = data?.response?.games ?? [];

  if (games.length === 0) {
    return { error: 'empty', hint: 'Steam profile game details may not be set to Public' };
  }

  await chrome.storage.local.set({
    [CACHE_KEY]: { fetchedAt: Date.now(), games }
  });

  return buildResult(games, Date.now());
}

function buildResult(games, fetchedAt) {
  const owned = games.map(g => normalizeTitle(g.name));
  return { owned, fetchedAt };
}
