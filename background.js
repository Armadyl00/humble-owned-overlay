const USERDATA_URL = 'https://store.steampowered.com/dynamicstore/userdata/';
const SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';
const SEARCH_CACHE_KEY = 'steamSearchCache';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type !== 'check') return;

  checkOwnership(message.games || []).then(sendResponse);
  return true;
});

async function checkOwnership(games) {
  const ownedAppids = await fetchOwnedAppids();
  if (!ownedAppids) return { error: 'not_logged_in_to_steam' };

  const appidByMachine = await resolveAppids(games);

  const ownedMachineNames = [];
  for (const { machineName } of games) {
    const appid = appidByMachine[machineName];
    if (appid && ownedAppids.has(appid)) ownedMachineNames.push(machineName);
  }
  return { ownedMachineNames };
}

// Pulls the user's owned appids from Steam's logged-in userdata endpoint.
// Steam attaches the user's session cookies automatically (they're HttpOnly
// and invisible to this extension; we never see or store them).
async function fetchOwnedAppids() {
  try {
    const res = await fetch(USERDATA_URL, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.rgOwnedApps) || data.rgOwnedApps.length === 0) return null;
    return new Set(data.rgOwnedApps);
  } catch {
    return null;
  }
}

// Humble's bundle JSON doesn't include Steam appids, so we resolve each
// bundle game's name to an appid via Steam's storesearch endpoint. Results
// are cached locally so we only hit Steam once per game ever.
async function resolveAppids(games) {
  const { [SEARCH_CACHE_KEY]: rawCache } = await chrome.storage.local.get(SEARCH_CACHE_KEY);
  const cache = rawCache || {};
  const result = {};
  let cacheDirty = false;

  for (const { machineName, name } of games) {
    if (!name) continue;
    if (cache[name] !== undefined) {
      if (cache[name] !== null) result[machineName] = cache[name];
      continue;
    }
    const appid = await searchSteam(name);
    cache[name] = appid;
    cacheDirty = true;
    if (appid !== null) result[machineName] = appid;
  }

  if (cacheDirty) await chrome.storage.local.set({ [SEARCH_CACHE_KEY]: cache });
  return result;
}

async function searchSteam(name) {
  try {
    const url = `${SEARCH_URL}?term=${encodeURIComponent(name)}&l=english&cc=US`;
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return null;
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const lower = name.toLowerCase();
    // Prefer exact case-insensitive name match; fall back to the top app result.
    const exact = items.find(it => it.type === 'app' && (it.name || '').toLowerCase() === lower);
    const top = items.find(it => it.type === 'app');
    return (exact?.id ?? top?.id) ?? null;
  } catch {
    return null;
  }
}
