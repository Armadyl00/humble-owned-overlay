'use strict';

const apiKeyInput = document.getElementById('api-key');
const steamIdInput = document.getElementById('steam-id');
const toggleKeyBtn = document.getElementById('toggle-key');
const saveBtn = document.getElementById('save-btn');
const refreshBtn = document.getElementById('refresh-btn');
const statusEl = document.getElementById('status');
const cacheInfoEl = document.getElementById('cache-info');

// ── Load saved values ────────────────────────────────────────────────────────

chrome.storage.local.get(['steamApiKey', 'steamId', 'ownedGamesCache'], result => {
  if (result.steamApiKey) apiKeyInput.value = result.steamApiKey;
  if (result.steamId) steamIdInput.value = result.steamId;
  updateCacheInfo(result.ownedGamesCache);
});

// ── Show/hide API key ────────────────────────────────────────────────────────

toggleKeyBtn.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
});

// ── Save ─────────────────────────────────────────────────────────────────────

saveBtn.addEventListener('click', async () => {
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

  await chrome.storage.local.set({ steamApiKey: apiKey, steamId });
  showStatus('Saved.', 'ok');
});

// ── Refresh library ───────────────────────────────────────────────────────────

refreshBtn.addEventListener('click', async () => {
  showStatus('Fetching your Steam library…', 'info');
  refreshBtn.disabled = true;

  const response = await chrome.runtime.sendMessage({ type: 'refreshNow' });
  refreshBtn.disabled = false;

  if (!response) {
    showStatus('No response from background. Try reloading the extension.', 'err');
    return;
  }

  if (response.error === 'not_configured') {
    showStatus('Save your API key and SteamID64 first.', 'err');
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
  showStatus(`Library refreshed — ${count} games loaded.`, 'ok');

  const cacheResult = await chrome.storage.local.get('ownedGamesCache');
  updateCacheInfo(cacheResult.ownedGamesCache);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type;
}

function updateCacheInfo(cache) {
  if (!cache?.fetchedAt) {
    cacheInfoEl.textContent = 'Library not yet loaded.';
    return;
  }
  const age = Math.round((Date.now() - cache.fetchedAt) / 60000);
  const count = cache.games?.length ?? 0;
  cacheInfoEl.textContent = `Cache: ${count} games · fetched ${age < 1 ? 'just now' : `${age} min ago`} · auto-refreshes after 1 hour`;
}
