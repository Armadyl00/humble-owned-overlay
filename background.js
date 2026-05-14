importScripts('lib/normalize.js');

const CACHE_KEY = 'ownedGamesCache';
const GAMES_URL = 'https://steamcommunity.com/my/games/?tab=all';

// Scrub legacy keys/state from previous versions.
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
});

async function getOwnedSet() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const cache = result[CACHE_KEY];
  if (!cache?.games) return { error: 'not_loaded' };
  return buildResult(cache.games, cache.fetchedAt);
}

async function refreshLibrary() {
  // Fetch the user's own games page on Steam Community. Chrome includes
  // the user's existing steamcommunity.com cookies automatically because
  // we declared host_permissions for that origin. We never read those
  // cookies — they're HttpOnly and invisible to JavaScript.
  let html;
  try {
    const res = await fetch(GAMES_URL, {
      credentials: 'include',
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    return { error: 'fetch_failed', message: err.message };
  }

  // If Steam redirected us to a login page, we're not authenticated.
  if (isLoginPage(html)) {
    return { error: 'not_logged_in' };
  }

  // Steam embeds the user's full game list as JS in the page:
  //   var rgGames = [{ "appid": 12345, "name": "...", ... }, ...];
  const match = html.match(/var rgGames\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) {
    return { error: 'parse_failed', message: 'Could not find rgGames in Steam page.' };
  }

  let games;
  try {
    games = JSON.parse(match[1]);
  } catch (err) {
    return { error: 'parse_failed', message: err.message };
  }

  if (!Array.isArray(games) || games.length === 0) {
    return {
      error: 'empty',
      hint: 'Steam returned no games. Make sure your library has games visible to your own account.'
    };
  }

  // Persist only what we need: appid + raw name.
  const trimmed = games.map(g => ({ appid: g.appid, name: g.name }));

  await chrome.storage.local.set({
    [CACHE_KEY]: { fetchedAt: Date.now(), games: trimmed }
  });

  return buildResult(trimmed, Date.now());
}

function isLoginPage(html) {
  return (
    /<title>[^<]*Sign In[^<]*<\/title>/i.test(html) ||
    /class="page_login_form"/i.test(html) ||
    /openidForm/i.test(html)
  );
}

function buildResult(games, fetchedAt) {
  return {
    ownedAppids: games.map(g => g.appid),
    ownedNames: games.map(g => normalizeTitle(g.name)),
    count: games.length,
    fetchedAt,
  };
}
