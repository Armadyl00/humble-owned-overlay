importScripts('lib/normalize.js');

const CACHE_KEY = 'ownedGamesCache';

// Scrub any legacy API key on install/update (v1.0.0 used to persist it).
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove('steamApiKey').catch(() => {});
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  if (message.type === 'getOwnedSet') {
    getOwnedSet().then(sendResponse);
    return true;
  }

  if (message.type === 'refreshNow') {
    refreshFromKey(message.apiKey, message.steamId).then(sendResponse);
    return true;
  }
});

async function getOwnedSet() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const cache = result[CACHE_KEY];
  if (!cache?.games) return { error: 'not_configured' };
  return buildResult(cache.games, cache.fetchedAt);
}

async function refreshFromKey(apiKey, steamId) {
  if (!apiKey || !steamId) {
    return { error: 'missing_params' };
  }

  const url =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
    `?key=${apiKey}&steamid=${steamId}&include_appinfo=1&format=json`;

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

  // Persist only the game list — never the API key. The key only lives in this
  // function's local scope and is discarded as soon as this returns.
  await chrome.storage.local.set({
    [CACHE_KEY]: { fetchedAt: Date.now(), games }
  });

  return buildResult(games, Date.now());
}

function buildResult(games, fetchedAt) {
  const owned = [];

  for (const game of games) {
    const title = normalizeTitle(game.name || '');
    if (!title) continue;

    owned.push(title);
  }

  return { owned, fetchedAt };
}
