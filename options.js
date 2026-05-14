'use strict';

const refreshBtn = document.getElementById('refresh-btn');
const cacheInfoEl = document.getElementById('cache-info');
const statusEl = document.getElementById('status');

loadCacheInfo();

refreshBtn.addEventListener('click', async () => {
  showStatus('Fetching your Steam library…', 'info');
  refreshBtn.disabled = true;

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'refreshNow' });
  } finally {
    refreshBtn.disabled = false;
  }

  if (!response) {
    showStatus('No response from the background worker. Try reloading the extension.', 'err');
    return;
  }

  if (response.error === 'not_logged_in') {
    showStatus(
      'You are not signed in to Steam in this browser. Sign in at store.steampowered.com and try again.',
      'err'
    );
    return;
  }

  if (response.error === 'fetch_failed') {
    showStatus(`Couldn't reach Steam: ${response.message}`, 'err');
    return;
  }

  if (response.error === 'parse_failed') {
    showStatus(
      `Could not parse Steam's response. ${response.message || ''}`,
      'err'
    );
    return;
  }

  if (response.error === 'private_profile') {
    showStatus(
      `Steam reported: "${response.message}". Set your profile + Game details to Public, or rely on appid matching only.`,
      'err'
    );
    return;
  }

  if (response.error === 'empty' || response.error === 'empty_xml') {
    showStatus(`Steam returned no games. ${response.hint || ''}`, 'err');
    return;
  }

  showStatus(`Loaded ${response.count} games from Steam.`, 'ok');
  loadCacheInfo();
});

async function loadCacheInfo() {
  const { ownedGamesCache } = await chrome.storage.local.get('ownedGamesCache');

  if (!ownedGamesCache?.fetchedAt) {
    cacheInfoEl.innerHTML = 'No library loaded yet — click <strong>Refresh from Steam</strong> below.';
    return;
  }

  const count = ownedGamesCache.games?.length ?? 0;
  const when = formatAge(Date.now() - ownedGamesCache.fetchedAt);
  cacheInfoEl.innerHTML = `<strong>${count} games</strong> cached · last refreshed ${when}`;
}

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type;
}

function formatAge(ms) {
  const min = Math.floor(ms / 60000);
  const hr = Math.floor(ms / 3600000);
  const day = Math.floor(ms / 86400000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  return `${day} day${day === 1 ? '' : 's'} ago`;
}
