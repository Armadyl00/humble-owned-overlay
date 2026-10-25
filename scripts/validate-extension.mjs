import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXPECTED_PERMISSIONS = ['storage'];
const EXPECTED_HOST_PERMISSIONS = [
  'https://www.humblebundle.com/*',
  'https://api.steampowered.com/*'
];
const EXPECTED_CONTENT_MATCHES = ['https://www.humblebundle.com/*'];
const EXPECTED_ACTION_TITLE = 'Open Humble Bundle Owned Overlay options';

export function createBrowserManifest(manifest, browser) {
  assert(browser === 'chrome' || browser === 'firefox', `Unknown browser: ${browser}`);
  const result = structuredClone(manifest);
  if (browser === 'firefox') {
    result.background = { scripts: ['lib/normalize.js', 'background.js'] };
    result.browser_specific_settings = {
      gecko: {
        id: 'humble-owned-overlay@armadyl.work',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['authenticationInfo', 'personallyIdentifyingInfo'] }
      },
      gecko_android: { strict_min_version: '142.0' }
    };
  }
  return result;
}

export function validateExtension(root = process.cwd(), { browser = 'chrome', manifest = readJson(root, 'manifest.json') } = {}) {
  const releaseFiles = new Set(['manifest.json', 'LICENSE']);

  assert(manifest.manifest_version === 3, 'manifest_version must be 3');
  assert(typeof manifest.name === 'string' && manifest.name.trim(), 'manifest name is required');
  assert(/^\d+\.\d+\.\d+$/.test(manifest.version || ''), 'manifest version must be x.y.z');
  assert(typeof manifest.description === 'string' && manifest.description.trim(), 'manifest description is required');
  if (fs.existsSync(path.join(root, 'package.json'))) {
    assert(readJson(root, 'package.json').version === manifest.version, 'package and manifest versions must match');
  }
  assertSameMembers('permissions', manifest.permissions, EXPECTED_PERMISSIONS);
  assertSameMembers('host_permissions', manifest.host_permissions, EXPECTED_HOST_PERMISSIONS);
  assert(manifest.action?.default_title === EXPECTED_ACTION_TITLE, `action.default_title must be: ${EXPECTED_ACTION_TITLE}`);
  if (manifest.action?.default_popup) {
    const popupPage = manifest.action.default_popup;
    assert(typeof popupPage === 'string' && popupPage.endsWith('.html'), 'action.default_popup must be an HTML file');
    assertFile(root, popupPage, 'action popup');
    releaseFiles.add(popupPage);
    collectHtmlScripts(root, popupPage).forEach(file => releaseFiles.add(file));
  }

  let backgrounds;
  if (browser === 'firefox') {
    assert(!manifest.background?.service_worker, 'Firefox must not declare background.service_worker');
    assert(JSON.stringify(manifest.background?.scripts) === JSON.stringify(['lib/normalize.js', 'background.js']),
      'Firefox background.scripts must load lib/normalize.js before background.js');
    const gecko = manifest.browser_specific_settings?.gecko;
    assert(gecko?.id === 'humble-owned-overlay@armadyl.work', 'Firefox extension ID must remain stable');
    assert(gecko?.strict_min_version === '140.0', 'Firefox minimum version must be 140.0');
    assert(manifest.browser_specific_settings.gecko_android?.strict_min_version === '142.0',
      'Firefox Android minimum version must be 142.0 for built-in data consent');
    assertSameMembers('Firefox data collection permissions', gecko?.data_collection_permissions?.required,
      ['authenticationInfo', 'personallyIdentifyingInfo']);
    backgrounds = manifest.background.scripts;
  } else {
    assert(browser === 'chrome', `Unknown browser: ${browser}`);
    const background = manifest.background?.service_worker;
    assert(typeof background === 'string' && background.endsWith('.js'), 'background.service_worker must be a JS file');
    assert(!manifest.background.scripts && !manifest.browser_specific_settings, 'Chrome manifest must not contain Firefox-specific keys');
    backgrounds = [background];
  }
  for (const background of backgrounds) {
    assertFile(root, background, `background script ${background}`);
    releaseFiles.add(background);
    collectImportScripts(root, background).forEach(file => releaseFiles.add(file));
  }

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
    const sourceManifest = readJson(process.cwd(), 'manifest.json');
    for (const browser of ['chrome', 'firefox']) {
      const { manifest, releaseFiles } = validateExtension(process.cwd(), {
        browser, manifest: createBrowserManifest(sourceManifest, browser)
      });
      console.log(`Validated ${browser}: ${manifest.name} v${manifest.version}`);
      console.log(`Release files: ${releaseFiles.join(', ')}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
