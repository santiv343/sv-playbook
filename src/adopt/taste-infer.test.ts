import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inferTaste } from './taste-infer.js';

test("taste infer proposes conventions from an existing repo's lint and tsconfig", async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-taste-'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { test: 'vitest' } }),
    'utf8',
  );
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
      },
    }),
    'utf8',
  );
  await writeFile(
    join(root, 'eslint.config.js'),
    "import eslint from '@eslint/js';\n" +
    "import tseslint from 'typescript-eslint';\n" +
    'export default tseslint.config(\n' +
    '  eslint.configs.recommended,\n' +
    '  ...tseslint.configs.strictTypeChecked,\n' +
    ');',
    'utf8',
  );

  const conventions = inferTaste(root);

  assert.ok(
    conventions.some(c => c.statement.toLowerCase().includes('strict') && c.confidence === 1.0),
    'should infer strict mode from tsconfig',
  );
  assert.ok(
    conventions.some(c => c.statement.toLowerCase().includes('typescript-eslint')),
    'should infer typescript-eslint from eslint config',
  );
});
