import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import test from 'node:test';
import { buildRelease, getReleaseTag } from '../scripts/build-release.mjs';
import { validateExtension } from '../scripts/validate-extension.mjs';

test('both browser builds contain complete runnable files and survive independent rebuilds', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hbo-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { releaseFiles } = validateExtension();
  for (const file of [...releaseFiles, 'package.json']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(file, path.join(root, file));
  }
  const chrome = buildRelease({ root, browser: 'chrome', env: {} });
  const firefox = buildRelease({ root, browser: 'firefox', env: {} });
  assert.ok(fs.existsSync(chrome.zipPath));
  assert.ok(fs.existsSync(firefox.zipPath));
  for (const result of [chrome, firefox]) {
    const files = readZip(fs.readFileSync(result.zipPath));
    assert.deepEqual([...files.keys()].sort(), releaseFiles);
    assert.equal(JSON.parse(files.get('manifest.json')).version, result.manifest.version);
    for (const file of releaseFiles.filter(file => file !== 'manifest.json')) {
      assert.deepEqual(files.get(file), fs.readFileSync(file));
    }
    validateExtension(result.targetDir, { browser: result.browser });
  }
  const before = fs.readFileSync(chrome.zipPath);
  buildRelease({ root, browser: 'chrome', env: {} });
  assert.deepEqual(fs.readFileSync(chrome.zipPath), before);
  assert.ok(fs.existsSync(path.join(firefox.targetDir, 'manifest.json')));
  assert.ok(fs.existsSync(firefox.zipPath));
});

test('release tags are checked while normal CI branch names are accepted', () => {
  assert.equal(getReleaseTag('3.3.10', { GITHUB_REF_NAME: 'main', GITHUB_REF_TYPE: 'branch' }), 'v3.3.10');
  assert.equal(getReleaseTag('3.3.10', { RELEASE_TAG: 'v3.3.10-canary.1' }), 'v3.3.10-canary.1');
  assert.throws(() => getReleaseTag('3.3.10', { RELEASE_TAG: 'v3.3.9' }), /does not match/);
  assert.throws(() => getReleaseTag('3.3.10', { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'bad-tag' }), /must look like/);
  assert.throws(() => buildRelease({ browser: 'unknown' }), /Unknown browser/);
});

function readZip(buffer) {
  const files = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 8), 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const originalSize = buffer.readUInt32LE(offset + 22);
    const nameSize = buffer.readUInt16LE(offset + 26);
    const extraSize = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameSize).toString();
    const start = offset + 30 + nameSize + extraSize;
    const content = zlib.inflateRawSync(buffer.subarray(start, start + compressedSize));
    assert.equal(content.length, originalSize);
    files.set(name, content);
    offset = start + compressedSize;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
  return files;
}
