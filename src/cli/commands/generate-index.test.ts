import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateIndex } from './generate-index.js';

test('generated command identifiers are valid for hyphenated and reserved command names', () => {
  const directory = mkdtempSync(join(tmpdir(), 'svp-command-index-'));
  writeFileSync(join(directory, 'execution-profile.ts'), '', 'utf8');
  writeFileSync(join(directory, 'import.ts'), '', 'utf8');
  const output = join(directory, 'index.gen.ts');
  generateIndex(directory, output);
  const generated = readFileSync(output, 'utf8');
  assert.match(generated, /command as execution_profile/);
  assert.match(generated, /command as import_/);
});
