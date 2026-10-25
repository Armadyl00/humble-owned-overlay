import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

export const source = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
export const flush = () => new Promise(resolve => setImmediate(resolve));
export const steamId = '76561198000000000';

export function background({ cache, firefox = false, fetchImpl, readError = false, writeError = false } = {}) {
  const state = { storage: cache ? { ownedGamesCache: structuredClone(cache) } : {}, writes: [], fetches: [], timers: new Map() };
  let listener, installed, nextTimer = 0;
  const chrome = {
    runtime: {
      id: 'test-extension',
      onMessage: { addListener(fn) { listener = fn; } },
      onInstalled: { addListener(fn) { installed = fn; } },
      openOptionsPage: async () => { state.optionsOpened = true; },
    },
    action: { onClicked: { addListener(fn) { state.clickAction = fn; } } },
    storage: { local: {
      async get() { if (readError) throw new Error('read failed'); return structuredClone(state.storage); },
      async set(value) {
        if (writeError) throw new Error('write failed');
        state.writes.push(structuredClone(value));
        Object.assign(state.storage, structuredClone(value));
      },
      async remove(key) { delete state.storage[key]; },
    } },
  };
  const context = vm.createContext({
    chrome, URLSearchParams, AbortController,
    setTimeout(fn, delay) { const id = ++nextTimer; state.timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { state.timers.delete(id); },
    fetch: async (url, options) => {
      state.fetches.push({ url, options });
      return fetchImpl ? fetchImpl(url, options) : { ok: true, json: async () => ({ response: { games: [{ appid: 1, name: 'Game' }] } }) };
    },
  });
  if (!firefox) context.importScripts = file => vm.runInContext(source(file), context);
  else vm.runInContext(source('lib/normalize.js'), context);
  vm.runInContext(source('background.js'), context);
  state.request = message => new Promise(resolve => {
    state.listenerResult = listener(message, { id: chrome.runtime.id }, response => resolve(JSON.parse(JSON.stringify(response))));
  });
  state.untrusted = message => listener(message, { id: 'another-extension' }, () => { state.untrustedResponse = true; });
  state.install = installed;
  return state;
}

export function page(html, url = 'https://www.humblebundle.com/games/test') {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const timers = new Map();
  let nextTimer = 0;
  window.setTimeout = (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; };
  window.clearTimeout = id => timers.delete(id);
  async function runTimers(delay) {
    const batch = [...timers].filter(([, timer]) => delay === undefined || timer.delay === delay);
    for (const [id, timer] of batch) {
      if (!timers.delete(id)) continue;
      timer.fn();
    }
    await flush();
  }
  async function settle() {
    await flush();
    for (let i = 0; timers.size && i < 12; i++) await runTimers();
    if (timers.size) throw new Error('DOM work did not settle after 12 timer cycles');
  }
  return { dom, window, document: window.document, timers, runTimers, settle, close: () => window.close() };
}

export async function content({ html, url, owned = ['game'], sendMessage, badges = false } = {}) {
  const state = page(html, url);
  state.owned = owned;
  state.requests = 0;
  state.scans = 0;
  state.window.chrome = {
    runtime: { sendMessage: message => {
      state.requests++;
      return sendMessage ? sendMessage(message) : Promise.resolve({ owned: state.owned });
    } },
    storage: { onChanged: { addListener(fn) { state.storageChanged = fn; } } },
  };
  state.window.eval(source('lib/normalize.js'));
  const normalize = state.window.normalizeTitle;
  state.window.normalizeTitle = title => { state.scans++; return normalize(title); };
  state.window.eval(source('content.js'));
  if (badges) state.window.eval(source('content-choice-badges.js'));
  await state.settle();
  return state;
}

export const card = (title, id = '') => `<article id="${id}" style="position:static"><img alt="${title}"><h3>${title}</h3></article>`;
export const bundle = cards => `<h1>Bundle</h1><section class="js-desktop-tiers-view">${cards}</section>`;
