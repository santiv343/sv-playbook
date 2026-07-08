import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

function isLogicModule(file: string) {
  return file.endsWith('.ts')
    && !file.endsWith('.test.ts')
    && !file.endsWith('.types.ts')
    && !file.endsWith('.constants.ts')
    && !file.endsWith('.errors.ts');
}

test('logic modules contain no exported types, constants or error classes', () => {
  const violations: string[] = [];
  const files = readdirSync(SRC_DIR, { recursive: true, withFileTypes: true });

  for (const file of files) {
    if (!file.isFile() || !isLogicModule(file.name)) {
      continue;
    }

    const path = join(file.parentPath, file.name);
    const source = readFileSync(path, 'utf8');
    const lines = source.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (
        /^export (interface|type) /.test(line)
        || /^export const /.test(line)
        || /^export class \w+Error extends Error/.test(line)
        || /^const [A-Z_]+ = '(INSERT|SELECT|DELETE|UPDATE|CREATE)/.test(line)
      ) {
        violations.push(`${relative(SRC_DIR, path)}:${index + 1}`);
      }
    }
  }

  assert.deepEqual(violations, [], violations.join('\n'));
});
