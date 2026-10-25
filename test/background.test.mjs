import assert from 'node:assert/strict';
import test from 'node:test';
import { background, steamId } from './helpers.mjs';

const oldCache = { fetchedAt: 1, games: [{ appid: 2, name: 'Previous Game' }] };
const refresh = { type: 'refreshNow', apiKey: 'temporary-secret', steamId };

for (const firefox of [false, true]) {
  for (const reason of ['install', 'update']) {
    test(`${reason} only clears a legacy key and preserves the library (${firefox ? 'Firefox' : 'Chrome'})`, async () => {
      const state = background({ cache: oldCache, firefox });
      state.storage.steamApiKey = 'legacy-secret';
      await state.install({ reason });
      assert.equal(state.storage.steamApiKey, undefined);
      assert.deepEqual(state.storage.ownedGamesCache, oldCache);
      assert.equal(state.optionsOpened, undefined);
      assert.equal(state.fetches.length, 0);
      assert.equal(state.writes.length, 0);
    });
  }
}

for (const firefox of [false, true]) {
  test(`fetches and caches a library without persisting the key (${firefox ? 'Firefox scripts' : 'Chrome worker'})`, async () => {
    const state = background({ firefox });
    const response = await state.request(refresh);
    assert.deepEqual(response.owned, ['game']);
    assert.equal(response.gameCount, 1);
    assert.equal(state.listenerResult, true);
    assert.equal(state.storage.steamId, steamId);
    assert.equal(state.storage.ownedGamesCache.steamId, steamId);
    assert.equal(state.storage.ownedGamesCache.fetchedAt, response.fetchedAt);
    assert.equal(JSON.stringify(state.storage).includes(refresh.apiKey), false);
    assert.equal(JSON.stringify(state.writes).includes(refresh.apiKey), false);
    assert.equal(new URL(state.fetches[0].url).searchParams.get('key'), refresh.apiKey);
    assert.equal(state.timers.size, 0);
  });
}

test('cached reads work with v3.3.9 data and make no API request', async () => {
  const state = background({ cache: oldCache });
  assert.deepEqual((await state.request({ type: 'getOwnedSet' })).owned, ['previous game']);
  assert.equal(state.fetches.length, 0);
});

test('missing and malformed caches return structured responses', async () => {
  assert.equal((await background().request({ type: 'getOwnedSet' })).error, 'not_configured');
  assert.equal((await background({ cache: { games: [{}] } }).request({ type: 'getOwnedSet' })).error, 'invalid_cache');
});

for (const games of [{ length: 1 }, [{ appid: 1 }], [{ name: ' ' }], ['Game']]) {
  test(`invalid Steam data preserves the previous cache: ${JSON.stringify(games)}`, async () => {
    const state = background({ cache: oldCache, fetchImpl: async () => ({ ok: true, json: async () => ({ response: { games } }) }) });
    assert.equal((await state.request(refresh)).error, 'invalid_response');
    assert.deepEqual(state.storage.ownedGamesCache, oldCache);
    assert.equal(state.writes.length, 0);
  });
}

for (const response of [{}, { games: [] }]) {
  test(`an unavailable or empty library preserves the cache: ${JSON.stringify(response)}`, async () => {
    const state = background({ cache: oldCache, fetchImpl: async () => ({ ok: true, json: async () => ({ response }) }) });
    assert.equal((await state.request(refresh)).error, 'empty');
    assert.deepEqual(state.storage.ownedGamesCache, oldCache);
    assert.equal(state.storage.steamId, undefined);
  });
}

test('HTTP and network failures do not overwrite the cache or expose the key', async () => {
  for (const fetchImpl of [async () => ({ ok: false, status: 403 }), async () => { throw new Error(`failed ${refresh.apiKey}`); }]) {
    const state = background({ cache: oldCache, fetchImpl });
    const response = await state.request(refresh);
    assert.equal(response.error, 'fetch_failed');
    assert.equal(JSON.stringify(response).includes(refresh.apiKey), false);
    assert.deepEqual(state.storage.ownedGamesCache, oldCache);
    assert.equal(state.timers.size, 0);
  }
});

test('a slow request is aborted and returns a timeout response', async () => {
  const state = background({ cache: oldCache, fetchImpl: (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  const response = state.request(refresh);
  assert.equal([...state.timers.values()][0].delay, 20000);
  for (const timer of state.timers.values()) timer.fn();
  assert.equal((await response).error, 'timeout');
  assert.deepEqual(state.storage.ownedGamesCache, oldCache);
});

test('storage errors always complete the message with an error', async () => {
  assert.equal((await background({ readError: true }).request({ type: 'getOwnedSet' })).error, 'storage_failed');
  const state = background({ cache: oldCache, writeError: true });
  assert.equal((await state.request(refresh)).error, 'storage_failed');
  assert.deepEqual(state.storage.ownedGamesCache, oldCache);
});

test('empty normalized titles cannot become owned keys, but library counts remain accurate', async () => {
  const state = background({ cache: { fetchedAt: 1, games: [{ name: '三國志' }, { name: 'Game' }] } });
  const response = await state.request({ type: 'getOwnedSet' });
  assert.deepEqual(response.owned, ['game']);
  assert.equal(response.gameCount, 2);
});

test('encodes user input as a parameter and validates the Steam ID', async () => {
  const state = background();
  await state.request({ ...refresh, apiKey: 'key&steamid=another' });
  const params = new URL(state.fetches[0].url).searchParams;
  assert.equal(params.get('key'), 'key&steamid=another');
  assert.equal(params.get('steamid'), steamId);
  assert.equal((await state.request({ ...refresh, steamId: 'invalid' })).error, 'missing_params');
  assert.equal(state.fetches.length, 1);
});

test('legacy keys are removed and unrelated senders are ignored', async () => {
  const state = background();
  state.storage.steamApiKey = 'legacy-secret';
  state.install();
  assert.equal(state.storage.steamApiKey, undefined);
  assert.equal(state.untrusted(refresh), undefined);
  assert.equal(state.untrustedResponse, undefined);
  assert.equal(state.fetches.length, 0);
  await state.clickAction();
  assert.equal(state.optionsOpened, true);
});
