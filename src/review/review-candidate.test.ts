import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { ContextError } from '../context/context.errors.js';
import { openStore } from '../db/store.js';
import { addExecutionProfile } from '../gateway/profiles.js';
import { roleProjectionActivation, roleProjectionReceipts } from '../gateway/schema.constants.js';
import { prepareRunSpec } from '../gateway/run-spec.js';
import { workflowArtifacts } from '../orchestration/schema.constants.js';
import { REFERENCE_KIND } from '../platform.constants.js';
import { requireActiveRoleCatalog } from '../roles/catalog-activation.js';
import { bootstrapBundledRoleCatalog } from '../roles/bundled-profile-bootstrap.js';
import { BUNDLED_ROLE_ID } from '../roles/bundled-profile.constants.js';
import { createPacket, ensureSession, movePacket, startPacket } from '../tasks/service.js';
import { movePacketToReview } from '../tasks/review-transition.js';
import { loadWorkDefinition } from '../tasks/work-definitions.js';
import { reviewCandidates } from './schema.constants.js';
import { REVIEW_CANDIDATE_ERROR } from './review-candidate.constants.js';

const git = (root: string, args: readonly string[]): string => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: 'pipe',
}).trim();
const LARGE_CANDIDATE_BYTES = 1_100_000;

test('review dispatch is blocked until runtime creates an immutable SHA-bound candidate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-review-candidate-'));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(join(root, 'README.md'), 'base\n', 'utf8');
  await writeFile(join(root, '.gitignore'), '.svp/\n.svp-session\n.worktrees/\n.verify-*\n', 'utf8');
  await writeFile(join(root, 'playbook.config.json'), JSON.stringify({
    verifyCommand: 'node .verify-runner.cjs',
    reviewPreflight: {
      preparationCommand: "node -e \"require('node:fs').writeFileSync('.verify-dependency','available')\"",
      noOutputTimeoutMs: 5_000,
    },
  }), 'utf8');
  await writeFile(join(root, '.verify-runner.cjs'), [
    "const fs = require('node:fs');",
    "if (!fs.existsSync('.verify-dependency')) process.exit(2);",
    "const path = '.verify-count';",
    "const count = fs.existsSync(path) ? Number(fs.readFileSync(path, 'utf8')) : 0;",
    "fs.writeFileSync(path, String(count + 1));",
  ].join('\n'), 'utf8');
  git(root, ['add', 'README.md', '.gitignore', 'playbook.config.json']);
  git(root, ['add', '-f', '.verify-runner.cjs']);
  git(root, ['commit', '-m', 'base']);

  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);
  const catalog = requireActiveRoleCatalog(store);
  const projectionReceipt = {
    id: 'RPR-TEST',
    adapterId: 'test-projection',
    catalogVersion: catalog.version,
    catalogDigest: catalog.catalogDigest,
    profileDigest: 'sha256:test-profile',
    artifactDigest: 'sha256:test-artifact',
    createdAt: new Date().toISOString(),
  };
  store.orm.insert(roleProjectionReceipts).values(projectionReceipt).run();
  store.orm.insert(roleProjectionActivation).values({
    adapterId: projectionReceipt.adapterId,
    receiptId: projectionReceipt.id,
    activatedAt: projectionReceipt.createdAt,
  }).run();
  createPacket(store, root, {
    id: 'REVIEW-001',
    title: 'Review candidate fixture',
    dependsOn: [],
    writeSet: ['src/**'],
    requirements: ['Produce the bounded source change.'],
    evidenceRequired: [],
    tags: ['backend'],
  }, 'Bounded test work.');
  git(root, ['add', 'docs/packets/REVIEW-001.md']);
  git(root, ['commit', '-m', 'task definition']);
  const definition = loadWorkDefinition(store, 'REVIEW-001');
  movePacket(store, undefined, definition.packetId, 'ready');
  const sessionId = ensureSession(store, root);
  startPacket(store, sessionId, root, definition.packetId);

  assert.throws(
    () => prepareRunSpec(store, {
      roleId: BUNDLED_ROLE_ID.REVIEWER,
      phase: 'review',
      workDefinitionRef: definition.reference,
      executionProfileId: 'not-reached',
    }),
    (error: unknown) => error instanceof ContextError
      && error.code === REVIEW_CANDIDATE_ERROR.INVALID_STATE,
  );

  git(root, ['checkout', '-b', 'feature/review-candidate']);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'candidate.ts'), 'export const candidate = true;\n', 'utf8');
  await writeFile(join(root, 'src', 'large-candidate.txt'), 'x'.repeat(LARGE_CANDIDATE_BYTES), 'utf8');
  git(root, ['add', 'src/candidate.ts', 'src/large-candidate.txt']);
  git(root, ['commit', '-m', 'candidate']);
  await movePacketToReview(store, sessionId, definition.packetId);
  const candidate = store.orm.select().from(reviewCandidates).get();
  assert.ok(candidate);
  assert.equal(candidate.candidateSha, git(root, ['rev-parse', 'HEAD']));
  assert.equal(candidate.producerSessionId, sessionId);
  assert.throws(() => {
    store.orm.update(reviewCandidates).set({ branch: 'tampered' })
      .where(eq(reviewCandidates.id, candidate.id)).run();
  }, /immutable/);
  const artifactRow = store.orm.select({ valueJson: workflowArtifacts.valueJson }).from(workflowArtifacts)
    .where(eq(workflowArtifacts.id, candidate.artifactId)).get();
  assert.ok(artifactRow);
  assert.match(artifactRow.valueJson, /candidate = true/);
  assert.match(artifactRow.valueJson, /cleanVerification/);

  addExecutionProfile(store, {
    id: 'fake-reviewer',
    roleId: BUNDLED_ROLE_ID.REVIEWER,
    adapterId: 'fake',
    agentId: BUNDLED_ROLE_ID.REVIEWER,
    providerId: 'provider',
    modelId: 'model',
    adapterConfig: {},
    observationIntervalMs: 1,
    noProgressTimeoutMs: 600_000,
    cancellationGraceMs: 10_000,
    tools: { read: true },
    enabled: true,
  });
  const runSpec = prepareRunSpec(store, {
    roleId: BUNDLED_ROLE_ID.REVIEWER,
    phase: 'review',
    workDefinitionRef: {
      kind: REFERENCE_KIND.WORK_DEFINITION,
      id: definition.packetId,
      version: definition.version,
    },
    executionProfileId: 'fake-reviewer',
  });
  assert.equal(runSpec.inputArtifactId, candidate.artifactId);
  assert.match(runSpec.specDigest, /^sha256:/);
  store.close();
});
