import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { TEXT_ENCODING } from '../platform.constants.js';

const UI_ASSET_ROOT = 'content/ui';
const UI_ASSET_SUFFIXES = ['.html', '.js', '.css'];
// U+00C3 ('Ã') followed by a UTF-8 continuation byte (U+0080..U+00BF) is the
// signature of UTF-8 text decoded as Latin-1 and re-encoded as UTF-8 (mojibake).
const MOJIBAKE_LEAD = 'Ã';
const UTF8_CONTINUATION_MIN = 0x80;
const UTF8_CONTINUATION_MAX = 0xbf;
const NOT_FOUND = -1;
const MIN_UI_ASSET_COUNT = 1;

function collectUiAssetPaths(): string[] {
  return readdirSync(UI_ASSET_ROOT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => UI_ASSET_SUFFIXES.some((suffix) => path.endsWith(suffix)))
    .sort((left, right) => left.localeCompare(right));
}

function containsDoubleEncodedUtf8(content: string): boolean {
  let from = 0;
  for (;;) {
    const index = content.indexOf(MOJIBAKE_LEAD, from);
    if (index === NOT_FOUND || index + 1 >= content.length) {
      return false;
    }
    const next = content.charCodeAt(index + 1);
    if (next >= UTF8_CONTINUATION_MIN && next <= UTF8_CONTINUATION_MAX) {
      return true;
    }
    from = index + 1;
  }
}

test('static UI assets contain no double-encoded UTF-8 sequences', () => {
  const assets = collectUiAssetPaths();
  assert.ok(assets.length >= MIN_UI_ASSET_COUNT, 'expected UI assets under content/ui');
  for (const asset of assets) {
    const content = readFileSync(asset, TEXT_ENCODING.UTF8);
    assert.ok(!containsDoubleEncodedUtf8(content), `${asset} contains a double-encoded UTF-8 sequence`);
  }
});

test('double-encoded UTF-8 detector flags corrupted text and accepts clean text', () => {
  assert.ok(containsDoubleEncodedUtf8('integraciÃ³n'));
  assert.ok(!containsDoubleEncodedUtf8('integración'));
  assert.ok(!containsDoubleEncodedUtf8('plain ascii'));
});
