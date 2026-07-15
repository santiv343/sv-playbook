import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openStore } from '../db/store.js';
import { createPacket } from '../tasks/service.js';
import { PREFLIGHT_FAILURE_CODE, PREFLIGHT_PHASE } from './preflight.constants.js';
import { runCleanVerification } from './preflight-clean-verification.js';
import { runPreflight } from './preflight.js';
import {
  PREFLIGHT_CHECK_NAME,
  PREFLIGHT_STATUS,
  type VerifyProcessResult,
} from './preflight.types.js';

const git = (root: string, args: readonly string[]): void => {
  execFileSync('git', args, { cwd: root, stdio: 'pipe' });
};

const gitText = (root: string, args: readonly string[]): string => execFileSync('git', args, {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
}).trim();

const processResult = (overrides: Partial<VerifyProcessResult>): VerifyProcessResult => ({
  exitCode: 0,
  signal: null,
  outputTail: '',
  spawnFailed: false,
  timedOut: false,
  durationMs: 1,
  ...overrides,
});

async function createCleanVerificationFixture(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: 'verify-fixture',
    reviewPreflight: { preparationCommand: '', noOutputTimeoutMs: 1_000 },
  }), 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  return root;
}

test('preflight rejects a verify command that dirties tracked candidate files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, '.gitignore'), '.svp/\n.svp-session\n', 'utf8');
  await writeFile(join(root, 'README.md'), 'clean\n', 'utf8');
  await writeFile(join(root, '.verify-runner.cjs'), [
    "const fs = require('node:fs');",
    "fs.appendFileSync('README.md', 'dirty\\n');",
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: 'node .verify-runner.cjs',
  }), 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);

  const store = openStore(root);
  createPacket(store, root, {
    id: 'PREFLIGHT-001',
    title: 'Preflight fixture',
    dependsOn: [],
    writeSet: ['README.md'],
    requirements: [],
    evidenceRequired: [],
    tags: [],
  }, 'Verify cleanliness.');
  git(root, ['add', 'docs/packets/PREFLIGHT-001.md']);
  git(root, ['commit', '-m', 'task definition']);

  const report = await runPreflight(store, 'PREFLIGHT-001', root, { pr: undefined, persistEvent: false });

  assert.equal(report.verifyResult.status, PREFLIGHT_STATUS.FAIL);
  assert.match(report.verifyResult.detail, new RegExp(PREFLIGHT_FAILURE_CODE.DIRTY_WORKTREE));
  store.close();
});

test('preflight verification leaves the runtime event loop responsive', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200);
    response.end('ok');
  });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('expected a TCP server address');
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-event-loop-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, '.gitignore'), '.svp/\n.svp-session\n', 'utf8');
  await writeFile(join(root, 'README.md'), 'clean\n', 'utf8');
  await writeFile(join(root, '.verify-event-loop.cjs'), [
    "const http = require('node:http');",
    `const request = http.get('http://127.0.0.1:${address.port}', (response) => process.exit(response.statusCode === 200 ? 0 : 2));`,
    "request.setTimeout(500, () => { request.destroy(); process.exit(3); });",
    "request.on('error', () => process.exit(4));",
  ].join('\n'), 'utf8');
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: 'node .verify-event-loop.cjs',
  }), 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  const store = openStore(root);
  createPacket(store, root, {
    id: 'PREFLIGHT-ASYNC-001',
    title: 'Async preflight fixture',
    dependsOn: [],
    writeSet: ['README.md'],
    requirements: [],
    evidenceRequired: [],
    tags: [],
  }, 'Keep the runtime responsive.');
  git(root, ['add', 'docs/packets/PREFLIGHT-ASYNC-001.md']);
  git(root, ['commit', '-m', 'task definition']);

  try {
    const report = await runPreflight(store, 'PREFLIGHT-ASYNC-001', root, { pr: undefined, persistEvent: false });
    assert.equal(report.verifyResult.status, PREFLIGHT_STATUS.PASS);
  } finally {
    store.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => { if (error === undefined) resolve(); else reject(error); });
    });
  }
});

test('preflight does not turn unconfigured token mentions into stop-condition failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-tokens-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, '.gitignore'), '.svp/\n.svp-session\n', 'utf8');
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({ verifyCommand: '' }), 'utf8');
  await writeFile(join(root, 'README.md'), 'base\n', 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  git(root, ['checkout', '-b', 'feature/document-policy']);
  await writeFile(
    join(root, 'policy.ts'),
    "export const documentedTokens = ['console.log', 'TODO', 'FIXME', 'debugger', '.only'];\n",
    'utf8',
  );
  git(root, ['add', 'policy.ts']);
  git(root, ['commit', '-m', 'document DEVIATION and stop tokens']);
  const store = openStore(root);
  createPacket(store, root, {
    id: 'PREFLIGHT-TOKENS-001',
    title: 'Token documentation fixture',
    dependsOn: [],
    writeSet: ['policy.ts'],
    requirements: [],
    evidenceRequired: [],
    tags: [],
  }, 'Do not infer checks from token mentions.');

  const report = await runPreflight(store, 'PREFLIGHT-TOKENS-001', root, { pr: undefined, persistEvent: false });

  assert.equal(report.stopConditions.some((check) => check.status === PREFLIGHT_STATUS.FAIL), false);
  assert.deepEqual(report.deviationBullets, []);
  store.close();
});

test('preflight preparation failure is typed and verification never starts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-prepare-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, '.gitignore'), '.svp/\n.svp-session\n', 'utf8');
  await writeFile(join(root, '.prepare.cjs'), 'process.exit(7);\n', 'utf8');
  await writeFile(join(root, '.verify.cjs'), 'process.exit(0);\n', 'utf8');
  await writeFile(join(root, 'README.md'), 'base\n', 'utf8');
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: 'node .verify.cjs',
    reviewPreflight: { preparationCommand: 'node .prepare.cjs', noOutputTimeoutMs: 1_000 },
  }), 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  const store = openStore(root);
  createPacket(store, root, {
    id: 'PREFLIGHT-PREP-001', title: 'Preparation fixture', dependsOn: [], writeSet: ['README.md'],
    requirements: [], evidenceRequired: [], tags: [],
  }, 'Preparation must pass.');

  const report = await runPreflight(store, 'PREFLIGHT-PREP-001', root, { pr: undefined, persistEvent: false });
  const preparation = report.cleanVerification.phases.find((phase) => phase.phase === PREFLIGHT_PHASE.PREPARATION);
  const verification = report.cleanVerification.phases.find((phase) => phase.phase === PREFLIGHT_PHASE.VERIFICATION);

  assert.ok(preparation);
  assert.ok(verification);
  assert.equal(preparation.failureCode, PREFLIGHT_FAILURE_CODE.PREPARATION_FAILED);
  assert.equal(preparation.exitCode, 7);
  assert.equal(verification.status, PREFLIGHT_STATUS.SKIP);
  assert.equal(report.verifyResult.status, PREFLIGHT_STATUS.FAIL);
  store.close();
});

test('preflight reads RED acceptance from the durable work definition when packet markdown is absent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-red-store-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, '.gitignore'), '.svp/\n.svp-session\n', 'utf8');
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({ verifyCommand: '' }), 'utf8');
  await writeFile(join(root, 'base.txt'), 'base\n', 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  const store = openStore(root);
  createPacket(store, root, {
    id: 'PREFLIGHT-RED-001', title: 'Durable RED fixture', dependsOn: [], writeSet: ['src.ts'],
    requirements: [], evidenceRequired: [], tags: [],
  }, '## RED test\ncriteria remain authoritative without being copied into code\n\n## Acceptance\nThe change is reviewed.');
  git(root, ['checkout', '-b', 'feature/durable-red']);
  await writeFile(join(root, 'src.ts'), 'export const implemented = true;\n', 'utf8');
  git(root, ['add', 'src.ts']);
  git(root, ['commit', '-m', 'add durable RED marker']);

  const report = await runPreflight(store, 'PREFLIGHT-RED-001', root, { pr: undefined, persistEvent: false });

  assert.equal(report.redTestFound, true);
  assert.equal(report.checks.find((check) => check.name === PREFLIGHT_CHECK_NAME.RED_TEST)?.status, PREFLIGHT_STATUS.PASS);
  store.close();
});

test('preflight executes policy from the store-owning project rather than candidate config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-trusted-policy-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
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

test('invalid clean-worktree configuration returns a typed system failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-config-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: '',
    reviewPreflight: { preparationCommand: '', noOutputTimeoutMs: 0 },
  }), 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);

  const receipt = await runCleanVerification(root);
  const configuration = receipt.phases.find((phase) => phase.phase === PREFLIGHT_PHASE.CONFIGURATION);

  assert.equal(receipt.status, PREFLIGHT_STATUS.FAIL);
  assert.equal(configuration?.failureCode, PREFLIGHT_FAILURE_CODE.SYSTEM_FAILED);
});

test('clean-worktree cleanup failure is typed and forces the receipt to fail', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-cleanup-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({ verifyCommand: '' }), 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);

  const receipt = await runCleanVerification(root, {
    removeWorktree(sourceWorktree, cleanWorktree): void {
      git(sourceWorktree, ['worktree', 'remove', '--force', cleanWorktree]);
      throw new Error('cleanup receipt fixture');
    },
  });
  const cleanup = receipt.phases.find((phase) => phase.phase === PREFLIGHT_PHASE.CLEANUP);

  assert.equal(receipt.status, PREFLIGHT_STATUS.FAIL);
  assert.equal(cleanup?.failureCode, PREFLIGHT_FAILURE_CODE.CLEANUP_FAILED);
});

test('clean receipt binds a non-zero verification exit to verification failure', async () => {
  const root = await createCleanVerificationFixture('svp-preflight-verification-failure-');

  const receipt = await runCleanVerification(root, {
    executeCommand: () => Promise.resolve(processResult({ exitCode: 9, outputTail: 'verification failed' })),
  });
  const verification = receipt.phases.find((phase) => phase.phase === PREFLIGHT_PHASE.VERIFICATION);

  assert.equal(receipt.status, PREFLIGHT_STATUS.FAIL);
  assert.ok(verification);
  assert.equal(verification.failureCode, PREFLIGHT_FAILURE_CODE.VERIFICATION_FAILED);
  assert.equal(verification.exitCode, 9);
});

test('clean receipt maps command inactivity onto its typed failure code', async () => {
  const root = await createCleanVerificationFixture('svp-preflight-inactivity-');

  const receipt = await runCleanVerification(root, {
    executeCommand: () => Promise.resolve(processResult({ timedOut: true, signal: 'SIGKILL' })),
  });
  const verification = receipt.phases.find((phase) => phase.phase === PREFLIGHT_PHASE.VERIFICATION);

  assert.equal(receipt.status, PREFLIGHT_STATUS.FAIL);
  assert.equal(verification?.failureCode, PREFLIGHT_FAILURE_CODE.INACTIVITY_TIMEOUT);
});

test('clean receipt maps process spawn failure onto its typed failure code', async () => {
  const root = await createCleanVerificationFixture('svp-preflight-spawn-failure-');

  const receipt = await runCleanVerification(root, {
    executeCommand: () => Promise.resolve(processResult({ exitCode: null, spawnFailed: true })),
  });
  const verification = receipt.phases.find((phase) => phase.phase === PREFLIGHT_PHASE.VERIFICATION);

  assert.equal(receipt.status, PREFLIGHT_STATUS.FAIL);
  assert.equal(verification?.failureCode, PREFLIGHT_FAILURE_CODE.SPAWN_FAILED);
});

test('clean receipt types worktree creation failure and preserves the resolved SHA', async () => {
  const root = await createCleanVerificationFixture('svp-preflight-worktree-failure-');
  const candidateSha = gitText(root, ['rev-parse', 'HEAD']);

  const receipt = await runCleanVerification(root, {
    createWorktree: () => Promise.reject(new Error('worktree creation fixture')),
  });
  const worktree = receipt.phases.find((phase) => phase.phase === PREFLIGHT_PHASE.WORKTREE);

  assert.equal(receipt.status, PREFLIGHT_STATUS.FAIL);
  assert.equal(receipt.candidateSha, candidateSha);
  assert.equal(worktree?.failureCode, PREFLIGHT_FAILURE_CODE.WORKTREE_CREATE_FAILED);
});

test('clean receipt uses null when the candidate SHA cannot be resolved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-preflight-unresolved-sha-'));

  const receipt = await runCleanVerification(root);

  assert.equal(receipt.status, PREFLIGHT_STATUS.FAIL);
  assert.equal(receipt.candidateSha, null);
  assert.equal(receipt.phases[0]?.failureCode, PREFLIGHT_FAILURE_CODE.WORKTREE_CREATE_FAILED);
});
