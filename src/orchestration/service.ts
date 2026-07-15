import { v7 as uuidv7 } from 'uuid';
import { validateArtifact } from '../contracts/artifacts.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { DrizzleWorkflowRepository } from './repository.js';
import {
  WORKFLOW_ARTIFACT_ID_PREFIX,
  WORKFLOW_EFFECT_ID_PREFIX,
  INVALID_LEASE_DURATION_MESSAGE,
  WORKFLOW_ERROR,
  WORKFLOW_EXECUTOR,
  JSON_POINTER_PREFIX,
  WORKFLOW_ID_PREFIX,
  WORKFLOW_STATUS,
} from './orchestration.constants.js';
import type { ClaimedWorkflowEffect, WorkflowRepositoryPort } from './repository.types.js';
import type {
  FailWorkflowEffectInput,
  RenewWorkflowEffectLeaseInput,
  StartWorkflowInput,
  WorkflowDefinitionInput,
  WorkflowDefinitionRegistration,
  WorkflowEffect,
  WorkflowRouteDefinitionInput,
  WorkflowSnapshot,
  WorkflowStepDefinitionInput,
  VersionedWorkflowDefinitionInput,
} from './service.types.js';

function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

function requiredText(value: string, field: string): void {
  if (value.trim().length === 0) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `${field} must not be empty`);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function validateExecutor(step: WorkflowStepDefinitionInput): void {
  if (step.executor === WORKFLOW_EXECUTOR.AGENT && step.roleId !== undefined && step.operationId === undefined) return;
  if (step.executor === WORKFLOW_EXECUTOR.RUNTIME && step.roleId === undefined && step.operationId !== undefined) return;
  if (step.executor === WORKFLOW_EXECUTOR.HUMAN && step.roleId === undefined && step.operationId === undefined) return;
  throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `step ${step.key} has an invalid executor binding`);
}

function validateAgentRole(repository: WorkflowRepositoryPort, step: WorkflowStepDefinitionInput): void {
  if (step.executor !== WORKFLOW_EXECUTOR.AGENT || step.roleId === undefined) return;
  const role = repository.roleContract(step.roleId);
  if (role === undefined) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `unknown role for step ${step.key}: ${step.roleId}`);
  if (role.inputContractRef !== step.inputContractRef || role.outputContractRef !== step.outputContractRef) {
    throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `step ${step.key} does not match role ${step.roleId} contracts`);
  }
}

function validateStep(repository: WorkflowRepositoryPort, step: WorkflowStepDefinitionInput): void {
  requiredText(step.key, 'step key');
  requiredText(step.phase, `step ${step.key} phase`);
  requiredText(step.inputContractRef, `step ${step.key} input contract`);
  requiredText(step.outputContractRef, `step ${step.key} output contract`);
  if (!Number.isInteger(step.maxAttempts) || step.maxAttempts < 1) {
    throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `step ${step.key} maxAttempts must be positive`);
  }
  validateExecutor(step);
  if (!repository.activeContractExists(step.inputContractRef)) {
    throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `artifact contract is not active: ${step.inputContractRef}`);
  }
  if (!repository.activeContractExists(step.outputContractRef)) {
    throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `artifact contract is not active: ${step.outputContractRef}`);
  }
  validateAgentRole(repository, step);
}

function validateRouteEndpoints(route: WorkflowRouteDefinitionInput, steps: ReadonlyMap<string, WorkflowStepDefinitionInput>): void {
  if (!steps.has(route.fromStepKey)) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `route source does not exist: ${route.fromStepKey}`);
  if (route.targetStepKey !== undefined && !steps.has(route.targetStepKey)) {
    throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `route target does not exist: ${route.targetStepKey}`);
  }
}

function validateRoutePredicate(route: WorkflowRouteDefinitionInput): void {
  if (!Number.isInteger(route.priority) || route.priority < 0) {
    throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `route priority must be a non-negative integer: ${route.fromStepKey}`);
  }
  const hasPointer = route.outputPointer !== undefined;
  const hasEquals = Object.hasOwn(route, 'equals');
  if (hasPointer !== hasEquals) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `route predicate is incomplete: ${route.fromStepKey}`);
  if (route.outputPointer !== undefined && route.outputPointer.length > 0 && !route.outputPointer.startsWith(JSON_POINTER_PREFIX)) {
    throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `route pointer must be a JSON pointer: ${route.outputPointer}`);
  }
}

function validateRouteContracts(route: WorkflowRouteDefinitionInput, steps: ReadonlyMap<string, WorkflowStepDefinitionInput>): void {
  if (route.targetStepKey === undefined) return;
  const source = steps.get(route.fromStepKey);
  const target = steps.get(route.targetStepKey);
  if (source !== undefined && target !== undefined && source.outputContractRef !== target.inputContractRef) {
    throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `route ${route.fromStepKey} -> ${route.targetStepKey} has incompatible artifact contracts`);
  }
}

function validateRoute(route: WorkflowRouteDefinitionInput, steps: ReadonlyMap<string, WorkflowStepDefinitionInput>): void {
  validateRouteEndpoints(route, steps);
  validateRoutePredicate(route);
  validateRouteContracts(route, steps);
}

function indexSteps(repository: WorkflowRepositoryPort, definition: WorkflowDefinitionInput): Map<string, WorkflowStepDefinitionInput> {
  const steps = new Map<string, WorkflowStepDefinitionInput>();
  for (const step of definition.steps) {
    validateStep(repository, step);
    if (steps.has(step.key)) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `duplicate step: ${step.key}`);
    steps.set(step.key, step);
  }
  return steps;
}

function validateRoutes(definition: WorkflowDefinitionInput, steps: ReadonlyMap<string, WorkflowStepDefinitionInput>): void {
  const routeKeys = new Set<string>();
  const routeSources = new Set<string>();
  const defaultSources = new Set<string>();
  for (const route of definition.routes) {
    validateRoute(route, steps);
    const key = `${route.fromStepKey}:${route.priority}`;
    if (routeKeys.has(key)) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `duplicate route priority: ${key}`);
    routeKeys.add(key);
    routeSources.add(route.fromStepKey);
    if (route.outputPointer !== undefined) continue;
    if (defaultSources.has(route.fromStepKey)) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `multiple default routes: ${route.fromStepKey}`);
    defaultSources.add(route.fromStepKey);
  }
  for (const stepKey of steps.keys()) {
    if (!routeSources.has(stepKey) || !defaultSources.has(stepKey)) {
      throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `step ${stepKey} requires exactly one default route`);
    }
  }
}

function validateDefinition(repository: WorkflowRepositoryPort, definition: WorkflowDefinitionInput): void {
  requiredText(definition.id, 'workflow id');
  const steps = indexSteps(repository, definition);
  if (!steps.has(definition.startStepKey)) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, 'start step does not exist');
  validateRoutes(definition, steps);
}

function definitionValue(definition: VersionedWorkflowDefinitionInput): unknown {
  return {
    id: definition.id,
    version: definition.version,
    startStepKey: definition.startStepKey,
    steps: definition.steps.map((step) => ({
      ...step,
      contextTags: uniqueStrings(step.contextTags ?? []),
      contextReferences: uniqueStrings(step.contextReferences ?? []),
      requestedCapabilities: uniqueStrings(step.requestedCapabilities ?? []),
    })),
    routes: [...definition.routes],
  };
}

function repository(store: Store): WorkflowRepositoryPort {
  return new DrizzleWorkflowRepository(store);
}

export function registerWorkflowDefinition(
  store: Store,
  definition: WorkflowDefinitionInput,
): WorkflowDefinitionRegistration {
  const repo = repository(store);
  validateDefinition(repo, definition);
  const versioned: VersionedWorkflowDefinitionInput = {
    ...definition,
    version: repo.nextDefinitionVersion(definition.id),
  };
  const definitionDigest = digest(definitionValue(versioned));
  repo.saveDefinition(versioned, definitionDigest, nowIso());
  return { id: definition.id, version: versioned.version, definitionDigest };
}

export function startWorkflow(store: Store, input: StartWorkflowInput): WorkflowSnapshot {
  requiredText(input.subjectRef, 'subjectRef');
  requiredText(input.requestedBy, 'requestedBy');
  const repo = repository(store);
  const definition = repo.definition(input.definitionId, input.definitionVersion);
  if (definition === undefined) {
    const suffix = input.definitionVersion === undefined ? '' : `@${input.definitionVersion}`;
    throw new ContextError(WORKFLOW_ERROR.UNKNOWN_DEFINITION, `workflow definition not found: ${input.definitionId}${suffix}`);
  }
  const start = repo.step(definition, definition.startStepKey);
  if (start === undefined) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `missing step: ${definition.startStepKey}`);
  if (start.inputContractRef !== input.inputContractRef) {
    throw new ContextError(WORKFLOW_ERROR.INPUT_CONTRACT_MISMATCH, `expected ${start.inputContractRef}, received ${input.inputContractRef}`);
  }
  validateArtifact(store, input.inputContractRef, input.input);
  const workflowId = `${WORKFLOW_ID_PREFIX}${uuidv7()}`;
  const artifactId = `${WORKFLOW_ARTIFACT_ID_PREFIX}${uuidv7()}`;
  const at = nowIso();
  repo.start({
    id: workflowId,
    definition,
    subjectRef: input.subjectRef,
    requestedBy: input.requestedBy,
    status: start.executor === WORKFLOW_EXECUTOR.HUMAN ? WORKFLOW_STATUS.WAITING : WORKFLOW_STATUS.RUNNING,
    inputArtifactId: artifactId,
    inputContractRef: input.inputContractRef,
    inputJson: canonicalJson(input.input),
    inputDigest: digest(input.input),
    at,
  });
  return requireSnapshot(repo, workflowId);
}

function parseStringArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, 'requested capabilities must be a string array');
  }
  return parsed.filter((entry): entry is string => typeof entry === 'string');
}

function parseJson(value: string): unknown {
  const parsed: unknown = JSON.parse(value);
  return parsed;
}

function publicEffect(effect: ClaimedWorkflowEffect, leaseOwner: string, leaseExpiresAt: string): WorkflowEffect {
  return {
    id: effect.id,
    workflowId: effect.workflowId,
    stepKey: effect.stepKey,
    executor: effect.executor,
    roleId: effect.roleId,
    operationId: effect.operationId,
    phase: effect.phase,
    inputArtifactId: effect.inputArtifactId,
    inputContractRef: effect.inputContractRef,
    input: parseJson(effect.inputJson),
    outputContractRef: effect.outputContractRef,
    requestedCapabilities: parseStringArray(effect.requestedCapabilitiesJson),
    contextTags: parseStringArray(effect.contextTagsJson),
    contextReferences: parseStringArray(effect.contextReferencesJson),
    attempt: effect.attempt,
    maxAttempts: effect.maxAttempts,
    leaseOwner,
    leaseExpiresAt,
  };
}

export function claimWorkflowEffect(store: Store, leaseOwner: string, leaseMs: number, now: Date = new Date()): WorkflowEffect | undefined {
  requiredText(leaseOwner, 'leaseOwner');
  if (!Number.isInteger(leaseMs) || leaseMs < 1) throw new ContextError(WORKFLOW_ERROR.INVALID_EFFECT_LEASE, INVALID_LEASE_DURATION_MESSAGE);
  const leaseExpiresAt = nowIso(new Date(now.getTime() + leaseMs));
  const claimed = repository(store).claim(leaseOwner, leaseExpiresAt, nowIso(now));
  return claimed === undefined ? undefined : publicEffect(claimed, leaseOwner, leaseExpiresAt);
}

export function failWorkflowEffect(store: Store, input: FailWorkflowEffectInput): WorkflowSnapshot {
  requiredText(input.failureCode, 'failureCode');
  requiredText(input.failureDetail, 'failureDetail');
  const repo = repository(store);
  const effect = repo.claimedEffect(input.effectId, input.leaseOwner);
  if (effect === undefined) {
    throw new ContextError(WORKFLOW_ERROR.EFFECT_NOT_OWNED, `effect is not claimed by ${input.leaseOwner}: ${input.effectId}`);
  }
  repo.fail({
    effect,
    leaseOwner: input.leaseOwner,
    failureCode: input.failureCode,
    failureDetail: input.failureDetail,
    retryable: input.retryable,
    nextEffectId: `${WORKFLOW_EFFECT_ID_PREFIX}${uuidv7()}`,
    at: nowIso(),
  });
  return requireSnapshot(repo, effect.workflowId);
}

export function renewWorkflowEffectLease(
  store: Store,
  input: RenewWorkflowEffectLeaseInput,
  now: Date = new Date(),
): string {
  requiredText(input.leaseOwner, 'leaseOwner');
  if (!Number.isInteger(input.leaseMs) || input.leaseMs < 1) {
    throw new ContextError(WORKFLOW_ERROR.INVALID_EFFECT_LEASE, INVALID_LEASE_DURATION_MESSAGE);
  }
  const at = nowIso(now);
  const leaseExpiresAt = nowIso(new Date(now.getTime() + input.leaseMs));
  repository(store).renew(input.effectId, input.leaseOwner, leaseExpiresAt, at);
  return leaseExpiresAt;
}

export function recoverExpiredWorkflowEffects(store: Store, now: Date = new Date()): number {
  return repository(store).recoverExpired(nowIso(now));
}

function requireSnapshot(repo: WorkflowRepositoryPort, workflowId: string): WorkflowSnapshot {
  const snapshot = repo.snapshot(workflowId);
  if (snapshot === undefined) throw new ContextError(WORKFLOW_ERROR.UNKNOWN_WORKFLOW, workflowId);
  return snapshot;
}

export function readWorkflowSnapshot(store: Store, workflowId: string): WorkflowSnapshot {
  return requireSnapshot(repository(store), workflowId);
}
