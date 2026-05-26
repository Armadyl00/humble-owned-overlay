import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateExtension } from '../scripts/validate-extension.mjs';

test('validates the current extension manifest', () => {
  const { manifest, releaseFiles } = validateExtension(process.cwd());
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '3.4.2');
  assert.deepEqual(releaseFiles, [
    'LICENSE',
    'background.js',
    'content-choice-badges.js',
    'content.css',
    'content.js',
    'lib/normalize.js',
    'manifest.json',
    'options.html',
    'options.js',
    'popup.html',
    'popup.js'
  ]);
});

test('fails when a referenced content script is missing', () => {
  const root = makeFixture();
  fs.rmSync(path.join(root, 'content.js'));
  assert.throws(() => validateExtension(root), /content script JS content\.js is missing/);
});

test('fails when host permissions drift', () => {
  const root = makeFixture();
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions.push('https://example.com/*');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(() => validateExtension(root), /host_permissions must be exactly/);
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
    version: '3.4.2',
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
