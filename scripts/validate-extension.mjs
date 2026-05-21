import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXPECTED_PERMISSIONS = ['storage'];
const EXPECTED_HOST_PERMISSIONS = [
  'https://www.humblebundle.com/*',
  'https://api.steampowered.com/*'
];
const EXPECTED_CONTENT_MATCHES = ['https://www.humblebundle.com/*'];

export function validateExtension(root = process.cwd()) {
  const releaseFiles = new Set(['manifest.json', 'LICENSE']);
  const manifest = readJson(root, 'manifest.json');

  assert(manifest.manifest_version === 3, 'manifest_version must be 3');
  assert(typeof manifest.name === 'string' && manifest.name.trim(), 'manifest name is required');
  assert(/^\d+\.\d+\.\d+$/.test(manifest.version || ''), 'manifest version must be x.y.z');
  assert(typeof manifest.description === 'string' && manifest.description.trim(), 'manifest description is required');
  assertSameMembers('permissions', manifest.permissions, EXPECTED_PERMISSIONS);
  assertSameMembers('host_permissions', manifest.host_permissions, EXPECTED_HOST_PERMISSIONS);

  const background = manifest.background?.service_worker;
  assert(typeof background === 'string' && background.endsWith('.js'), 'background.service_worker must be a JS file');
  assertFile(root, background, 'background service worker');
  releaseFiles.add(background);
  collectImportScripts(root, background).forEach(file => releaseFiles.add(file));

  assert(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0, 'content_scripts must not be empty');
  for (const [index, script] of manifest.content_scripts.entries()) {
    assertSameMembers(`content_scripts[${index}].matches`, script.matches, EXPECTED_CONTENT_MATCHES);
    assert(script.run_at === 'document_idle', `content_scripts[${index}].run_at must be document_idle`);
    for (const jsFile of script.js || []) {
      assertFile(root, jsFile, `content script JS ${jsFile}`);
      releaseFiles.add(jsFile);
    }
    for (const cssFile of script.css || []) {
      assertFile(root, cssFile, `content script CSS ${cssFile}`);
      releaseFiles.add(cssFile);
    }
  }

  const optionsPage = manifest.options_ui?.page;
  assert(typeof optionsPage === 'string' && optionsPage.endsWith('.html'), 'options_ui.page must be an HTML file');
  assertFile(root, optionsPage, 'options page');
  releaseFiles.add(optionsPage);
  collectHtmlScripts(root, optionsPage).forEach(file => releaseFiles.add(file));

  for (const file of releaseFiles) {
    assertFile(root, file, `release file ${file}`);
  }

  return { manifest, releaseFiles: [...releaseFiles].sort() };
}

function readJson(root, relPath) {
  try {
    return JSON.parse(fs.readFileSync(resolveRepoPath(root, relPath), 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse ${relPath}: ${error.message}`);
  }
}

function collectImportScripts(root, relPath) {
  const source = fs.readFileSync(resolveRepoPath(root, relPath), 'utf8');
  const files = new Set();
  const pattern = /importScripts\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(source))) {
    for (const rawPart of match[1].split(',')) {
      const cleaned = rawPart.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned) {
        assert(!cleaned.startsWith('http'), `remote importScripts URL is not allowed: ${cleaned}`);
        assertFile(root, cleaned, `importScripts file ${cleaned}`);
        files.add(cleaned);
      }
    }
  }
  return files;
}

function collectHtmlScripts(root, relPath) {
  const html = fs.readFileSync(resolveRepoPath(root, relPath), 'utf8');
  const files = new Set();
  const pattern = /<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const src = match[1].trim();
    assert(!src.startsWith('http'), `remote options script is not allowed: ${src}`);
    assertFile(root, src, `options script ${src}`);
    files.add(src);
  }
  return files;
}

function assertSameMembers(name, actual, expected) {
  assert(Array.isArray(actual), `${name} must be an array`);
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  assert(
    JSON.stringify(actualSorted) === JSON.stringify(expectedSorted),
    `${name} must be exactly: ${expectedSorted.join(', ')}`
  );
}

function assertFile(root, relPath, label) {
  const fullPath = resolveRepoPath(root, relPath);
  assert(fs.existsSync(fullPath) && fs.statSync(fullPath).isFile(), `${label} is missing: ${relPath}`);
}

function resolveRepoPath(root, relPath) {
  assert(typeof relPath === 'string' && relPath.trim(), 'file path must be a non-empty string');
  assert(!path.isAbsolute(relPath), `absolute paths are not allowed: ${relPath}`);
  const normalized = path.normalize(relPath);
  assert(!normalized.startsWith('..') && !path.isAbsolute(normalized), `path escapes repository root: ${relPath}`);
  return path.join(root, normalized);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href && process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { manifest, releaseFiles } = validateExtension();
    console.log(`Validated ${manifest.name} v${manifest.version}`);
    console.log(`Release files: ${releaseFiles.join(', ')}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
