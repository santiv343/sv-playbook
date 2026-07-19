import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { ContextError } from '../context/context.errors.js';
import { validateArtifact } from '../contracts/artifacts.js';
import { openStore } from '../db/store.js';
import { roleProjectionActivation, roleProjectionReceipts } from '../gateway/schema.constants.js';
import { workflowArtifacts } from '../orchestration/schema.constants.js';
import { requireActiveRoleCatalog } from '../roles/catalog-activation.js';
import { bootstrapBundledRoleCatalog } from '../roles/bundled-profile-bootstrap.js';
import { s } from '../schema/index.js';
import { createPacket, ensureSession, movePacket, notePacket, startPacket } from '../tasks/service.js';
import { movePacketToReview } from '../tasks/review-transition.js';
import { loadWorkDefinition } from '../tasks/work-definitions.js';
import { reviewCandidates } from './schema.constants.js';
import {
  REVIEW_CANDIDATE_CONTRACT_REF_V2,
  REVIEW_CANDIDATE_CONTRACT_REF_V3,
  REVIEW_CANDIDATE_NOTES_LIMIT,
} from './review-candidate.constants.js';

const NOTE_TOTAL = 25;

const git = (root: string, args: readonly string[]): string => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: 'pipe',
}).trim();

test('review candidate evidence carries at most the most recent notes, chronologically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-review-candidate-notes-bound-'));
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
    tasks: { complexityCheckpoint: { enabled: false, requireDecisionForTypes: [], requireDecisionForPaths: [] } },
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
    id: 'RPR-NOTES-BOUND',
    adapterId: 'test-projection',
    catalogVersion: catalog.version,
    catalogDigest: catalog.catalogDigest,
    profileDigest: 'sha256:test-profile',
    artifactDigest: 'sha256:test-artifact',
    createdAt,
  }).run();
  store.orm.insert(roleProjectionActivation).values({
    adapterId: 'test-projection',
    receiptId: 'RPR-NOTES-BOUND',
    activatedAt: createdAt,
  }).run();
  createPacket(store, root, {
    id: 'REVIEW-NOTES-BOUND-001',
    title: 'Notes bound fixture',
    dependsOn: [],
    writeSet: ['src/**'],
    requirements: ['Bound the notes evidence.'],
    evidenceRequired: [],
    tags: ['backend'],
  }, 'Notes are bounded.');
  git(root, ['commit', '--allow-empty', '-m', 'task definition']);
  const definition = loadWorkDefinition(store, 'REVIEW-NOTES-BOUND-001');
  movePacket(store, undefined, definition.packetId, 'ready');
  const sessionId = ensureSession(store, root);
  startPacket(store, sessionId, root, definition.packetId);
  const details = Array.from({ length: NOTE_TOTAL }, (_value, index) => `receipt ${index}`);
  for (const detail of details) notePacket(store, sessionId, definition.packetId, detail);

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
  assert.equal(notes.length, REVIEW_CANDIDATE_NOTES_LIMIT);
  assert.deepEqual(notes.map((note) => note.detail), details.slice(details.length - REVIEW_CANDIDATE_NOTES_LIMIT));
  const timestamps = notes.map((note) => note.at);
  assert.deepEqual(timestamps, [...timestamps].sort());
  store.close();
});

test('candidate values without evidence notes still validate against the v3 contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-review-candidate-v2-shape-'));
  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);
  // Shape produced while v2 was active: no `evidence.notes` field.
  const v2ShapedValue = {
    kind: 'review-candidate',
    workDefinition: { id: 'BUG-021', version: 1, digest: 'sha256:definition' },
    candidate: {
      sha: 'a'.repeat(40),
      branch: 'feature/bug-021',
      baseSha: 'b'.repeat(40),
      changedFiles: [],
      diffDigest: 'sha256:diff',
      diff: '',
      integration: 'already-integrated',
    },
    producer: { sessionId: 'session-1' },
    evidence: {
      preflight: {},
      catalog: { version: 1, digest: 'sha256:catalog' },
      projections: [{ adapterId: 'adapter', receiptId: 'RPR-1', artifactDigest: 'sha256:artifact' }],
    },
    createdAt: new Date().toISOString(),
  };
  validateArtifact(store, REVIEW_CANDIDATE_CONTRACT_REF_V3, v2ShapedValue);
  validateArtifact(store, REVIEW_CANDIDATE_CONTRACT_REF_V2, v2ShapedValue);
  const notesCarryingValue = {
    ...v2ShapedValue,
    evidence: {
      ...v2ShapedValue.evidence,
      notes: [{ at: new Date().toISOString(), detail: 'closing receipt' }],
    },
  };
  validateArtifact(store, REVIEW_CANDIDATE_CONTRACT_REF_V3, notesCarryingValue);
  // v2 stays frozen: the notes-carrying shape must NOT silently validate against it.
  assert.throws(
    () => { validateArtifact(store, REVIEW_CANDIDATE_CONTRACT_REF_V2, notesCarryingValue); },
    (error: unknown) => error instanceof ContextError,
  );
  // Notes must be well-formed: closed objects with a non-empty detail.
  assert.throws(
    () => {
      validateArtifact(store, REVIEW_CANDIDATE_CONTRACT_REF_V3, {
        ...v2ShapedValue,
        evidence: { ...v2ShapedValue.evidence, notes: [{ at: new Date().toISOString(), detail: '' }] },
      });
    },
    (error: unknown) => error instanceof ContextError,
  );
  store.close();
});
