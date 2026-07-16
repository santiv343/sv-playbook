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
import { createPacket, ensureSession, movePacket, notePacket, startPacket } from '../tasks/service.js';
import { movePacketToReview } from '../tasks/review-transition.js';
import { loadWorkDefinition } from '../tasks/work-definitions.js';
import { validateArtifact } from '../contracts/artifacts.js';
import { s } from '../schema/index.js';
import { reviewCandidates } from './schema.constants.js';
import {
  REVIEW_CANDIDATE_CONTRACT_REF,
  REVIEW_CANDIDATE_CONTRACT_REF_V2,
  REVIEW_CANDIDATE_ERROR,
  REVIEW_CANDIDATE_INTEGRATION,
} from './review-candidate.constants.js';

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

  movePacket(store, undefined, definition.packetId, 'ready');
  startPacket(store, sessionId, root, definition.packetId);
  await movePacketToReview(store, sessionId, definition.packetId);
  const repeatedCandidates = store.orm.select().from(reviewCandidates).all();
  assert.equal(repeatedCandidates.length, 1);
  assert.equal(repeatedCandidates[0]?.artifactId, candidate.artifactId);

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

test('review candidate is assembled for already-integrated work (empty diff)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-review-candidate-integrated-'));
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
  ].join('\n'), 'utf8');
  git(root, ['add', 'README.md', '.gitignore', 'playbook.config.json']);
  git(root, ['add', '-f', '.verify-runner.cjs']);
  git(root, ['commit', '-m', 'base']);

  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);
  const catalog = requireActiveRoleCatalog(store);
  const projectionReceipt = {
    id: 'RPR-INTEGRATED',
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
    id: 'REVIEW-INTEGRATED-001',
    title: 'Already-integrated candidate fixture',
    dependsOn: [],
    writeSet: ['src/**'],
    requirements: ['Certify the integrated state.'],
    evidenceRequired: [],
    tags: ['backend'],
  }, 'Work that already merged.');
  git(root, ['add', 'docs/packets/REVIEW-INTEGRATED-001.md']);
  git(root, ['commit', '-m', 'task definition']);
  const definition = loadWorkDefinition(store, 'REVIEW-INTEGRATED-001');
  movePacket(store, undefined, definition.packetId, 'ready');
  const sessionId = ensureSession(store, root);
  startPacket(store, sessionId, root, definition.packetId);

  // No feature branch, no pending diff: HEAD is the tip of the base reference.
  await movePacketToReview(store, sessionId, definition.packetId);
  const candidate = store.orm.select().from(reviewCandidates).get();
  assert.ok(candidate);
  assert.equal(candidate.candidateSha, git(root, ['rev-parse', 'HEAD']));
  const artifactRow = store.orm.select({ valueJson: workflowArtifacts.valueJson }).from(workflowArtifacts)
    .where(eq(workflowArtifacts.id, candidate.artifactId)).get();
  assert.ok(artifactRow);
  const value = s.json(s.object({
    candidate: s.object({
      integration: s.string(),
      changedFiles: s.array(s.string()),
      baseSha: s.string(),
    }),
  })).parse(artifactRow.valueJson);
  assert.equal(value.candidate.integration, REVIEW_CANDIDATE_INTEGRATION.INTEGRATED);
  assert.deepEqual(value.candidate.changedFiles, []);
  assert.equal(value.candidate.baseSha, candidate.candidateSha);
  store.close();
});

test('review candidate evidence includes packet notes attached before candidacy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-review-candidate-notes-'));
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
  await writeFile(join(root, '.verify-runner.cjs'),
    "if (!require('node:fs').existsSync('.verify-dependency')) process.exit(2);\n", 'utf8');
  git(root, ['add', 'README.md', '.gitignore', 'playbook.config.json']);
  git(root, ['add', '-f', '.verify-runner.cjs']);
  git(root, ['commit', '-m', 'base']);

  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);
  const catalog = requireActiveRoleCatalog(store);
  const createdAt = new Date().toISOString();
  store.orm.insert(roleProjectionReceipts).values({
    id: 'RPR-NOTES',
    adapterId: 'test-projection',
    catalogVersion: catalog.version,
    catalogDigest: catalog.catalogDigest,
    profileDigest: 'sha256:test-profile',
    artifactDigest: 'sha256:test-artifact',
    createdAt,
  }).run();
  store.orm.insert(roleProjectionActivation).values({
    adapterId: 'test-projection',
    receiptId: 'RPR-NOTES',
    activatedAt: createdAt,
  }).run();
  createPacket(store, root, {
    id: 'REVIEW-NOTES-001',
    title: 'Notes evidence fixture',
    dependsOn: [],
    writeSet: ['src/**'],
    requirements: ['Carry durable notes to the reviewer.'],
    evidenceRequired: [],
    tags: ['backend'],
  }, 'Notes reach the reviewer.');
  git(root, ['add', 'docs/packets/REVIEW-NOTES-001.md']);
  git(root, ['commit', '-m', 'task definition']);
  const definition = loadWorkDefinition(store, 'REVIEW-NOTES-001');
  movePacket(store, undefined, definition.packetId, 'ready');
  const sessionId = ensureSession(store, root);
  startPacket(store, sessionId, root, definition.packetId);
  notePacket(store, sessionId, definition.packetId, 'first closing receipt');
  notePacket(store, sessionId, definition.packetId, 'second closing receipt');

  await movePacketToReview(store, sessionId, definition.packetId);
  const candidate = store.orm.select().from(reviewCandidates).get();
  assert.ok(candidate);
  const artifactRow = store.orm.select({ valueJson: workflowArtifacts.valueJson }).from(workflowArtifacts)
    .where(eq(workflowArtifacts.id, candidate.artifactId)).get();
  assert.ok(artifactRow);
  const value = s.json(s.object({
    evidence: s.object({
      notes: s.array(s.object({ at: s.nonEmptyString(), detail: s.nonEmptyString() })),
    }),
  })).parse(artifactRow.valueJson);
  const notes = value.evidence.notes;
  assert.deepEqual(notes.map((note) => note.detail), ['first closing receipt', 'second closing receipt']);
  const timestamps = notes.map((note) => note.at);
  assert.deepEqual(timestamps, [...timestamps].sort());
  store.close();
});

test('candidate values written before the integration field still validate against the v2 contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-review-candidate-v1-'));
  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);
  // Shape produced before v2 existed: non-empty diff, no `integration` field.
  const v1ShapedValue = {
    kind: 'review-candidate',
    workDefinition: { id: 'BUG-015', version: 1, digest: 'sha256:definition' },
    candidate: {
      sha: 'a'.repeat(40),
      branch: 'feature/bug-015',
      baseSha: 'b'.repeat(40),
      changedFiles: ['src/a.ts'],
      diffDigest: 'sha256:diff',
      diff: 'diff --git a/src/a.ts b/src/a.ts\n',
    },
    producer: { sessionId: 'session-1' },
    evidence: {
      preflight: {},
      catalog: { version: 1, digest: 'sha256:catalog' },
      projections: [{ adapterId: 'adapter', receiptId: 'RPR-1', artifactDigest: 'sha256:artifact' }],
    },
    createdAt: new Date().toISOString(),
  };
  validateArtifact(store, REVIEW_CANDIDATE_CONTRACT_REF_V2, v1ShapedValue);
  validateArtifact(store, REVIEW_CANDIDATE_CONTRACT_REF, v1ShapedValue);
  // v1 stays frozen: the new integrated shape must NOT silently validate against it.
  assert.throws(
    () => {
      validateArtifact(store, REVIEW_CANDIDATE_CONTRACT_REF, {
        ...v1ShapedValue,
        candidate: {
          ...v1ShapedValue.candidate,
          changedFiles: [],
          diff: '',
          integration: REVIEW_CANDIDATE_INTEGRATION.INTEGRATED,
        },
      });
    },
    (error: unknown) => error instanceof ContextError,
  );
  store.close();
});
