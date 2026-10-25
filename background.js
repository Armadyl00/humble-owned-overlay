// Firefox loads this helper first through background.scripts.
if (typeof importScripts === 'function') importScripts('lib/normalize.js');

const CACHE_KEY = 'ownedGamesCache';
const FETCH_TIMEOUT_MS = 20000;

// Scrub any legacy API key on install/update (v1.0.0 used to persist it).
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove('steamApiKey').catch(() => {});
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  let request;
  if (message?.type === 'getOwnedSet') request = getOwnedSet();
  else if (message?.type === 'refreshNow') request = refreshFromKey(message.apiKey, message.steamId);
  else return;

  request.then(sendResponse, () => sendResponse({
    error: 'storage_failed',
    message: 'Could not read or save the local Steam library. Try reloading the extension.'
  }));
  return true;
});

async function getOwnedSet() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const cache = result[CACHE_KEY];
  if (!cache) return { error: 'not_configured' };
  if (!isValidGames(cache.games)) return { error: 'invalid_cache' };
  return buildResult(cache.games, cache.fetchedAt);
}

async function refreshFromKey(apiKey, steamId) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || typeof steamId !== 'string' || !/^\d{17}$/.test(steamId)) {
    return { error: 'missing_params' };
  }

  const params = new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: '1', format: 'json' });
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?${params}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let data;
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { error: 'fetch_failed', message: `Steam API returned HTTP ${res.status}. Check your API key and try again.` };
    data = await res.json();
  } catch (err) {
    // Do not echo network errors that could include the request URL and key.
    return controller.signal.aborted
      ? { error: 'timeout', message: 'Steam took too long to respond. Try again.' }
      : { error: 'fetch_failed', message: 'Could not reach or read the Steam API. Check your connection and try again.' };
  } finally {
    clearTimeout(timeout);
  }

  const games = data?.response?.games ?? [];

  if (Array.isArray(games) && games.length === 0) {
    return { error: 'empty', hint: 'Steam profile game details may not be set to Public' };
  }
  if (!isValidGames(games)) return { error: 'invalid_response' };

  const fetchedAt = Date.now();
  const result = buildResult(games, fetchedAt);

  // Save the successful account and library together. Never persist the key.
  await chrome.storage.local.set({
    steamId,
    [CACHE_KEY]: { steamId, fetchedAt, games }
  });

  return result;
}

function buildResult(games, fetchedAt) {
  const owned = games.map(g => normalizeTitle(g.name)).filter(Boolean);
  return { owned, fetchedAt, gameCount: games.length };
}

function isValidGames(games) {
  return Array.isArray(games) && games.every(game => typeof game?.name === 'string' && game.name.trim());
}
