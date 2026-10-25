import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { page, source } from './helpers.mjs';

function popup(cache) {
  const state = page(source('popup.html'));
  state.close = state.window.close.bind(state.window);
  state.window.chrome = {
    runtime: {
      getManifest: () => JSON.parse(fs.readFileSync('manifest.json', 'utf8')),
      openOptionsPage: () => { state.optionsOpened = true; },
    },
    storage: { local: { get: (key, callback) => callback({ ownedGamesCache: cache }) } },
  };
  state.window.close = () => { state.popupClosed = true; };
  state.window.eval(source('popup.js'));
  return state;
}

test('toolbar popup shows an unconfigured cache and the installed version', t => {
  const state = popup();
  t.after(state.close);
  const version = JSON.parse(fs.readFileSync('manifest.json', 'utf8')).version;
  assert.equal(state.document.getElementById('version').textContent, `v${version}`);
  assert.equal(state.document.getElementById('status').textContent, 'Not loaded');
  assert.equal(state.document.getElementById('game-count').textContent, '-');
  assert.equal(state.document.getElementById('last-updated').textContent, '-');
});

test('toolbar popup reads the shared library cache and refresh age', t => {
  const state = popup({ fetchedAt: Date.now() - 5 * 60000, games: [{ name: 'Game' }, { name: 'Other Game' }] });
  t.after(state.close);
  assert.equal(state.document.getElementById('status').textContent, 'Loaded');
  assert.equal(state.document.getElementById('game-count').textContent, '2');
  assert.equal(state.document.getElementById('last-updated').textContent, '5 min ago');
});

test('toolbar settings shortcut opens options and closes the popup', t => {
  const state = popup();
  t.after(state.close);
  state.document.getElementById('open-options').click();
  assert.equal(state.optionsOpened, true);
  assert.equal(state.popupClosed, true);
});
