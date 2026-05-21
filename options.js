'use strict';

const apiKeyInput = document.getElementById('api-key');
const steamIdInput = document.getElementById('steam-id');
const toggleKeyBtn = document.getElementById('toggle-key');
const refreshBtn = document.getElementById('refresh-btn');
const statusEl = document.getElementById('status');
const cacheInfoEl = document.getElementById('cache-info');

// ── Init ────────────────────────────────────────────────────────────────────
// Load saved Steam ID + cache info. The API key field is intentionally NOT
// pre-populated — we don't store it anywhere.
showExtensionVersion();

chrome.storage.local.get(['steamId', 'ownedGamesCache', 'steamApiKey'], async result => {
  if (result.steamId) steamIdInput.value = result.steamId;
  updateCacheInfo(result.ownedGamesCache);

  // Migration: scrub any legacy API key left over from v1.0.0.
  if (result.steamApiKey) {
    await chrome.storage.local.remove('steamApiKey');
  }
});

// ── Show/hide API key ────────────────────────────────────────────────────────
toggleKeyBtn.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
});

// ── Fetch library ────────────────────────────────────────────────────────────
refreshBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const steamId = steamIdInput.value.trim();

  if (!apiKey || !steamId) {
    showStatus('Both fields are required.', 'err');
    return;
  }

  if (!/^\d{17}$/.test(steamId)) {
    showStatus('SteamID64 must be a 17-digit number.', 'err');
    return;
  }

  showStatus('Fetching your Steam library…', 'info');
  refreshBtn.disabled = true;

  // Persist the Steam ID (it's a public identifier — fine to store).
  await chrome.storage.local.set({ steamId });

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'refreshNow',
      apiKey,
      steamId,
    });
  } finally {
    // Always clear the API key from the input — defense in depth, regardless
    // of whether the fetch succeeded or failed.
    apiKeyInput.value = '';
    refreshBtn.disabled = false;
  }

  if (!response) {
    showStatus('No response from the background worker. Try reloading the extension.', 'err');
    return;
  }

  if (response.error === 'missing_params') {
    showStatus('Missing API key or Steam ID.', 'err');
    return;
  }

  if (response.error === 'fetch_failed') {
    showStatus(`Failed to reach Steam API: ${response.message}`, 'err');
    return;
  }

  if (response.error === 'empty') {
    showStatus(
      `Steam returned an empty library. ${response.hint || 'Check your profile privacy settings.'}`,
      'err'
    );
    return;
  }

  const count = response.owned?.length ?? 0;
  showStatus(`Library refreshed — ${count} games loaded. API key was not stored.`, 'ok');

  const cacheResult = await chrome.storage.local.get('ownedGamesCache');
  updateCacheInfo(cacheResult.ownedGamesCache);
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function showExtensionVersion() {
  const title = document.querySelector('h1');
  if (!title) return;

  const version = document.createElement('span');
  version.textContent = `v${chrome.runtime.getManifest().version}`;
  version.style.display = 'inline-block';
  version.style.margin = '0 0 18px';
  version.style.padding = '4px 8px';
  version.style.border = '1px solid #2a2a4a';
  version.style.borderRadius = '999px';
  version.style.background = '#16213e';
  version.style.color = '#aaa';
  version.style.fontSize = '12px';
  version.style.fontWeight = '600';
  version.style.lineHeight = '1';

  title.insertAdjacentElement('afterend', version);
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type;
}

function updateCacheInfo(cache) {
  if (!cache?.fetchedAt) {
    cacheInfoEl.textContent = 'Library not yet loaded.';
    return;
  }

  const ageMs = Date.now() - cache.fetchedAt;
  const ageMin = Math.floor(ageMs / 60000);
  const ageHr = Math.floor(ageMs / 3600000);
  const ageDay = Math.floor(ageMs / 86400000);

  let when;
  if (ageMin < 1) when = 'just now';
  else if (ageMin < 60) when = `${ageMin} min ago`;
  else if (ageHr < 24) when = `${ageHr} hour${ageHr === 1 ? '' : 's'} ago`;
  else when = `${ageDay} day${ageDay === 1 ? '' : 's'} ago`;

  const count = cache.games?.length ?? 0;
  cacheInfoEl.textContent = `Cache: ${count} games · last refreshed ${when}`;
}
