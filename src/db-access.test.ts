import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

test('no source file outside src/db opens the sqlite store directly', () => {
  const violations: string[] = [];
  const files = readdirSync(SRC_DIR, { recursive: true, withFileTypes: true });

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith('.ts')) continue;
    const path = join(file.parentPath, file.name);
    const rel = relative(SRC_DIR, path).replace(/\\/g, '/');
    if (rel.startsWith('db/') || file.name.endsWith('.test.ts')) continue;

    const source = readFileSync(path, 'utf8');
    const lines = source.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (
        /from ['"]node:sqlite['"]/.test(line)
        || /\bDatabaseSync\b/.test(line)
      ) {
        violations.push(`${rel}:${index + 1}`);
      }
    }
  }

  assert.deepEqual(violations, [], violations.join('\n'));
});
