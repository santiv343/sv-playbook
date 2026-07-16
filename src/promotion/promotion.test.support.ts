import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Store } from '../db/store.types.js';
import { addExecutionProfile } from '../gateway/profiles.js';
import { createObservingGatewayRun, finishGatewayRun } from '../gateway/gateway-run-repository.js';
import { GATEWAY_RUN_STATUS } from '../gateway/gateway.constants.js';
import { prepareRunSpec } from '../gateway/run-spec.js';
import { roleProjectionActivation, roleProjectionReceipts } from '../gateway/schema.constants.js';
import type { RunSpec } from '../gateway/gateway.types.js';
import { REFERENCE_KIND } from '../platform.constants.js';
import { requireActiveRoleCatalog } from '../roles/catalog-activation.js';
import { bootstrapBundledRoleCatalog } from '../roles/bundled-profile-bootstrap.js';
import { BUNDLED_ROLE_ID } from '../roles/bundled-profile.constants.js';
import { createPacket, ensureSession, movePacket, startPacket } from '../tasks/service.js';
import { movePacketToReview } from '../tasks/review-transition.js';
import { STATUS } from '../tasks/service.constants.js';
import { loadWorkDefinition } from '../tasks/work-definitions.js';
import { reviewCandidates } from '../review/schema.constants.js';
import { openStore } from '../db/store.js';
import type { PromotionFixture, PromotionVerdict } from './promotion.types.js';
import { PROMOTION_REVIEW_PHASE, PROMOTION_VERDICT, REVIEW_VERDICT_KIND } from './promotion.constants.js';

const FIXTURE = {
  ADAPTER_SESSION: 'reviewer-adapter-session',
  CANDIDATE_FILE: 'candidate.ts',
  CONTEXT_PROFILE: 'promotion-reviewer',
  MESSAGE: 'review-message',
  PACKET_ID: 'GATE-PROMOTION-TEST',
  PROGRESS: 'sha256:review-complete',
  PROJECTION: 'promotion-test-projection',
  PROJECTION_RECEIPT: 'RPR-PROMOTION-TEST',
} as const;

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
}

async function initializeRepository(root: string): Promise<void> {
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  await writeFile(`${root}/.gitignore`, '.svp/\n.svp-session\n.worktrees/\n', 'utf8');
  await writeFile(`${root}/README.md`, 'base\n', 'utf8');
  await writeFile(`${root}/.verify-runner.cjs`, "process.stdout.write('verified')\n", 'utf8');
  await writeFile(`${root}/playbook.config.json`, JSON.stringify({
    verifyCommand: 'node .verify-runner.cjs',
    reviewPreflight: {
      preparationCommand: "node -e \"process.stdout.write('prepared')\"",
      noOutputTimeoutMs: 5_000,
    },
  }), 'utf8');
  git(root, ['add', '.gitignore', 'README.md', '.verify-runner.cjs', 'playbook.config.json']);
  git(root, ['commit', '-m', 'base']);
}

function seedRuntime(store: Store): void {
  bootstrapBundledRoleCatalog(store);
  const catalog = requireActiveRoleCatalog(store);
  store.orm.insert(roleProjectionReceipts).values({
    id: FIXTURE.PROJECTION_RECEIPT,
    adapterId: FIXTURE.PROJECTION,
    catalogVersion: catalog.version,
    catalogDigest: catalog.catalogDigest,
    profileDigest: 'sha256:profile',
    artifactDigest: 'sha256:artifact',
    createdAt: new Date().toISOString(),
  }).run();
  store.orm.insert(roleProjectionActivation).values({
    adapterId: FIXTURE.PROJECTION,
    receiptId: FIXTURE.PROJECTION_RECEIPT,
    activatedAt: new Date().toISOString(),
  }).run();
  addExecutionProfile(store, {
    id: FIXTURE.CONTEXT_PROFILE,
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
}

function completeReviewRun(
  store: Store,
  runSpec: RunSpec,
  output: unknown,
  reviewerSessionId: string,
): void {
  const identity = {
    runSpecId: runSpec.id,
    sessionId: reviewerSessionId,
    messageId: FIXTURE.MESSAGE,
  };
  const now = new Date().toISOString();
  createObservingGatewayRun(store, identity, FIXTURE.PROGRESS, now);
  finishGatewayRun(store, {
    ...identity,
    status: GATEWAY_RUN_STATUS.COMPLETED,
    progressToken: FIXTURE.PROGRESS,
    observedToolIds: [],
    observedAt: now,
    lastProgressAt: now,
    evidence: {},
    progressChanged: true,
    output,
  });
}

interface FixtureOptions {
  readonly verdict?: PromotionVerdict;
  readonly outputCandidateSha?: string;
  readonly reviewerSessionId?: string;
  readonly integrated?: boolean;
  readonly rationale?: string;
}

interface CandidateWork {
  readonly definition: ReturnType<typeof loadWorkDefinition>;
  readonly baseSha: string;
  readonly candidateSha: string;
  readonly producerSessionId: string;
  readonly reviewCandidateId: string;
}

async function createReviewedCandidate(store: Store, root: string, options: FixtureOptions): Promise<CandidateWork> {
  createPacket(store, root, {
    id: FIXTURE.PACKET_ID,
    title: 'Promotion controller fixture',
    dependsOn: [],
    writeSet: ['src/**'],
    requirements: ['Promote the exact candidate.'],
    evidenceRequired: ['candidate-sha'],
    tags: ['backend'],
  }, 'Promotion fixture.');
  git(root, ['add', `docs/packets/${FIXTURE.PACKET_ID}.md`]);
  git(root, ['commit', '-m', 'task definition']);
  const definition = loadWorkDefinition(store, FIXTURE.PACKET_ID);
  const baseSha = git(root, ['rev-parse', 'HEAD']);
  movePacket(store, undefined, definition.packetId, STATUS.READY);
  const producerSessionId = ensureSession(store, root);
  startPacket(store, producerSessionId, root, definition.packetId);
  let candidateSha = baseSha;
  if (options.integrated !== true) {
    git(root, ['checkout', '-b', 'candidate/promotion-test']);
    await mkdir(`${root}/src`, { recursive: true });
    await writeFile(`${root}/src/${FIXTURE.CANDIDATE_FILE}`, 'export const candidate = true;\n', 'utf8');
    git(root, ['add', `src/${FIXTURE.CANDIDATE_FILE}`]);
    git(root, ['commit', '-m', 'candidate']);
    candidateSha = git(root, ['rev-parse', 'HEAD']);
  }
  // Integrated fixture: the work is already merged, so HEAD sits on the merge base
  // (candidateSha === baseSha) and the candidate certifies the SHA itself.
  await movePacketToReview(store, producerSessionId, definition.packetId);
  const reviewCandidate = store.orm.select().from(reviewCandidates).get();
  if (reviewCandidate === undefined) throw new Error('review candidate was not created');
  return { definition, baseSha, candidateSha, producerSessionId, reviewCandidateId: reviewCandidate.id };
}

export async function promotionFixture(options: FixtureOptions = {}): Promise<PromotionFixture> {
  const root = await mkdtemp(join(tmpdir(), 'svp-promotion-'));
  await initializeRepository(root);
  const store = openStore(root);
  seedRuntime(store);
  const work = await createReviewedCandidate(store, root, options);
  const runSpec = prepareRunSpec(store, {
    roleId: BUNDLED_ROLE_ID.REVIEWER,
    phase: PROMOTION_REVIEW_PHASE,
    workDefinitionRef: {
      kind: REFERENCE_KIND.WORK_DEFINITION,
      id: work.definition.packetId,
      version: work.definition.version,
    },
    executionProfileId: FIXTURE.CONTEXT_PROFILE,
  });
  const output = {
    kind: REVIEW_VERDICT_KIND,
    payload: {
      candidateSha: options.outputCandidateSha ?? work.candidateSha,
      verdict: options.verdict ?? PROMOTION_VERDICT.APPROVED,
      findings: [],
      workDefinitionRef: {
        id: work.definition.packetId,
        version: work.definition.version,
        digest: work.definition.digest,
      },
      ...(options.rationale === undefined ? {} : { rationale: options.rationale }),
    },
  };
  completeReviewRun(store, runSpec, output, options.reviewerSessionId ?? FIXTURE.ADAPTER_SESSION);
  return {
    root,
    store,
    baseSha: work.baseSha,
    candidateSha: work.candidateSha,
    reviewCandidateId: work.reviewCandidateId,
    producerSessionId: work.producerSessionId,
    reviewerRunSpecId: runSpec.id,
  };
}

export function gitSha(root: string, ref: string): string {
  return git(root, ['rev-parse', ref]);
}
