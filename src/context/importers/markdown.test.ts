import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMarkdownSection } from './markdown.js';

test('Markdown migration adapter extracts exactly one heading subtree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-md-context-'));
  const path = join(root, 'source.md');
  await writeFile(path, '# Root\n\n## One\nA\n\n### Child\nB\n\n## Two\nC\n');
  assert.equal(readMarkdownSection(path, 'One'), '## One\nA\n\n### Child\nB\n');
});
