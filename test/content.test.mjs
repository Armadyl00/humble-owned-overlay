import assert from 'node:assert/strict';
import test from 'node:test';
import { bundle, card, content, flush } from './helpers.mjs';

test('bundle badges and counts exclude cross-promotions and review headings', async t => {
  const state = await content({ html: bundle(card('Game', 'owned') + card('Another Game') + '<h4>94% Positive on Steam</h4>') +
    `<aside class="js-other-bundles-view">${card('Promo')}</aside>` });
  t.after(state.close);
  assert.equal(state.document.querySelectorAll('.hbo-badge').length, 1);
  assert.match(state.document.getElementById('hbo-counter').textContent, /1 \/ 2 games/);
});

test('one external mutation settles without repeated scans or duplicate counters', async t => {
  const state = await content({ html: bundle(card('Game')) });
  t.after(state.close);
  const before = state.scans;
  state.document.querySelector('h3').textContent = 'Game';
  await state.settle();
  assert.equal(state.scans, before + 1);
  assert.equal(state.timers.size, 0);
  assert.equal(state.document.querySelectorAll('#hbo-counter').length, 1);
});

test('reused cards lose stale badges when their title becomes unowned', async t => {
  const state = await content({ html: bundle(card('Game', 'reused')) });
  t.after(state.close);
  state.document.querySelector('h3').firstChild.data = 'Unowned Game';
  await state.settle();
  assert.equal(state.document.querySelector('.hbo-badge'), null);
  assert.match(state.document.getElementById('hbo-counter').textContent, /0 \/ 1 game/);
});

test('lazy cards update the counter and storage changes update the owned set', async t => {
  const state = await content({ html: bundle(card('Game')) });
  t.after(state.close);
  state.document.querySelector('section').insertAdjacentHTML('beforeend', card('New Game'));
  await state.settle();
  assert.match(state.document.getElementById('hbo-counter').textContent, /1 \/ 2 games/);
  state.owned = ['new game'];
  state.storageChanged({ ownedGamesCache: { newValue: {} } }, 'local');
  await state.settle();
  assert.equal(state.document.querySelectorAll('.hbo-badge').length, 1);
  assert.equal(state.document.querySelector('.hbo-badge').parentElement.querySelector('h3').textContent, 'New Game');
  assert.equal(state.requests, 2);
});

test('bundle copies are all decorated while the counter counts unique titles', async t => {
  const state = await content({ html: bundle(card('Game', 'first') + card('Game', 'copy') + card('Other Game')) });
  t.after(state.close);
  assert.equal(state.document.querySelectorAll('.hbo-badge').length, 2);
  assert.match(state.document.getElementById('hbo-counter').textContent, /1 \/ 2 games/);
  state.document.getElementById('copy').querySelector('h3').textContent = 'Changed Game';
  await state.settle();
  assert.equal(state.document.getElementById('copy').querySelector('.hbo-badge'), null);
  assert.ok(state.document.getElementById('first').querySelector('.hbo-badge'));
});

test('an empty desktop bundle view falls back to the populated mobile view', async t => {
  const state = await content({ html: '<h1>Bundle</h1><div class="js-desktop-tiers-view"></div>' +
    `<section class="js-mobile-tiers-view">${card('Game')}</section>` });
  t.after(state.close);
  assert.equal(state.document.querySelectorAll('.hbo-badge').length, 1);
  assert.match(state.document.getElementById('hbo-counter').textContent, /all 1 game/);
  state.window.dispatchEvent(new state.window.Event('resize'));
  await state.settle();
  assert.equal(state.document.querySelectorAll('.hbo-badge').length, 1);
});

test('unrelated non-Latin titles cannot match an empty owned key', async t => {
  const state = await content({ html: bundle(card('大神 絶景版')), owned: [''] });
  t.after(state.close);
  assert.equal(state.document.querySelector('.hbo-badge'), null);
  assert.match(state.document.getElementById('hbo-counter').textContent, /0 \/ 1 game/);
});

for (const path of ['/games', '/books/example', '/software/example', '/store']) {
  test(`unsupported page ${path} does not request or tag a library`, async t => {
    const state = await content({ html: bundle(card('Game')), url: `https://www.humblebundle.com${path}` });
    t.after(state.close);
    assert.equal(state.requests, 0);
    assert.equal(state.scans, 0);
    assert.equal(state.document.querySelector('#hbo-counter'), null);
  });
}

test('SPA navigation removes overlays and resumes on supported pages', async t => {
  const state = await content({ html: bundle(card('Game')) });
  t.after(state.close);
  state.window.history.pushState({}, '', '/books/example');
  state.document.querySelector('h1').textContent = 'Books';
  await state.settle();
  assert.equal(state.document.querySelector('.hbo-badge'), null);
  assert.equal(state.document.querySelector('#hbo-counter'), null);
  state.window.history.pushState({}, '', '/games/next');
  state.document.querySelector('h1').textContent = 'Next Bundle';
  await state.settle();
  assert.ok(state.document.querySelector('.hbo-badge'));
  assert.equal(state.requests, 2);
});

test('same-URL body replacement reconnects tagging', async t => {
  const state = await content({ html: bundle(card('Game')) });
  t.after(state.close);
  const body = state.document.createElement('body');
  body.innerHTML = bundle(card('Game'));
  state.document.body.replaceWith(body);
  await state.settle();
  assert.ok(body.querySelector('.hbo-badge'));
  body.querySelector('h3').textContent = 'Other';
  await state.settle();
  assert.equal(body.querySelector('.hbo-badge'), null);
});

test('a delayed response from the previous route cannot replace the current library', async t => {
  const pending = [];
  const state = await content({ html: bundle(card('Game')), sendMessage: () => new Promise(resolve => pending.push(resolve)) });
  t.after(state.close);
  state.window.history.pushState({}, '', '/games/next');
  state.document.querySelector('h1').textContent = 'Next Bundle';
  await flush();
  assert.equal(pending.length, 2);
  pending[1]({ owned: [] });
  await state.settle();
  pending[0]({ owned: ['game'] });
  await state.settle();
  assert.equal(state.document.querySelector('.hbo-badge'), null);
  assert.match(state.document.getElementById('hbo-counter').textContent, /0 \/ 1 game/);
});

test('missing configuration and rejected messages leave no misleading zero counter', async t => {
  for (const sendMessage of [async () => ({ error: 'not_configured' }), async () => { throw new Error('disconnected'); }]) {
    const state = await content({ html: bundle(card('Game')), sendMessage });
    t.after(state.close);
    assert.equal(state.document.querySelector('#hbo-counter'), null);
    assert.equal(state.document.querySelector('.hbo-badge'), null);
  }
});

function choiceHtml() {
  const data = JSON.stringify({ game: { title: 'Game', image: 'game.jpg', delivery_methods: ['steam'] } });
  const other = JSON.stringify({ other: { title: 'Non Steam', image: 'other.jpg', delivery_methods: ['gog'] } });
  const playtest = JSON.stringify({ play: { title: 'Game Playtest', image: 'play.jpg', delivery_methods: ['steam'] } });
  return `<section><h2>This Month's Games</h2><p>Discover this month's selection.</p></section>
    <div class="js-discover-game-slide"><div data-machine-name="game" data-content-choice-data='${data}'></div>
      <div class="main-image-wrapper" id="choice-card"><img alt="Game"></div></div>
    <div class="js-discover-game-slide"><div data-machine-name="other" data-content-choice-data='${other}'></div></div>
    <div class="js-discover-game-slide"><div data-machine-name="play" data-content-choice-data='${playtest}'></div></div>`;
}

test('public Choice keeps its centered counter and counts Steam games only', async t => {
  const state = await content({ html: choiceHtml(), url: 'https://www.humblebundle.com/membership', badges: true });
  t.after(state.close);
  assert.match(state.document.getElementById('hbo-counter').textContent, /all 1 game/);
  assert.ok(state.document.getElementById('hbo-counter-row').classList.contains('hbo-public-choice-counter-row'));
  assert.equal(state.document.querySelectorAll('.hbo-badge').length, 1);
  state.document.querySelector('p').textContent += ' Updated.';
  await state.settle();
  assert.equal(state.timers.size, 0);
});

test('Choice carousel clones keep their badges and do not inflate the count', async t => {
  const state = await content({ html: choiceHtml(), url: 'https://www.humblebundle.com/membership', badges: true });
  t.after(state.close);
  const clone = state.document.querySelector('.js-discover-game-slide').cloneNode(true);
  clone.querySelector('#choice-card').removeAttribute('id');
  state.document.body.append(clone);
  await state.settle();
  assert.equal(state.document.querySelectorAll('.hbo-badge').length, 2);
  assert.match(state.document.getElementById('hbo-counter').textContent, /all 1 game/);
  state.owned = [];
  state.storageChanged({ ownedGamesCache: {newValue:{}} }, 'local');
  await state.settle();
  assert.equal(state.document.querySelectorAll('.hbo-badge').length, 0);
});

test('logged-in Choice Steam-icon fallback ignores non-Steam cards', async t => {
  const state = await content({ html: `<div class="subhub-page"><section><h2>October 2026 Games</h2>
    <article><img alt="Game"><span class="hb-steam"></span></article>
    <article><img alt="Other Game"><span class="hb-steam"></span></article>
    <article><img alt="Non Steam"><span class="hb-gog"></span></article></section></div>`,
  url: 'https://www.humblebundle.com/membership/home' });
  t.after(state.close);
  assert.match(state.document.getElementById('hbo-counter').textContent, /1 \/ 2 games/);
  assert.equal(state.document.querySelectorAll('.hbo-badge').length, 1);
});

test('Choice owned badges adapt when CLAIMED appears and disappears', async t => {
  const state = await content({ html: choiceHtml(), url: 'https://www.humblebundle.com/membership', badges: true });
  t.after(state.close);
  const card = state.document.getElementById('choice-card');
  card.getBoundingClientRect = () => ({ top: 0, left: 0, width: 200, height: 100 });
  const claimed = state.document.createElement('span');
  claimed.textContent = 'CLAIMED';
  claimed.getBoundingClientRect = () => ({ top: 6, left: 6, bottom: 26, width: 60, height: 20 });
  card.append(claimed);
  await state.settle();
  const badge = card.querySelector('.hbo-badge');
  assert.ok(badge.classList.contains('hbo-badge-below-claimed'));
  assert.equal(badge.style.top, '30px');
  claimed.remove();
  await state.settle();
  assert.equal(badge.classList.contains('hbo-badge-below-claimed'), false);
  assert.equal(badge.style.top, '');
});
