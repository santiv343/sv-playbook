import { and, asc, desc, eq, isNotNull, lte } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { canonicalJson } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import {
  artifactContracts,
  roleContracts,
  workflowArtifacts,
  workflowDefinitionRoutes,
  workflowDefinitions,
  workflowDefinitionSteps,
  workflowEffects,
  workflowEvents,
  workflowRuns,
} from './schema.constants.js';
import type {
  ClaimedWorkflowEffect,
  CompleteEffectRecord,
  FailEffectRecord,
  StartWorkflowRecord,
  StoredWorkflowDefinition,
  StoredWorkflowRoute,
  StoredWorkflowStep,
  WorkflowRepositoryPort,
} from './repository.types.js';
import type { VersionedWorkflowDefinitionInput, WorkflowSnapshot } from './service.types.js';
import { failEffect, renewEffectLease } from './repository.effects.js';
import { storedExecutor, storedWorkflowStatus } from './repository.parsers.js';
import { claimHumanEffect, claimNextEffect, findClaimedEffect, findPendingHumanEffect } from './repository.claims.js';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import {
  WORKFLOW_DEFINITION_STATUS,
  WORKFLOW_DEFINITION_VERSION,
  WORKFLOW_EFFECT_ID_PREFIX,
  WORKFLOW_EFFECT_STATUS,
  WORKFLOW_ERROR,
  WORKFLOW_EVENT,
  WORKFLOW_EXECUTOR,
  WORKFLOW_STATUS,
} from './orchestration.constants.js';

// Implementación concreta de WorkflowRepositoryPort contra Drizzle. Notar
// saveDefinition(): retirar la definición ACTIVE anterior y crear la nueva
// va en UNA transacción — nunca hay una ventana donde exista más de una
// definición ACTIVE para el mismo id (el índice único parcial
// workflow_definition_one_active en el schema lo refuerza a nivel SQL
// también, doble cinturón).
export class DrizzleWorkflowRepository implements WorkflowRepositoryPort {
  constructor(private readonly store: Store) {}

  activeContractExists(ref: string): boolean {
    return this.store.orm.select({ ref: artifactContracts.ref }).from(artifactContracts)
      .where(and(eq(artifactContracts.ref, ref), eq(artifactContracts.status, ARTIFACT_CONTRACT_STATUS.ACTIVE))).get() !== undefined;
  }

  roleContract(roleId: string): { inputContractRef: string; outputContractRef: string } | undefined {
    return this.store.orm.select({
      inputContractRef: roleContracts.inputContractRef,
      outputContractRef: roleContracts.outputContractRef,
    }).from(roleContracts).where(eq(roleContracts.roleId, roleId)).get();
  }

  nextDefinitionVersion(id: string): number {
    const latest = this.store.orm.select({ version: workflowDefinitions.version }).from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, id)).orderBy(desc(workflowDefinitions.version)).get();
    return latest === undefined
      ? WORKFLOW_DEFINITION_VERSION.INITIAL
      : latest.version + WORKFLOW_DEFINITION_VERSION.INCREMENT;
  }

  saveDefinition(input: VersionedWorkflowDefinitionInput, definitionDigest: string, at: string): void {
    this.store.orm.transaction((tx) => {
      tx.update(workflowDefinitions).set({ status: WORKFLOW_DEFINITION_STATUS.RETIRED })
        .where(and(eq(workflowDefinitions.id, input.id), eq(workflowDefinitions.status, WORKFLOW_DEFINITION_STATUS.ACTIVE))).run();
      tx.insert(workflowDefinitions).values({
        id: input.id, version: input.version, status: WORKFLOW_DEFINITION_STATUS.ACTIVE, startStepKey: input.startStepKey,
        definitionDigest, createdAt: at,
      }).run();
      tx.insert(workflowDefinitionSteps).values(input.steps.map((step) => ({
        definitionId: input.id,
        definitionVersion: input.version,
        stepKey: step.key,
        executor: step.executor,
        roleId: step.roleId ?? null,
        operationId: step.operationId ?? null,
        phase: step.phase,
        inputContractRef: step.inputContractRef,
        outputContractRef: step.outputContractRef,
        contextTagsJson: canonicalJson([...new Set(step.contextTags ?? [])].sort()),
        contextReferencesJson: canonicalJson([...new Set(step.contextReferences ?? [])].sort()),
        requestedCapabilitiesJson: canonicalJson([...new Set(step.requestedCapabilities ?? [])].sort()),
        maxAttempts: step.maxAttempts,
      }))).run();
      tx.insert(workflowDefinitionRoutes).values(input.routes.map((route) => ({
        definitionId: input.id,
        definitionVersion: input.version,
        fromStepKey: route.fromStepKey,
        priority: route.priority,
        targetStepKey: route.targetStepKey ?? null,
        outputPointer: route.outputPointer ?? null,
        equalsJson: route.outputPointer === undefined ? null : canonicalJson(route.equals),
      }))).run();
    });
  }

  definition(id: string, version?: number): StoredWorkflowDefinition | undefined {
    const condition = version === undefined
      ? and(eq(workflowDefinitions.id, id), eq(workflowDefinitions.status, WORKFLOW_DEFINITION_STATUS.ACTIVE))
      : and(eq(workflowDefinitions.id, id), eq(workflowDefinitions.version, version));
    return this.store.orm.select({
      id: workflowDefinitions.id,
      version: workflowDefinitions.version,
      startStepKey: workflowDefinitions.startStepKey,
    }).from(workflowDefinitions).where(condition).get();
  }

  step(definition: StoredWorkflowDefinition, stepKey: string): StoredWorkflowStep | undefined {
    const row = this.store.orm.select({
      key: workflowDefinitionSteps.stepKey,
      executor: workflowDefinitionSteps.executor,
      roleId: workflowDefinitionSteps.roleId,
      operationId: workflowDefinitionSteps.operationId,
      phase: workflowDefinitionSteps.phase,
      inputContractRef: workflowDefinitionSteps.inputContractRef,
      outputContractRef: workflowDefinitionSteps.outputContractRef,
      contextTagsJson: workflowDefinitionSteps.contextTagsJson,
      contextReferencesJson: workflowDefinitionSteps.contextReferencesJson,
      requestedCapabilitiesJson: workflowDefinitionSteps.requestedCapabilitiesJson,
      maxAttempts: workflowDefinitionSteps.maxAttempts,
    }).from(workflowDefinitionSteps).where(and(
      eq(workflowDefinitionSteps.definitionId, definition.id),
      eq(workflowDefinitionSteps.definitionVersion, definition.version),
      eq(workflowDefinitionSteps.stepKey, stepKey),
    )).get();
    return row === undefined ? undefined : { ...row, executor: storedExecutor(row.executor) };
  }

  start(record: StartWorkflowRecord): void {
    this.store.orm.transaction((tx) => {
      tx.insert(workflowArtifacts).values({
        id: record.inputArtifactId,
        contractRef: record.inputContractRef,
        valueJson: record.inputJson,
        valueDigest: record.inputDigest,
        producerKind: WORKFLOW_EXECUTOR.HUMAN,
        producerRef: record.requestedBy,
        createdAt: record.at,
      }).run();
      tx.insert(workflowRuns).values({
        id: record.id,
        definitionId: record.definition.id,
        definitionVersion: record.definition.version,
        subjectRef: record.subjectRef,
        requestedBy: record.requestedBy,
        status: record.status,
        currentStepKey: record.definition.startStepKey,
        revision: 1,
        inputArtifactId: record.inputArtifactId,
        createdAt: record.at,
        updatedAt: record.at,
      }).run();
      tx.insert(workflowEffects).values({
        id: `${WORKFLOW_EFFECT_ID_PREFIX}${uuidv7()}`,
        workflowId: record.id,
        stepKey: record.definition.startStepKey,
        attempt: 1,
        status: WORKFLOW_EFFECT_STATUS.PENDING,
        inputArtifactId: record.inputArtifactId,
        createdAt: record.at,
        updatedAt: record.at,
      }).run();
      tx.insert(workflowEvents).values({
        workflowId: record.id,
        revision: 1,
        eventType: WORKFLOW_EVENT.STARTED,
        stepKey: record.definition.startStepKey,
        safePayloadJson: canonicalJson({ status: record.status, subjectRef: record.subjectRef }),
        createdAt: record.at,
      }).run();
    });
  }

  claim(leaseOwner: string, leaseExpiresAt: string, at: string): ClaimedWorkflowEffect | undefined {
    return claimNextEffect(this.store, leaseOwner, leaseExpiresAt, at);
  }

  pendingHumanEffect(effectId: string): ClaimedWorkflowEffect | undefined {
    return findPendingHumanEffect(this.store, effectId);
  }

  claimHuman(effectId: string, leaseOwner: string, leaseExpiresAt: string, at: string): ClaimedWorkflowEffect | undefined {
    return claimHumanEffect(this.store, effectId, leaseOwner, leaseExpiresAt, at);
  }

  claimedEffect(effectId: string, leaseOwner: string): ClaimedWorkflowEffect | undefined {
    return findClaimedEffect(this.store, effectId, leaseOwner);
  }

  routes(effect: ClaimedWorkflowEffect): readonly StoredWorkflowRoute[] {
    return this.store.orm.select({
      targetStepKey: workflowDefinitionRoutes.targetStepKey,
      outputPointer: workflowDefinitionRoutes.outputPointer,
      equalsJson: workflowDefinitionRoutes.equalsJson,
    }).from(workflowDefinitionRoutes).where(and(
      eq(workflowDefinitionRoutes.definitionId, effect.definitionId),
      eq(workflowDefinitionRoutes.definitionVersion, effect.definitionVersion),
      eq(workflowDefinitionRoutes.fromStepKey, effect.stepKey),
    )).orderBy(asc(workflowDefinitionRoutes.priority)).all();
  }

  complete(record: CompleteEffectRecord): void {
    this.store.orm.transaction((tx) => {
      tx.insert(workflowArtifacts).values({
        id: record.outputArtifactId,
        contractRef: record.effect.outputContractRef,
        valueJson: record.outputJson,
        valueDigest: record.outputDigest,
        producerKind: record.effect.executor,
        producerRef: record.effect.id,
        createdAt: record.at,
      }).run();
      const updated = tx.update(workflowEffects).set({
        status: WORKFLOW_EFFECT_STATUS.COMPLETED, outputArtifactId: record.outputArtifactId, leaseOwner: null,
        leaseExpiresAt: null, updatedAt: record.at,
      }).where(and(
        eq(workflowEffects.id, record.effect.id),
        eq(workflowEffects.status, WORKFLOW_EFFECT_STATUS.CLAIMED),
        eq(workflowEffects.leaseOwner, record.leaseOwner),
      )).run();
      if (updated.changes !== 1) throw new ContextError(WORKFLOW_ERROR.EFFECT_NOT_OWNED, `effect claim changed: ${record.effect.id}`);
      const workflow = tx.select({ revision: workflowRuns.revision }).from(workflowRuns)
        .where(eq(workflowRuns.id, record.effect.workflowId)).get();
      if (workflow === undefined) throw new ContextError(WORKFLOW_ERROR.UNKNOWN_WORKFLOW, record.effect.workflowId);
      const revision = workflow.revision + 1;
      if (record.targetStepKey === null) {
        tx.update(workflowRuns).set({
          status: WORKFLOW_STATUS.COMPLETED, currentStepKey: null, outputArtifactId: record.outputArtifactId,
          revision, updatedAt: record.at,
        }).where(eq(workflowRuns.id, record.effect.workflowId)).run();
        tx.insert(workflowEvents).values({
          workflowId: record.effect.workflowId, revision, eventType: WORKFLOW_EVENT.COMPLETED, stepKey: record.effect.stepKey,
          safePayloadJson: canonicalJson({ effectId: record.effect.id }), createdAt: record.at,
        }).run();
        return;
      }
      if (record.targetExecutor === null) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, 'target executor is required');
      const status = record.targetExecutor === WORKFLOW_EXECUTOR.HUMAN ? WORKFLOW_STATUS.WAITING : WORKFLOW_STATUS.RUNNING;
      tx.update(workflowRuns).set({
        status, currentStepKey: record.targetStepKey, revision, updatedAt: record.at,
      }).where(eq(workflowRuns.id, record.effect.workflowId)).run();
      tx.insert(workflowEffects).values({
        id: `${WORKFLOW_EFFECT_ID_PREFIX}${uuidv7()}`,
        workflowId: record.effect.workflowId,
        stepKey: record.targetStepKey,
        attempt: 1,
        status: WORKFLOW_EFFECT_STATUS.PENDING,
        inputArtifactId: record.outputArtifactId,
        createdAt: record.at,
        updatedAt: record.at,
      }).run();
      tx.insert(workflowEvents).values({
        workflowId: record.effect.workflowId, revision, eventType: WORKFLOW_EVENT.STEP_ADVANCED, stepKey: record.targetStepKey,
        safePayloadJson: canonicalJson({ completedStepKey: record.effect.stepKey, effectId: record.effect.id, status }),
        createdAt: record.at,
      }).run();
    });
  }

  fail(record: FailEffectRecord): void {
    failEffect(this.store, record);
  }

  renew(effectId: string, leaseOwner: string, leaseExpiresAt: string, at: string): void {
    renewEffectLease(this.store, effectId, leaseOwner, leaseExpiresAt, at);
  }

  recoverExpired(at: string): number {
    return this.store.orm.transaction((tx) => {
      const rows = tx.select({
        id: workflowEffects.id, workflowId: workflowEffects.workflowId, stepKey: workflowEffects.stepKey,
        executor: workflowDefinitionSteps.executor,
      }).from(workflowEffects)
        .innerJoin(workflowRuns, eq(workflowRuns.id, workflowEffects.workflowId))
        .innerJoin(workflowDefinitionSteps, and(
          eq(workflowDefinitionSteps.definitionId, workflowRuns.definitionId),
          eq(workflowDefinitionSteps.definitionVersion, workflowRuns.definitionVersion),
          eq(workflowDefinitionSteps.stepKey, workflowEffects.stepKey),
        )).where(and(
        eq(workflowEffects.status, WORKFLOW_EFFECT_STATUS.CLAIMED), isNotNull(workflowEffects.leaseExpiresAt), lte(workflowEffects.leaseExpiresAt, at),
      )).orderBy(asc(workflowEffects.workflowId), asc(workflowEffects.id)).all();
      for (const row of rows) {
        tx.update(workflowEffects).set({ status: WORKFLOW_EFFECT_STATUS.PENDING, leaseOwner: null, leaseExpiresAt: null, updatedAt: at })
          .where(and(eq(workflowEffects.id, row.id), eq(workflowEffects.status, WORKFLOW_EFFECT_STATUS.CLAIMED))).run();
        const workflow = tx.select({ revision: workflowRuns.revision }).from(workflowRuns)
          .where(eq(workflowRuns.id, row.workflowId)).get();
        if (workflow === undefined) throw new ContextError(WORKFLOW_ERROR.UNKNOWN_WORKFLOW, row.workflowId);
        const revision = workflow.revision + 1;
        const status = storedExecutor(row.executor) === WORKFLOW_EXECUTOR.HUMAN ? WORKFLOW_STATUS.WAITING : WORKFLOW_STATUS.RUNNING;
        tx.update(workflowRuns).set({ status, revision, updatedAt: at })
          .where(eq(workflowRuns.id, row.workflowId)).run();
        tx.insert(workflowEvents).values({
          workflowId: row.workflowId, revision, eventType: WORKFLOW_EVENT.EFFECT_RECOVERED, stepKey: row.stepKey,
          safePayloadJson: canonicalJson({ effectId: row.id }), createdAt: at,
        }).run();
      }
      return rows.length;
    });
  }

  snapshot(workflowId: string): WorkflowSnapshot | undefined {
    const row = this.store.orm.select({
      id: workflowRuns.id,
      definitionId: workflowRuns.definitionId,
      definitionVersion: workflowRuns.definitionVersion,
      subjectRef: workflowRuns.subjectRef,
      status: workflowRuns.status,
      currentStepKey: workflowRuns.currentStepKey,
      revision: workflowRuns.revision,
      createdAt: workflowRuns.createdAt,
      updatedAt: workflowRuns.updatedAt,
    }).from(workflowRuns).where(eq(workflowRuns.id, workflowId)).get();
    return row === undefined ? undefined : { ...row, status: storedWorkflowStatus(row.status) };
  }
}
