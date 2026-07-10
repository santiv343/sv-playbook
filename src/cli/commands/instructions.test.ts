import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderInstructions } from './instructions.js';

test('instructions renders the cold-start mirrors from a single source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-instructions-'));
  const configPath = join(root, 'playbook.config.json');
  await writeFile(configPath, JSON.stringify({ productName: 'TestProduct' }), 'utf8');

  await renderInstructions({ root });

  const agentsContent = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.ok(agentsContent.includes('TestProduct'), 'AGENTS.md should contain productName');

  let foundMirror = false;
  for (const harness of ['CLAUDE.md']) {
    try {
      await access(join(root, harness));
      const mirrorContent = await readFile(join(root, harness), 'utf8');
      assert.ok(mirrorContent.includes('TestProduct'), `${harness} should contain productName`);
      foundMirror = true;
      break;
    } catch {
      // mirror may not exist yet
    }
  }
  assert.ok(foundMirror, 'at least one harness mirror should exist');
});
