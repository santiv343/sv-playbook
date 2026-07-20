import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { openStore } from '../db/store.js';
import { roleProjectionActivation, roleProjectionReceipts } from '../gateway/schema.constants.js';
import { activateRoleCatalog, requireActiveRoleCatalog } from '../roles/catalog-activation.js';
import { bootstrapBundledRoleCatalog } from '../roles/bundled-profile-bootstrap.js';
import { BUNDLED_REVIEW_RESPONSIBILITY_ID } from '../roles/bundled-profile.constants.js';
import { addModelCapability, addResponsibility } from '../roles/catalog.js';
import { ensureBundledInputPolicies } from '../roles/bundled-input-policies.js';
import { modelCapabilities, roleCatalogVersions } from '../roles/schema.constants.js';
import { RESPONSIBILITY_CLASSIFICATION } from '../roles/role.constants.js';
import {
  createPacket,
  ensureSession,
  movePacket,
  startPacket,
} from '../tasks/service.js';
import { movePacketToReview } from '../tasks/review-transition.js';
import { loadWorkDefinition } from '../tasks/work-definitions.js';
import { reviewCandidates } from './schema.constants.js';

const git = (root: string, args: readonly string[]): string => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: 'pipe',
}).trim();

async function reviewFixtureRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
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
  return root;
}

test('task move review self-heals a store with no active role catalog', async () => {
  const root = await reviewFixtureRoot('svp-review-self-heal-');

  const store = openStore(root);
  // Seed the input policy that makes review candidates required, but leave the
  // catalog without an active activation. This is the state that previously
  // surfaced REVIEW_CANDIDATE_ERROR.CATALOG_MISSING.
  addResponsibility(store, {
    id: BUNDLED_REVIEW_RESPONSIBILITY_ID,
    classification: RESPONSIBILITY_CLASSIFICATION.SEMANTIC,
    description: 'Bundled review responsibility.',
  });
  ensureBundledInputPolicies(store);

  // The bundled catalog produces a deterministic digest; bootstrap a throwaway
  // store so we can seed a matching projection receipt in the test store.
  const bootstrapRoot = await mkdtemp(join(tmpdir(), 'svp-review-self-heal-bootstrap-'));
  git(bootstrapRoot, ['init', '-b', 'main']);
  git(bootstrapRoot, ['config', 'user.email', 'test@example.com']);
  git(bootstrapRoot, ['config', 'user.name', 'Test']);
  await writeFile(join(bootstrapRoot, 'README.md'), 'base\n', 'utf8');
  git(bootstrapRoot, ['add', 'README.md']);
  git(bootstrapRoot, ['commit', '-m', 'base']);
  const bootstrapStore = openStore(bootstrapRoot);
  const { catalogDigest } = bootstrapBundledRoleCatalog(bootstrapStore);
  const bootstrapVersion = bootstrapStore.orm.select().from(roleCatalogVersions).get();
  bootstrapStore.close();
  if (bootstrapVersion === undefined) throw new Error('expected bootstrap version row');

  store.orm.insert(roleCatalogVersions).values(bootstrapVersion).run();
  const projectionCreatedAt = new Date().toISOString();
  store.orm.insert(roleProjectionReceipts).values({
    id: 'RPR-SELF-HEAL',
    adapterId: 'test-projection',
    catalogVersion: bootstrapVersion.version,
    catalogDigest,
    profileDigest: 'sha256:test-profile',
    artifactDigest: 'sha256:test-artifact',
    createdAt: projectionCreatedAt,
  }).run();
  store.orm.insert(roleProjectionActivation).values({
    adapterId: 'test-projection',
    receiptId: 'RPR-SELF-HEAL',
    activatedAt: projectionCreatedAt,
  }).run();

  createPacket(store, root, {
    id: 'REVIEW-SELF-HEAL-001',
    title: 'Self-heal review fixture',
    dependsOn: [],
    writeSet: ['src/**'],
    requirements: ['Demonstrate self-heal.'],
    evidenceRequired: [],
    tags: ['backend'],
  }, 'Task for self-heal test.');
  git(root, ['commit', '--allow-empty', '-m', 'task definition']);
  const definition = loadWorkDefinition(store, 'REVIEW-SELF-HEAL-001');
  movePacket(store, undefined, definition.packetId, 'ready');
  const sessionId = ensureSession(store, root);
  startPacket(store, sessionId, root, definition.packetId);

  git(root, ['checkout', '-b', 'feature/self-heal']);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'change.ts'), 'export const change = true;\n', 'utf8');
  git(root, ['add', 'src/change.ts']);
  git(root, ['commit', '-m', 'candidate']);

  await movePacketToReview(store, sessionId, definition.packetId);
  const candidate = store.orm.select().from(reviewCandidates).get();
  assert.ok(candidate);
  const active = requireActiveRoleCatalog(store);
  assert.equal(active.catalogDigest, catalogDigest);
  store.close();
});

test('task move review does not touch an existing customized catalog', async () => {
  const root = await reviewFixtureRoot('svp-review-custom-catalog-');

  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);
  addModelCapability(store, { id: 'custom-capability', description: 'A custom capability.' });
  const customized = activateRoleCatalog(store);

  const projectionCreatedAt = new Date().toISOString();
  store.orm.insert(roleProjectionReceipts).values({
    id: 'RPR-CUSTOM',
    adapterId: 'test-projection',
    catalogVersion: customized.version,
    catalogDigest: customized.catalogDigest,
    profileDigest: 'sha256:test-profile',
    artifactDigest: 'sha256:test-artifact',
    createdAt: projectionCreatedAt,
  }).run();
  store.orm.insert(roleProjectionActivation).values({
    adapterId: 'test-projection',
    receiptId: 'RPR-CUSTOM',
    activatedAt: projectionCreatedAt,
  }).run();

  createPacket(store, root, {
    id: 'REVIEW-CUSTOM-001',
    title: 'Custom catalog fixture',
    dependsOn: [],
    writeSet: ['src/**'],
    requirements: ['Keep the customized catalog intact.'],
    evidenceRequired: [],
    tags: ['backend'],
  }, 'Task for custom catalog test.');
  git(root, ['commit', '--allow-empty', '-m', 'task definition']);
  const definition = loadWorkDefinition(store, 'REVIEW-CUSTOM-001');
  movePacket(store, undefined, definition.packetId, 'ready');
  const sessionId = ensureSession(store, root);
  startPacket(store, sessionId, root, definition.packetId);

  git(root, ['checkout', '-b', 'feature/custom-catalog']);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'change.ts'), 'export const change = true;\n', 'utf8');
  git(root, ['add', 'src/change.ts']);
  git(root, ['commit', '-m', 'candidate']);

  await movePacketToReview(store, sessionId, definition.packetId);
  const candidate = store.orm.select().from(reviewCandidates).get();
  assert.ok(candidate);
  const active = requireActiveRoleCatalog(store);
  assert.equal(active.catalogDigest, customized.catalogDigest);
  const customCapability = store.orm.select().from(modelCapabilities)
    .where(eq(modelCapabilities.id, 'custom-capability')).get();
  assert.ok(customCapability);
  store.close();
});
