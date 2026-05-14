'use strict';

const statsEl = document.getElementById('stats');
const refreshBtn = document.getElementById('refresh-btn');
const statusEl = document.getElementById('status');
const settingsLink = document.getElementById('settings-link');

loadStats();

refreshBtn.addEventListener('click', async () => {
  showStatus('Fetching from Steam…', 'info');
  refreshBtn.disabled = true;

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'refreshNow' });
  } finally {
    refreshBtn.disabled = false;
  }

  if (!response) {
    showStatus('No response. Try reloading the extension.', 'err');
    return;
  }

  if (response.error === 'not_logged_in') {
    showStatus('Not signed in to Steam. Open store.steampowered.com, sign in, then try again.', 'err');
    return;
  }

  if (response.error === 'fetch_failed') {
    showStatus(`Couldn't reach Steam: ${response.message}`, 'err');
    return;
  }

  if (response.error === 'parse_failed') {
    showStatus(`Could not parse Steam response. ${response.message || ''}`, 'err');
    return;
  }

  if (response.error === 'private_profile') {
    showStatus(`Private profile. ${response.message || ''}`, 'err');
    return;
  }

  if (response.error === 'empty' || response.error === 'empty_xml') {
    showStatus(`No games returned. ${response.hint || ''}`, 'err');
    return;
  }

  showStatus(`Loaded ${response.count} games.`, 'ok');
  loadStats();
});

settingsLink.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

async function loadStats() {
  const { ownedGamesCache } = await chrome.storage.local.get('ownedGamesCache');

  if (!ownedGamesCache?.fetchedAt) {
    statsEl.innerHTML = 'No library loaded yet.<br/>Click below to fetch.';
    return;
  }

  const count = ownedGamesCache.games?.length ?? 0;
  const when = formatAge(Date.now() - ownedGamesCache.fetchedAt);
  statsEl.innerHTML = `<strong>${count} games</strong> cached<br/>Last refreshed ${when}`;
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
