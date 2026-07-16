import { and, desc, eq } from 'drizzle-orm';
import { dirname } from 'node:path';
import { v7 as uuidv7 } from 'uuid';
import { validateArtifact } from '../contracts/artifacts.js';
import { loadConfig } from '../config.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { roleProjectionActivation, roleProjectionReceipts } from '../gateway/schema.constants.js';
import { workflowArtifacts } from '../orchestration/schema.constants.js';
import { WORKFLOW_EXECUTOR } from '../orchestration/orchestration.constants.js';
import { EMPTY_SIZE, NODE_ERROR_CODE } from '../platform.constants.js';
import { nodeErrorCode } from '../platform.js';
import { GIT_ARGUMENT } from '../git.constants.js';
import { gitOutput, resolveGitMergeBase } from '../git.js';
import { roleCatalogActivation, roleResponsibilities } from '../roles/schema.constants.js';
import type { StoredWorkDefinition } from '../tasks/work-definition.types.js';
import { packets } from '../tasks/schema.constants.js';
import { taskEvents } from '../tasks/schema.constants.js';
import { EVENT_EVIDENCE, EVENT_NOTE } from '../tasks/service.constants.js';
import type { LeaseInfo } from '../tasks/service.types.js';
import { runPreflight } from './preflight.js';
import { PREFLIGHT_EVENT_PREFIX, PREFLIGHT_STATUS, type PreflightReport } from './preflight.types.js';
import {
  REVIEW_CANDIDATE_ARTIFACT_ID_PREFIX,
  REVIEW_CANDIDATE_CONTRACT_REF_V3,
  REVIEW_CANDIDATE_ERROR,
  REVIEW_CANDIDATE_ID_PREFIX,
  REVIEW_CANDIDATE_INTEGRATION,
  REVIEW_CANDIDATE_KIND,
  REVIEW_CANDIDATE_NOTES_LIMIT,
  REVIEW_CANDIDATE_SOURCE_KIND,
  REQUIRED_INPUT_POLICY_COUNT,
} from './review-candidate.constants.js';
import { responsibilityInputPolicies, reviewCandidates } from './schema.constants.js';
import type {
  ManualInputBinding,
  PendingReviewCandidate,
  ReviewCandidateNote,
  ReviewCandidateValue,
  ReviewProjectionEvidence,
} from './review-candidate.types.js';

function activeCatalog(store: Store): { readonly version: number; readonly digest: string } {
  const row = store.orm.select({
    version: roleCatalogActivation.catalogVersion,
    digest: roleCatalogActivation.catalogDigest,
  }).from(roleCatalogActivation).get();
  if (row === undefined) {
    throw new ContextError(REVIEW_CANDIDATE_ERROR.CATALOG_MISSING, 'an active role catalog is required');
  }
  return row;
}

function activeProjections(
  store: Store,
  catalog: { readonly version: number; readonly digest: string },
): ReviewProjectionEvidence {
  const rows = store.orm.select({
    adapterId: roleProjectionActivation.adapterId,
    receiptId: roleProjectionActivation.receiptId,
    catalogVersion: roleProjectionReceipts.catalogVersion,
    catalogDigest: roleProjectionReceipts.catalogDigest,
    artifactDigest: roleProjectionReceipts.artifactDigest,
  }).from(roleProjectionActivation)
    .innerJoin(roleProjectionReceipts, eq(roleProjectionReceipts.id, roleProjectionActivation.receiptId))
    .orderBy(roleProjectionActivation.adapterId).all();
  const projections = rows.filter((row) =>
    row.catalogVersion === catalog.version && row.catalogDigest === catalog.digest);
  if (projections.length === EMPTY_SIZE || projections.length !== rows.length) {
    throw new ContextError(
      REVIEW_CANDIDATE_ERROR.PROJECTION_MISSING,
      'all active role projections must belong to the active catalog',
    );
  }
  return projections.map(({ adapterId, receiptId, artifactDigest }) => ({ adapterId, receiptId, artifactDigest }));
}

function assertPreflight(report: PreflightReport): void {
  const unacceptable = report.checks.filter((check) =>
    check.status === PREFLIGHT_STATUS.FAIL || check.status === PREFLIGHT_STATUS.UNKNOWN);
  if (report.headSha === '' || unacceptable.length > EMPTY_SIZE) {
    const detail = unacceptable.map((check) => `${check.name}:${check.status}`).join(', ');
    throw new ContextError(REVIEW_CANDIDATE_ERROR.EVIDENCE_FAILED, detail || 'candidate SHA is unavailable');
  }
}

// The packet's durable notes are the reviewer's evidence rail: most recent first
// via seq, bounded, then reversed back into chronological order.
function evidenceNotes(store: Store, packetId: string): ReviewCandidateNote[] {
  const rows = store.orm.select({ at: taskEvents.at, detail: taskEvents.detail })
    .from(taskEvents)
    .where(and(eq(taskEvents.packetId, packetId), eq(taskEvents.command, EVENT_NOTE)))
    .orderBy(desc(taskEvents.seq))
    .limit(REVIEW_CANDIDATE_NOTES_LIMIT)
    .all();
  return rows.reverse().flatMap((row) =>
    row.detail === null || row.detail === '' ? [] : [{ at: row.at, detail: row.detail }]);
}

function candidateGitOutput(worktree: string, args: readonly string[], maxBuffer: number): string {
  try {
    return gitOutput(worktree, args, { maxBuffer });
  } catch (error) {
    if (nodeErrorCode(error) === NODE_ERROR_CODE.BUFFER_EXCEEDED) {
      throw new ContextError(
        REVIEW_CANDIDATE_ERROR.EVIDENCE_FAILED,
        `Git output exceeds reviewCandidateMaxBytes (${maxBuffer} bytes)`,
      );
    }
    throw error;
  }
}

function candidateContent(worktree: string, baseReference: string, maxBuffer: number) {
  const dirty = candidateGitOutput(worktree, [GIT_ARGUMENT.STATUS, GIT_ARGUMENT.PORCELAIN], maxBuffer);
  if (dirty !== '') {
    throw new ContextError(REVIEW_CANDIDATE_ERROR.EVIDENCE_FAILED, 'candidate worktree has uncommitted changes');
  }
  let baseSha: string;
  try {
    baseSha = resolveGitMergeBase(worktree, baseReference, { maxBuffer });
  } catch {
    throw new ContextError(REVIEW_CANDIDATE_ERROR.EVIDENCE_FAILED, 'candidate merge base is unavailable');
  }
  const comparison = `${baseSha}...${GIT_ARGUMENT.HEAD}`;
  const changedFilesText = candidateGitOutput(worktree, [GIT_ARGUMENT.DIFF, GIT_ARGUMENT.NAME_ONLY, comparison], maxBuffer);
  const diff = candidateGitOutput(worktree, [GIT_ARGUMENT.DIFF, comparison], maxBuffer);
  const changedFiles = changedFilesText.split('\n').filter(Boolean);
  if (changedFiles.length === EMPTY_SIZE || diff === '') {
    const headSha = candidateGitOutput(worktree, [GIT_ARGUMENT.REV_PARSE, GIT_ARGUMENT.HEAD], maxBuffer);
    if (baseSha !== headSha) {
      throw new ContextError(REVIEW_CANDIDATE_ERROR.EVIDENCE_FAILED, 'candidate diff is empty');
    }
    // Already-integrated work: HEAD sits exactly on the merge base, so there is no
    // pending diff to review or integrate. The candidate certifies the SHA itself.
    return {
      baseSha,
      changedFiles: [],
      diff: '',
      diffDigest: digest(''),
      integration: REVIEW_CANDIDATE_INTEGRATION.INTEGRATED,
    };
  }
  return { baseSha, changedFiles, diff, diffDigest: digest(diff), integration: REVIEW_CANDIDATE_INTEGRATION.PENDING };
}

export function reviewCandidateRequired(store: Store, status: string): boolean {
  return store.orm.select({ responsibilityId: responsibilityInputPolicies.responsibilityId })
    .from(responsibilityInputPolicies).where(and(
      eq(responsibilityInputPolicies.requiredStatus, status),
      eq(responsibilityInputPolicies.sourceKind, REVIEW_CANDIDATE_SOURCE_KIND),
    )).get() !== undefined;
}

export async function assembleReviewCandidate(
  store: Store,
  definition: StoredWorkDefinition,
  lease: LeaseInfo,
): Promise<PendingReviewCandidate> {
  const config = loadConfig(dirname(store.dir));
  const content = candidateContent(
    lease.worktree,
    config.reviewPreflight.baseReference,
    config.reviewCandidateMaxBytes,
  );
  const report = await runPreflight(store, definition.packetId, lease.worktree, {
    pr: undefined,
    persistEvent: false,
  });
  assertPreflight(report);
  const branch = candidateGitOutput(
    lease.worktree,
    [GIT_ARGUMENT.REV_PARSE, GIT_ARGUMENT.ABBREV_REF, GIT_ARGUMENT.HEAD],
    config.reviewCandidateMaxBytes,
  );
  if (branch === '') throw new ContextError(REVIEW_CANDIDATE_ERROR.EVIDENCE_FAILED, 'candidate branch is unavailable');
  const catalog = activeCatalog(store);
  const createdAt = new Date().toISOString();
  const value: ReviewCandidateValue = {
    kind: REVIEW_CANDIDATE_KIND,
    workDefinition: {
      id: definition.packetId,
      version: definition.version,
      digest: definition.digest,
    },
    candidate: { sha: report.headSha, branch, ...content },
    producer: { sessionId: lease.sessionId },
    evidence: {
      preflight: report,
      catalog,
      projections: activeProjections(store, catalog),
      notes: evidenceNotes(store, definition.packetId),
    },
    createdAt,
  };
  validateArtifact(store, REVIEW_CANDIDATE_CONTRACT_REF_V3, value);
  const valueJson = canonicalJson(value);
  return {
    id: `${REVIEW_CANDIDATE_ID_PREFIX}${uuidv7()}`,
    artifactId: `${REVIEW_CANDIDATE_ARTIFACT_ID_PREFIX}${uuidv7()}`,
    value,
    valueJson,
    valueDigest: digest(value),
  };
}

export function persistReviewCandidate(
  store: Store,
  definition: StoredWorkDefinition,
  pending: PendingReviewCandidate,
): void {
  const existing = store.orm.select({
    workDefinitionDigest: reviewCandidates.workDefinitionDigest,
  }).from(reviewCandidates).where(and(
    eq(reviewCandidates.packetId, definition.packetId),
    eq(reviewCandidates.workDefinitionVersion, definition.version),
    eq(reviewCandidates.candidateSha, pending.value.candidate.sha),
  )).get();
  if (existing !== undefined) {
    if (existing.workDefinitionDigest !== definition.digest) {
      throw new ContextError(
        REVIEW_CANDIDATE_ERROR.INVALID_STATE,
        `candidate identity belongs to another work definition digest: ${definition.packetId}`,
      );
    }
    return;
  }
  store.orm.insert(workflowArtifacts).values({
    id: pending.artifactId,
    contractRef: REVIEW_CANDIDATE_CONTRACT_REF_V3,
    valueJson: pending.valueJson,
    valueDigest: pending.valueDigest,
    producerKind: WORKFLOW_EXECUTOR.RUNTIME,
    producerRef: pending.value.producer.sessionId,
    createdAt: pending.value.createdAt,
  }).run();
  store.orm.insert(reviewCandidates).values({
    id: pending.id,
    packetId: definition.packetId,
    workDefinitionVersion: definition.version,
    workDefinitionDigest: definition.digest,
    candidateSha: pending.value.candidate.sha,
    branch: pending.value.candidate.branch,
    producerSessionId: pending.value.producer.sessionId,
    artifactId: pending.artifactId,
    createdAt: pending.value.createdAt,
  }).run();
  store.orm.insert(taskEvents).values({
    sessionId: pending.value.producer.sessionId,
    packetId: definition.packetId,
    command: EVENT_EVIDENCE,
    detail: `${PREFLIGHT_EVENT_PREFIX}${pending.value.evidence.preflight.overall}`,
    at: pending.value.createdAt,
  }).run();
}

function policyForRole(store: Store, roleId: string) {
  return store.orm.select({
    phase: responsibilityInputPolicies.phase,
    requiredStatus: responsibilityInputPolicies.requiredStatus,
    contractRef: responsibilityInputPolicies.contractRef,
    sourceKind: responsibilityInputPolicies.sourceKind,
  }).from(roleResponsibilities)
    .innerJoin(
      responsibilityInputPolicies,
      eq(responsibilityInputPolicies.responsibilityId, roleResponsibilities.responsibilityId),
    )
    .where(eq(roleResponsibilities.roleId, roleId)).all();
}

function requiredPolicy(store: Store, roleId: string, phase: string) {
  const policies = policyForRole(store, roleId);
  if (policies.length === EMPTY_SIZE) return undefined;
  if (policies.length !== REQUIRED_INPUT_POLICY_COUNT || policies[0] === undefined) {
    throw new ContextError(REVIEW_CANDIDATE_ERROR.AMBIGUOUS_POLICY, `role has multiple input policies: ${roleId}`);
  }
  const policy = policies[0];
  if (policy.phase !== phase) {
    throw new ContextError(REVIEW_CANDIDATE_ERROR.INVALID_STATE, `${roleId} requires phase ${policy.phase}`);
  }
  if (policy.sourceKind !== REVIEW_CANDIDATE_SOURCE_KIND) {
    throw new ContextError(REVIEW_CANDIDATE_ERROR.SOURCE_UNSUPPORTED, policy.sourceKind);
  }
  return policy;
}

function assertTaskStatus(
  store: Store,
  roleId: string,
  definition: StoredWorkDefinition,
  requiredStatus: string,
): void {
  const packet = store.orm.select({ status: packets.status }).from(packets)
    .where(eq(packets.id, definition.packetId)).get();
  if (packet?.status !== requiredStatus) {
    throw new ContextError(
      REVIEW_CANDIDATE_ERROR.INVALID_STATE,
      `${roleId} requires task status ${requiredStatus}, received ${packet?.status ?? REVIEW_CANDIDATE_ERROR.CANDIDATE_MISSING}`,
    );
  }
}

function candidateArtifactId(store: Store, definition: StoredWorkDefinition): string {
  const candidate = store.orm.select({ artifactId: reviewCandidates.artifactId })
    .from(reviewCandidates).where(and(
      eq(reviewCandidates.packetId, definition.packetId),
      eq(reviewCandidates.workDefinitionVersion, definition.version),
      eq(reviewCandidates.workDefinitionDigest, definition.digest),
    )).orderBy(desc(reviewCandidates.createdAt)).get();
  if (candidate === undefined) {
    throw new ContextError(REVIEW_CANDIDATE_ERROR.CANDIDATE_MISSING, definition.packetId);
  }
  return candidate.artifactId;
}

export function resolveManualInput(
  store: Store,
  roleId: string,
  phase: string,
  definition: StoredWorkDefinition,
): ManualInputBinding | null {
  const policy = requiredPolicy(store, roleId, phase);
  if (policy === undefined) return null;
  assertTaskStatus(store, roleId, definition, policy.requiredStatus);
  const artifactId = candidateArtifactId(store, definition);
  const artifact = store.orm.select({ contractRef: workflowArtifacts.contractRef, valueJson: workflowArtifacts.valueJson })
    .from(workflowArtifacts).where(eq(workflowArtifacts.id, artifactId)).get();
  if (artifact === undefined || artifact.contractRef !== policy.contractRef) {
    throw new ContextError(REVIEW_CANDIDATE_ERROR.CANDIDATE_MISSING, artifactId);
  }
  validateArtifact(store, policy.contractRef, JSON.parse(artifact.valueJson));
  return { artifactId, contractRef: policy.contractRef };
}
