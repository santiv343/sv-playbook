import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openStore } from '../db/store.js';
import { createPacket } from '../tasks/service.js';
import { PREFLIGHT_PHASE } from './preflight.constants.js';
import { runPreflight } from './preflight.js';
import { PREFLIGHT_CHECK_NAME, PREFLIGHT_STATUS } from './preflight.types.js';

function git(root: string, args: readonly string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'pipe' });
}

function gitText(root: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
}

async function initializeRepository(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  return root;
}

test('preflight executes policy from the store-owning project rather than candidate config', async () => {
  const root = await initializeRepository('svp-preflight-trusted-policy-');
  await writeFile(join(root, '.gitignore'), '.prepared\n.svp/\n.svp-session\n', 'utf8');
  await writeFile(join(root, '.prepare.cjs'), "require('node:fs').writeFileSync('.prepared', 'yes');\n", 'utf8');
  await writeFile(join(root, '.verify.cjs'), [
    "const exists = require('node:fs').existsSync('.prepared');",
    'process.exit(exists ? 0 : 9);',
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: 'node .verify.cjs',
    reviewPreflight: { baseReference: 'main', preparationCommand: '', noOutputTimeoutMs: 1_000 },
  }), 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'candidate without preparation policy']);
  const candidateSha = gitText(root, ['rev-parse', 'HEAD']);
  const store = openStore(root);
  createPacket(store, root, {
    id: 'PREFLIGHT-POLICY-001', title: 'Trusted policy fixture', dependsOn: [], writeSet: ['src/**'],
    requirements: [], evidenceRequired: [], tags: [],
  }, '## RED test\ntrusted policy is applied\n\n## Acceptance\nPreparation runs before verification.');
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: 'node .verify.cjs',
    reviewPreflight: {
      baseReference: 'main', preparationCommand: 'node .prepare.cjs', noOutputTimeoutMs: 1_000,
    },
  }), 'utf8');
  git(root, ['add', 'playbook.config.json']);
  git(root, ['commit', '-m', 'activate trusted preparation policy']);
  const candidateWorktree = await mkdtemp(join(tmpdir(), 'svp-preflight-policy-candidate-'));
  await rm(candidateWorktree, { recursive: true, force: true });
  git(root, ['worktree', 'add', '--detach', candidateWorktree, candidateSha]);

  try {
    const report = await runPreflight(store, 'PREFLIGHT-POLICY-001', candidateWorktree, {
      pr: undefined,
      persistEvent: false,
    });
    const preparation = report.cleanVerification.phases.find(
      (phase) => phase.phase === PREFLIGHT_PHASE.PREPARATION,
    );
    assert.equal(preparation?.status, PREFLIGHT_STATUS.PASS);
    assert.equal(report.verifyResult.status, PREFLIGHT_STATUS.PASS);
    assert.equal(report.redTestFound, true);
  } finally {
    git(root, ['worktree', 'remove', '--force', candidateWorktree]);
    store.close();
  }
});

test('preflight fails closed when the trusted base reference is unavailable', async () => {
  const root = await initializeRepository('svp-preflight-missing-base-');
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: '',
    reviewPreflight: { baseReference: 'missing-base', preparationCommand: '', noOutputTimeoutMs: 1_000 },
  }), 'utf8');
  await writeFile(join(root, 'base.txt'), 'base\n', 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  const store = openStore(root);
  createPacket(store, root, {
    id: 'PREFLIGHT-BASE-001', title: 'Missing base fixture', dependsOn: [], writeSet: ['src/**'],
    requirements: [], evidenceRequired: [], tags: [],
  }, '## RED test\nmissing base fails closed\n\n## Acceptance\nPreflight fails.');

  const report = await runPreflight(store, 'PREFLIGHT-BASE-001', root, {
    pr: undefined,
    persistEvent: false,
  });
  const baseReference = report.checks.find(
    (check) => check.name === PREFLIGHT_CHECK_NAME.BASE_REFERENCE,
  );

  assert.equal(baseReference?.status, PREFLIGHT_STATUS.FAIL);
  assert.equal(report.overall, PREFLIGHT_STATUS.FAIL);
  store.close();
});
