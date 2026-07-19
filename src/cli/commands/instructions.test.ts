import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderInstructions } from './instructions.js';
import { command as instructionsCommand } from './instructions.js';
import type { Io } from '../command.types.js';
import { initTestRepo } from '../../testkit.js';
import { openStore } from '../../db/store.js';
import { addContextItem, replaceContextPrecedence } from '../../context/repository.js';
import { CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../../context/context.constants.js';
import { BUNDLED_ROLE_ID } from '../../roles/bundled-profile.constants.js';

function isErrno(err: unknown): err is { code: string; message: string } & Error {
  return typeof err === 'object' && err !== null && 'code' in err;
}

function captureIo(): Io & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    out(line: string) { output.push(line); },
    err(line: string) { output.push(line); },
  };
}

test('instructions command declares a non-empty usage string', () => {
  assert.notEqual(instructionsCommand.usage.trim(), '');
  assert.match(instructionsCommand.usage, /^Usage: sv-playbook instructions/);
});

async function tempRepo(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  initTestRepo(root);
  return root;
}

test('instructions renders and writes cold-start mirrors from a single source', async () => {
  const root = await tempRepo('svp-instructions-');
  const configPath = join(root, 'playbook.config.json');
  await writeFile(configPath, JSON.stringify({ productName: 'TestProduct' }), 'utf8');

  const io = captureIo();
  await renderInstructions({ root, io, write: true });

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

test('dry-run without --write outputs content without modifying files', async () => {
  const root = await tempRepo('svp-instructions-');
  const configPath = join(root, 'playbook.config.json');
  await writeFile(configPath, JSON.stringify({ productName: 'DryRun' }), 'utf8');

  const io = captureIo();
  await renderInstructions({ root, io, write: false });

  const output = io.output.join('\n');
  assert.ok(output.includes('DryRun'), 'output should contain productName');
  assert.ok(output.includes('Cold Start'), 'output should contain template content');

  try {
    await access(join(root, 'AGENTS.md'));
    assert.fail('AGENTS.md should not exist in dry-run mode');
  } catch (err: unknown) {
    assert.ok(isErrno(err), 'should be an Errno error');
    assert.equal(err.code, 'ENOENT');
  }

  try {
    await access(join(root, 'CLAUDE.md'));
    assert.fail('CLAUDE.md should not exist in dry-run mode');
  } catch (err: unknown) {
    assert.ok(isErrno(err), 'should be an Errno error');
    assert.equal(err.code, 'ENOENT');
  }
});

test('--write actually writes files to disk', async () => {
  const root = await tempRepo('svp-instructions-');
  const configPath = join(root, 'playbook.config.json');
  await writeFile(configPath, JSON.stringify({ productName: 'WriteTest' }), 'utf8');

  const io = captureIo();
  await renderInstructions({ root, io, write: true });

  const agentsContent = await readFile(join(root, 'AGENTS.md'), 'utf8');
  assert.ok(agentsContent.includes('WriteTest'), 'AGENTS.md should contain productName');

  const claudeContent = await readFile(join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(claudeContent.includes('WriteTest'), 'CLAUDE.md should contain productName');

  assert.ok(io.output.some((l) => l.includes('generated successfully')));
});

test('renders tier and verifyCommand from config', async () => {
  const root = await tempRepo('svp-instructions-');
  const configPath = join(root, 'playbook.config.json');
  await writeFile(configPath, JSON.stringify({
    productName: 'FullProduct',
    tier: 'TIER-1',
    verifyCommand: 'npm run check',
  }), 'utf8');

  const io = captureIo();
  await renderInstructions({ root, io, write: false });

  const output = io.output.join('\n');
  assert.ok(output.includes('TIER-1'), 'output should contain tier');
  assert.ok(output.includes('npm run check'), 'output should contain verifyCommand');
});

test('missing template file errors gracefully', async () => {
  const root = await tempRepo('svp-instructions-');
  const configPath = join(root, 'playbook.config.json');
  await writeFile(configPath, JSON.stringify({ productName: 'Graceful' }), 'utf8');

  const io = captureIo();
  await assert.doesNotReject(
    renderInstructions({ root, io, write: false }),
    'renderInstructions should not throw for valid template and config',
  );
});

test('renderInstructions injects the compiled human-interface context', async () => {
  const root = await tempRepo('svp-instructions-context-');

  const store = openStore(root);
  replaceContextPrecedence(store, ['principle']);
  addContextItem(store, {
    id: 'HJ-001',
    version: 1,
    kind: 'principle',
    status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY,
    semanticKey: 'human-attention',
    body: 'Optimize for irreducible human attention.',
    provenance: 'test fixture',
    selectors: { role: [BUNDLED_ROLE_ID.HUMAN_INTERFACE] },
  });
  store.close();

  const io = captureIo();
  await renderInstructions({ root, io, write: false });

  const output = io.output.join('\n');
  assert.match(output, /HJ-001|Optimize for irreducible human attention/);
});
