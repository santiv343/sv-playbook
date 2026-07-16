import { and, eq, gt, isNotNull } from 'drizzle-orm';
import { canonicalJson } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { WORKFLOW_EFFECT_STATUS, WORKFLOW_ERROR, WORKFLOW_EVENT, WORKFLOW_STATUS } from './orchestration.constants.js';
import type { FailEffectRecord } from './repository.types.js';
import { workflowEffects, workflowEvents, workflowRuns } from './schema.constants.js';

function requireRevision(store: Store, workflowId: string): number {
  const workflow = store.orm.select({ revision: workflowRuns.revision }).from(workflowRuns)
    .where(eq(workflowRuns.id, workflowId)).get();
  if (workflow === undefined) throw new ContextError(WORKFLOW_ERROR.UNKNOWN_WORKFLOW, workflowId);
  return workflow.revision + 1;
}

function closeClaim(store: Store, record: FailEffectRecord): void {
  const updated = store.orm.update(workflowEffects).set({
    status: WORKFLOW_EFFECT_STATUS.FAILED,
    detail: record.failureDetail,
    leaseOwner: null,
    leaseExpiresAt: null,
    updatedAt: record.at,
  }).where(and(
    eq(workflowEffects.id, record.effect.id),
    eq(workflowEffects.status, WORKFLOW_EFFECT_STATUS.CLAIMED),
    eq(workflowEffects.leaseOwner, record.leaseOwner),
  )).run();
  if (updated.changes !== 1) {
    throw new ContextError(WORKFLOW_ERROR.EFFECT_NOT_OWNED, `effect claim changed: ${record.effect.id}`);
  }
}

function scheduleRetry(store: Store, record: FailEffectRecord, revision: number): void {
  store.orm.insert(workflowEffects).values({
    id: record.nextEffectId,
    workflowId: record.effect.workflowId,
    stepKey: record.effect.stepKey,
    attempt: record.effect.attempt + 1,
    status: WORKFLOW_EFFECT_STATUS.PENDING,
    inputArtifactId: record.effect.inputArtifactId,
    createdAt: record.at,
    updatedAt: record.at,
  }).run();
  store.orm.update(workflowRuns).set({ status: WORKFLOW_STATUS.RUNNING, revision, updatedAt: record.at })
    .where(eq(workflowRuns.id, record.effect.workflowId)).run();
  store.orm.insert(workflowEvents).values({
    workflowId: record.effect.workflowId,
    revision,
    eventType: WORKFLOW_EVENT.EFFECT_RETRY_SCHEDULED,
    stepKey: record.effect.stepKey,
    safePayloadJson: canonicalJson({
      effectId: record.effect.id,
      failureCode: record.failureCode,
      nextAttempt: record.effect.attempt + 1,
    }),
    createdAt: record.at,
  }).run();
}

function failWorkflow(store: Store, record: FailEffectRecord, revision: number): void {
  store.orm.update(workflowRuns).set({
    status: WORKFLOW_STATUS.FAILED,
    failureCode: record.failureCode,
    failureDetail: record.failureDetail,
    revision,
    updatedAt: record.at,
  }).where(eq(workflowRuns.id, record.effect.workflowId)).run();
  store.orm.insert(workflowEvents).values({
    workflowId: record.effect.workflowId,
    revision,
    eventType: WORKFLOW_EVENT.FAILED,
    stepKey: record.effect.stepKey,
    safePayloadJson: canonicalJson({ effectId: record.effect.id, failureCode: record.failureCode }),
    createdAt: record.at,
  }).run();
}

export function failEffect(store: Store, record: FailEffectRecord): void {
  store.orm.transaction(() => {
    closeClaim(store, record);
    const revision = requireRevision(store, record.effect.workflowId);
    if (record.retryable && record.effect.attempt < record.effect.maxAttempts) {
      scheduleRetry(store, record, revision);
      return;
    }
    failWorkflow(store, record, revision);
  });
}

export function renewEffectLease(
  store: Store,
  effectId: string,
  leaseOwner: string,
  leaseExpiresAt: string,
  at: string,
): void {
  const updated = store.orm.update(workflowEffects).set({ leaseExpiresAt, updatedAt: at }).where(and(
    eq(workflowEffects.id, effectId),
    eq(workflowEffects.status, WORKFLOW_EFFECT_STATUS.CLAIMED),
    eq(workflowEffects.leaseOwner, leaseOwner),
    isNotNull(workflowEffects.leaseExpiresAt),
    gt(workflowEffects.leaseExpiresAt, at),
  )).run();
  if (updated.changes !== 1) {
    throw new ContextError(WORKFLOW_ERROR.EFFECT_NOT_OWNED, `effect lease cannot be renewed: ${effectId}`);
  }
}
