import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync('lib/normalize.js', 'utf8');
const normalizeTitle = new vm.Script(`${source}\nnormalizeTitle;`).runInNewContext({});

test('normalizes trademarks, punctuation, accents, and whitespace', () => {
  assert.equal(normalizeTitle('  Café   &   Sanctuary™  '), 'cafe and sanctuary');
  assert.equal(normalizeTitle("Sid Meier's Civilization® VI"), 'sid meiers civilization vi');
});

test('removes common edition suffixes', () => {
  assert.equal(normalizeTitle('Batman: Arkham City - Game of the Year Edition'), 'batman arkham city');
  assert.equal(normalizeTitle('Dishonored Definitive Edition'), 'dishonored');
  assert.equal(normalizeTitle("Director's Cut"), '');
});
