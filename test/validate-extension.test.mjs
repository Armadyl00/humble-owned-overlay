import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createBrowserManifest, validateExtension } from '../scripts/validate-extension.mjs';

test('validates the current extension manifest', () => {
  const { manifest, releaseFiles } = validateExtension(process.cwd());
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, JSON.parse(fs.readFileSync('package.json', 'utf8')).version);
  assert.deepEqual(releaseFiles, [
    'LICENSE',
    'background.js',
    'content-choice-badges.js',
    'content.css',
    'content.js',
    'icons/icon-128.png',
    'icons/icon-16.png',
    'icons/icon-32.png',
    'icons/icon-48.png',
    'icons/icon-96.png',
    'lib/normalize.js',
    'manifest.json',
    'options.html',
    'options.js',
    'popup.html',
    'popup.js'
  ]);
});

test('fails when a referenced content script is missing', t => {
  const root = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(path.join(root, 'content.js'));
  assert.throws(() => validateExtension(root), /content script JS content\.js is missing/);
});

test('both browser packages require their declared extension and toolbar icons', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hbo-icons-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { releaseFiles, manifest } = validateExtension();
  for (const file of releaseFiles) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(file, path.join(root, file));
  }
  for (const icon of ['icons/icon-128.png', 'icons/icon-16.png']) {
    fs.rmSync(path.join(root, icon));
    for (const browser of ['chrome', 'firefox']) {
      assert.throws(() => validateExtension(root, { browser, manifest: createBrowserManifest(manifest, browser) }), /icons.*is missing/);
    }
    fs.copyFileSync(icon, path.join(root, icon));
  }
});

test('toolbar popup and its script are required when declared in either browser', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hbo-popup-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { releaseFiles } = validateExtension();
  for (const file of releaseFiles) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(file, path.join(root, file));
  }
  const source = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  fs.rmSync(path.join(root, 'popup.js'));
  for (const browser of ['chrome', 'firefox']) {
    assert.throws(() => validateExtension(root, { browser, manifest: createBrowserManifest(source, browser) }), /popup\.js is missing/);
  }
  fs.copyFileSync('popup.js', path.join(root, 'popup.js'));
  fs.rmSync(path.join(root, 'popup.html'));
  for (const browser of ['chrome', 'firefox']) {
    assert.throws(() => validateExtension(root, { browser, manifest: createBrowserManifest(source, browser) }), /action popup is missing/);
  }
});

test('fails when host permissions drift', t => {
  const root = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions.push('https://example.com/*');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(() => validateExtension(root), /host_permissions must be exactly/);
});

test('Firefox manifest changes only the background and browser metadata', () => {
  const original = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const firefox = createBrowserManifest(original, 'firefox');
  const chrome = createBrowserManifest(original, 'chrome');
  assert.deepEqual(chrome, original);
  assert.deepEqual(firefox.content_scripts, chrome.content_scripts);
  assert.deepEqual(firefox.permissions, chrome.permissions);
  assert.deepEqual(firefox.host_permissions, chrome.host_permissions);
  assert.deepEqual(firefox.options_ui, chrome.options_ui);
  assert.deepEqual(firefox.action, chrome.action);
  assert.deepEqual(firefox.background.scripts, ['lib/normalize.js', 'background.js']);
  assert.equal(firefox.background.service_worker, undefined);
  assert.equal(original.browser_specific_settings, undefined);
  assert.deepEqual(validateExtension(process.cwd(), { browser: 'firefox', manifest: firefox }).releaseFiles,
    validateExtension().releaseFiles);
});

test('Firefox validation rejects a worker, reversed loading order, or missing data declarations', () => {
  const original = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  for (const modify of [
    manifest => { manifest.background.service_worker = 'background.js'; },
    manifest => { manifest.background.scripts.reverse(); },
    manifest => { delete manifest.browser_specific_settings.gecko.data_collection_permissions; },
  ]) {
    const manifest = createBrowserManifest(original, 'firefox');
    modify(manifest);
    assert.throws(() => validateExtension(process.cwd(), { browser: 'firefox', manifest }));
  }
});

test('package and manifest versions must agree', t => {
  const root = makeFixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.0.0' }));
  assert.throws(() => validateExtension(root), /versions must match/);
});

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hbo-validate-'));
  fs.mkdirSync(path.join(root, 'lib'));
  fs.writeFileSync(path.join(root, 'LICENSE'), 'MIT\n');
  fs.writeFileSync(path.join(root, 'background.js'), "importScripts('lib/normalize.js');\n");
  fs.writeFileSync(path.join(root, 'content.js'), '// content\n');
  fs.writeFileSync(path.join(root, 'content-choice-badges.js'), '// choice badges\n');
  fs.writeFileSync(path.join(root, 'content.css'), '/* css */\n');
  fs.writeFileSync(path.join(root, 'lib', 'normalize.js'), '// normalize\n');
  fs.writeFileSync(path.join(root, 'options.js'), '// options\n');
  fs.writeFileSync(path.join(root, 'options.html'), '<script src="options.js"></script>\n');
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify({
    manifest_version: 3,
    name: 'Humble Bundle Owned Overlay',
    version: '3.4.6',
    description: 'Shows which games in a Humble Bundle you already own on Steam.',
    permissions: ['storage'],
    host_permissions: [
      'https://www.humblebundle.com/*',
      'https://api.steampowered.com/*'
    ],
    action: {
      default_title: 'Open Humble Bundle Owned Overlay options'
    },
    background: { service_worker: 'background.js' },
    content_scripts: [{
      matches: ['https://www.humblebundle.com/*'],
      js: ['lib/normalize.js', 'content.js', 'content-choice-badges.js'],
      css: ['content.css'],
      run_at: 'document_idle'
    }],
    options_ui: { page: 'options.html', open_in_tab: true }
  }, null, 2)}\n`);
  return root;
}
