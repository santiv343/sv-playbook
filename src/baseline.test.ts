import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkViolation } from './baseline.js';

test('a baselined fingerprint is grandfathered while an unknown one fails', () => {
  const baseline = { fingerprints: ['docs/packets/OLD-001.md'] };
  assert.equal(checkViolation('docs/packets/OLD-001.md', baseline), 'grandfathered');
  assert.equal(checkViolation('docs/packets/NEW-001.md', baseline), 'failing');
});

test('undefined baseline treats every packet as failing', () => {
  assert.equal(checkViolation('docs/packets/X.md', undefined), 'failing');
});

test('empty fingerprints baseline treats every packet as failing', () => {
  const baseline = { fingerprints: [] };
  assert.equal(checkViolation('docs/packets/X.md', baseline), 'failing');
});

// Every process.cwd() in production code must be in an adapter-owned file that
// bridges the ExecutionContext system with the Node.js runtime environment.
// Adapter files: runtime/context.ts (getCwd fallback), daemon/client.ts (forward fallback).
// All other production code must use getCwd() for testable, scoped resolution.
const ADAPTER_FILES = new Set([
  join('src', 'runtime', 'context.ts'),
  join('src', 'daemon', 'client.ts'),
]);

function* walkProductionFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        yield* walkProductionFiles(full);
      }
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      yield full;
    }
  }
}

test('every process.cwd() in production code is adapter-owned (ExecutionContext audit)', () => {
  const srcDir = fileURLToPath(new URL('..', import.meta.url));
  const violations: string[] = [];
  for (const file of walkProductionFiles(srcDir)) {
    const relative = file.startsWith(srcDir) ? file.slice(srcDir.length) : file;
    if (!relative.startsWith('src' + sep)) continue;
    if (ADAPTER_FILES.has(relative)) continue;
    const content = readFileSync(file, 'utf8');
    if (content.includes('process.cwd()')) {
      violations.push(relative);
    }
  }
  if (violations.length > 0) {
    assert.fail(`process.cwd() must not appear in production code (use getCwd()):\n  ${violations.join('\n  ')}`);
  }
});
