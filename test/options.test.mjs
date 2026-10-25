import assert from 'node:assert/strict';
import test from 'node:test';
import { page, source, steamId, flush } from './helpers.mjs';

async function options({ sendMessage = async () => ({ owned: ['game'], gameCount: 1, fetchedAt: Date.now() }), storage = {}, readError = false } = {}) {
  const state = page(source('options.html'));
  state.writes = [];
  state.window.chrome = {
    runtime: { getManifest: () => ({ version: '3.3.10' }), sendMessage },
    storage: { local: {
      async get() { if (readError) throw new Error('read failed'); return storage; },
      async remove(key) { delete storage[key]; },
      async set(value) { state.writes.push(value); },
    } },
  };
  state.window.eval(source('options.js'));
  await flush();
  state.key = state.document.getElementById('api-key');
  state.button = state.document.getElementById('refresh-btn');
  state.status = state.document.getElementById('status');
  state.fetch = async () => {
    state.key.value = 'temporary-secret';
    state.document.getElementById('steam-id').value = steamId;
    state.button.click();
    await flush();
  };
  return state;
}

test('successful fetch clears and hides the key and displays the returned count', async t => {
  const state = await options();
  t.after(state.close);
  state.document.getElementById('toggle-key').click();
  assert.equal(state.key.type, 'text');
  await state.fetch();
  assert.equal(state.key.value, '');
  assert.equal(state.key.type, 'password');
  assert.equal(state.button.disabled, false);
  assert.equal(state.status.className, 'ok');
  assert.match(state.status.textContent, /1 games loaded/);
  assert.match(state.document.getElementById('cache-info').textContent, /Cache: 1 games/);
  assert.deepEqual(state.writes, []);
});

for (const response of [undefined, { error: 'storage_failed', message: 'Could not save your library.' },
  { error: 'timeout', message: 'Steam took too long.' }, { error: 'empty', hint: 'Check privacy.' },
  { error: 'invalid_response' }, { unexpected: true }]) {
  test(`failed refresh resets the key and button: ${JSON.stringify(response)}`, async t => {
    const state = await options({ sendMessage: async () => response });
    t.after(state.close);
    await state.fetch();
    assert.equal(state.key.value, '');
    assert.equal(state.button.disabled, false);
    assert.equal(state.status.className, 'err');
    assert.doesNotMatch(state.status.textContent, /Fetching/);
    assert.deepEqual(state.writes, []);
  });
}

test('a rejected background message displays an error and restores controls', async t => {
  const state = await options({ sendMessage: async () => { throw new Error('disconnected'); } });
  t.after(state.close);
  await state.fetch();
  assert.equal(state.key.value, '');
  assert.equal(state.button.disabled, false);
  assert.match(state.status.textContent, /Could not contact/);
});

test('loading settings removes a legacy key and prefers the cached account ID', async t => {
  const storage = { steamId: '76561198000000001', steamApiKey: 'legacy', ownedGamesCache: { steamId, fetchedAt: 1, games: [] } };
  const state = await options({ storage });
  t.after(state.close);
  assert.equal(state.document.getElementById('steam-id').value, steamId);
  assert.equal(storage.steamApiKey, undefined);
  assert.equal(state.key.value, '');
});

test('settings storage failure is visible and does not disable fetching', async t => {
  const state = await options({ readError: true });
  t.after(state.close);
  assert.equal(state.status.className, 'err');
  assert.equal(state.button.disabled, false);
});
