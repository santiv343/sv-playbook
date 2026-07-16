import { and, asc, eq, ne } from 'drizzle-orm';
import { canonicalJson } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import {
  workflowArtifacts,
  workflowDefinitionSteps,
  workflowEffects,
  workflowEvents,
  workflowRuns,
} from './schema.constants.js';
import type { ClaimedWorkflowEffect } from './repository.types.js';
import { storedClaimedEffect } from './repository.parsers.js';
import {
  WORKFLOW_EFFECT_STATUS,
  WORKFLOW_ERROR,
  WORKFLOW_EVENT,
  WORKFLOW_EXECUTOR,
  WORKFLOW_STATUS,
} from './orchestration.constants.js';

const EFFECT_SELECTION = {
  id: workflowEffects.id,
  workflowId: workflowEffects.workflowId,
  stepKey: workflowEffects.stepKey,
  attempt: workflowEffects.attempt,
  maxAttempts: workflowDefinitionSteps.maxAttempts,
  executor: workflowDefinitionSteps.executor,
  roleId: workflowDefinitionSteps.roleId,
  operationId: workflowDefinitionSteps.operationId,
  phase: workflowDefinitionSteps.phase,
  inputArtifactId: workflowEffects.inputArtifactId,
  inputContractRef: workflowDefinitionSteps.inputContractRef,
  inputJson: workflowArtifacts.valueJson,
  outputContractRef: workflowDefinitionSteps.outputContractRef,
  requestedCapabilitiesJson: workflowDefinitionSteps.requestedCapabilitiesJson,
  contextTagsJson: workflowDefinitionSteps.contextTagsJson,
  contextReferencesJson: workflowDefinitionSteps.contextReferencesJson,
  definitionId: workflowRuns.definitionId,
  definitionVersion: workflowRuns.definitionVersion,
};

function effectQuery(store: Store) {
  return store.orm.select(EFFECT_SELECTION).from(workflowEffects)
    .innerJoin(workflowRuns, and(
      eq(workflowRuns.id, workflowEffects.workflowId),
      eq(workflowRuns.currentStepKey, workflowEffects.stepKey),
    ))
    .innerJoin(workflowDefinitionSteps, and(
      eq(workflowDefinitionSteps.definitionId, workflowRuns.definitionId),
      eq(workflowDefinitionSteps.definitionVersion, workflowRuns.definitionVersion),
      eq(workflowDefinitionSteps.stepKey, workflowEffects.stepKey),
    ))
    .innerJoin(workflowArtifacts, eq(workflowArtifacts.id, workflowEffects.inputArtifactId));
}

function persistClaim(
  store: Store,
  row: ClaimedWorkflowEffect,
  leaseOwner: string,
  leaseExpiresAt: string,
  at: string,
): ClaimedWorkflowEffect {
  const updated = store.orm.update(workflowEffects).set({
    status: WORKFLOW_EFFECT_STATUS.CLAIMED,
    leaseOwner,
    leaseExpiresAt,
    updatedAt: at,
  }).where(and(
    eq(workflowEffects.id, row.id),
    eq(workflowEffects.status, WORKFLOW_EFFECT_STATUS.PENDING),
  )).run();
  if (updated.changes !== 1) {
    throw new ContextError(WORKFLOW_ERROR.EFFECT_CLAIM_CONFLICT, `effect was claimed concurrently: ${row.id}`);
  }
  const workflow = store.orm.select({ revision: workflowRuns.revision }).from(workflowRuns)
    .where(eq(workflowRuns.id, row.workflowId)).get();
  if (workflow === undefined) throw new ContextError(WORKFLOW_ERROR.UNKNOWN_WORKFLOW, row.workflowId);
  const revision = workflow.revision + 1;
  store.orm.update(workflowRuns).set({ revision, updatedAt: at }).where(eq(workflowRuns.id, row.workflowId)).run();
  store.orm.insert(workflowEvents).values({
    workflowId: row.workflowId,
    revision,
    eventType: WORKFLOW_EVENT.EFFECT_CLAIMED,
    stepKey: row.stepKey,
    safePayloadJson: canonicalJson({ effectId: row.id }),
    createdAt: at,
  }).run();
  return row;
}

export function claimNextEffect(
  store: Store,
  leaseOwner: string,
  leaseExpiresAt: string,
  at: string,
): ClaimedWorkflowEffect | undefined {
  return store.orm.transaction(() => {
    const selected = effectQuery(store).where(and(
      eq(workflowEffects.status, WORKFLOW_EFFECT_STATUS.PENDING),
      eq(workflowRuns.status, WORKFLOW_STATUS.RUNNING),
      ne(workflowDefinitionSteps.executor, WORKFLOW_EXECUTOR.HUMAN),
    )).orderBy(asc(workflowEffects.createdAt), asc(workflowEffects.id)).get();
    if (selected === undefined) return undefined;
    const row = storedClaimedEffect(selected);
    return persistClaim(store, row, leaseOwner, leaseExpiresAt, at);
  });
}

export function findClaimedEffect(store: Store, effectId: string, leaseOwner: string): ClaimedWorkflowEffect | undefined {
  const row = effectQuery(store).where(and(
    eq(workflowEffects.id, effectId),
    eq(workflowEffects.status, WORKFLOW_EFFECT_STATUS.CLAIMED),
    eq(workflowEffects.leaseOwner, leaseOwner),
  )).get();
  return row === undefined ? undefined : storedClaimedEffect(row);
}

export function findPendingHumanEffect(store: Store, effectId: string): ClaimedWorkflowEffect | undefined {
  const row = effectQuery(store).where(and(
    eq(workflowEffects.id, effectId),
    eq(workflowEffects.status, WORKFLOW_EFFECT_STATUS.PENDING),
    eq(workflowRuns.status, WORKFLOW_STATUS.WAITING),
    eq(workflowDefinitionSteps.executor, WORKFLOW_EXECUTOR.HUMAN),
  )).get();
  return row === undefined ? undefined : storedClaimedEffect(row);
}

export function claimHumanEffect(
  store: Store,
  effectId: string,
  leaseOwner: string,
  leaseExpiresAt: string,
  at: string,
): ClaimedWorkflowEffect | undefined {
  return store.orm.transaction(() => {
    const row = findPendingHumanEffect(store, effectId);
    return row === undefined ? undefined : persistClaim(store, row, leaseOwner, leaseExpiresAt, at);
  });
}
