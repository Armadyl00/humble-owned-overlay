'use strict';

const versionEl = document.getElementById('version');
const statusEl = document.getElementById('status');
const gameCountEl = document.getElementById('game-count');
const lastUpdatedEl = document.getElementById('last-updated');
const openOptionsBtn = document.getElementById('open-options');

versionEl.textContent = `v${chrome.runtime.getManifest().version}`;

chrome.storage.local.get('ownedGamesCache', result => {
  const cache = result.ownedGamesCache;

  if (!cache?.fetchedAt) {
    statusEl.textContent = 'Not loaded';
    gameCountEl.textContent = '-';
    lastUpdatedEl.textContent = '-';
    return;
  }

  statusEl.textContent = 'Loaded';
  gameCountEl.textContent = String(cache.games?.length ?? 0);
  lastUpdatedEl.textContent = formatCacheAge(cache.fetchedAt);
});

openOptionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

function formatCacheAge(fetchedAt) {
  const ageMs = Date.now() - fetchedAt;
  const ageMin = Math.floor(ageMs / 60000);
  const ageHr = Math.floor(ageMs / 3600000);
  const ageDay = Math.floor(ageMs / 86400000);

  if (ageMin < 1) return 'just now';
  if (ageMin < 60) return `${ageMin} min ago`;
  if (ageHr < 24) return `${ageHr} hour${ageHr === 1 ? '' : 's'} ago`;
  return `${ageDay} day${ageDay === 1 ? '' : 's'} ago`;
}
