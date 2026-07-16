import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { TEXT_ENCODING } from '../platform.constants.js';

const UI_ASSET_ROOT = 'src/serve/assets';
const UI_ASSET_SUFFIXES = ['.html', '.js', '.css'];
// U+00C3 ('Ã') followed by a UTF-8 continuation byte is the signature of UTF-8
// text decoded as a single-byte encoding and re-encoded as UTF-8 (mojibake).
// Decoded as Latin-1 the byte stays in U+0080..U+00BF; decoded as Windows-1252,
// bytes 0x80..0x9F become printable code points above U+00BF (e.g. 0x9A -> U+0161
// 'š', the 'Ãš' instance that motivated this gate). Bytes CP1252 leaves undefined
// (0x81, 0x8D, 0x8F, 0x90, 0x9D) map to themselves, inside the Latin-1 range.
const MOJIBAKE_LEAD = 'Ã';
const UTF8_CONTINUATION_MIN = 0x80;
const UTF8_CONTINUATION_MAX = 0xbf;
const CP1252_CONTINUATION_PRINTABLES: ReadonlySet<number> = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
const NOT_FOUND = -1;
const MIN_UI_ASSET_COUNT = 1;

function isMojibakeContinuation(code: number): boolean {
  return (code >= UTF8_CONTINUATION_MIN && code <= UTF8_CONTINUATION_MAX)
    || CP1252_CONTINUATION_PRINTABLES.has(code);
}

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
    if (isMojibakeContinuation(next)) {
      return true;
    }
    from = index + 1;
  }
}

test('static UI assets contain no double-encoded UTF-8 sequences', () => {
  const assets = collectUiAssetPaths();
  assert.ok(assets.length >= MIN_UI_ASSET_COUNT, 'expected UI assets under src/serve/assets');
  for (const asset of assets) {
    const content = readFileSync(asset, TEXT_ENCODING.UTF8);
    assert.ok(!containsDoubleEncodedUtf8(content), `${asset} contains a double-encoded UTF-8 sequence`);
  }
});

test('double-encoded UTF-8 detector flags corrupted text and accepts clean text', () => {
  assert.ok(containsDoubleEncodedUtf8('integraciÃ³n'));
  assert.ok(containsDoubleEncodedUtf8('Ãšltimo'));
  assert.ok(containsDoubleEncodedUtf8('Ãœ'));
  assert.ok(!containsDoubleEncodedUtf8('integración'));
  assert.ok(!containsDoubleEncodedUtf8('Último'));
  assert.ok(!containsDoubleEncodedUtf8('plain ascii'));
});
