import { v7 as uuidv7 } from 'uuid';
import { validateArtifact } from '../contracts/artifacts.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import {
  HUMAN_EFFECT_LEASE_MS,
  HUMAN_LEASE_OWNER_PREFIX,
  WORKFLOW_ARTIFACT_ID_PREFIX,
  WORKFLOW_ERROR,
} from './orchestration.constants.js';
import { DrizzleWorkflowRepository } from './repository.js';
import type { ClaimedWorkflowEffect, StoredWorkflowRoute, WorkflowRepositoryPort } from './repository.types.js';
import type {
  CompleteWorkflowEffectInput,
  ResolveHumanWorkflowEffectInput,
  WorkflowExecutorKind,
  WorkflowSnapshot,
} from './service.types.js';

function parseJson(value: string): unknown {
  const parsed: unknown = JSON.parse(value);
  return parsed;
}

function decodePointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function pointerValue(value: unknown, pointer: string): unknown {
  if (pointer.length === 0) return value;
  let current = value;
  for (const raw of pointer.slice(1).split('/')) {
    const key = decodePointerSegment(raw);
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, key)) return undefined;
    current = Reflect.get(current, key);
  }
  return current;
}

// Ruteo por JSON Pointer + igualdad canónica: cada ruta guarda un puntero
// hacia un campo del output y el valor esperado (equalsJson); la primera
// ruta cuyo pointer resuelve a un valor canónicamente igual gana. Un
// outputPointer null es un catch-all (matchea cualquier output) — por eso
// el orden en que se evalúan las rutas importa y routes() debe devolverlas
// ya ordenadas por prioridad.
function routeMatches(route: StoredWorkflowRoute, output: unknown): boolean {
  if (route.outputPointer === null) return true;
  if (route.equalsJson === null) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, 'stored route predicate is incomplete');
  return canonicalJson(pointerValue(output, route.outputPointer)) === canonicalJson(parseJson(route.equalsJson));
}

function routeTarget(repo: WorkflowRepositoryPort, effect: ClaimedWorkflowEffect, output: unknown): string | null {
  const route = repo.routes(effect).find((candidate) => routeMatches(candidate, output));
  if (route === undefined) throw new ContextError(WORKFLOW_ERROR.ROUTE_NOT_FOUND, `no route matched output from ${effect.stepKey}`);
  return route.targetStepKey;
}

function targetExecutor(
  repo: WorkflowRepositoryPort,
  effect: ClaimedWorkflowEffect,
  target: string | null,
): WorkflowExecutorKind | null {
  if (target === null) return null;
  const definition = repo.definition(effect.definitionId, effect.definitionVersion);
  if (definition === undefined) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `missing definition ${effect.definitionId}@${effect.definitionVersion}`);
  const step = repo.step(definition, target);
  if (step === undefined) throw new ContextError(WORKFLOW_ERROR.INVALID_DEFINITION, `missing target step ${target}`);
  return step.executor;
}

function requireSnapshot(repo: WorkflowRepositoryPort, workflowId: string): WorkflowSnapshot {
  const snapshot = repo.snapshot(workflowId);
  if (snapshot === undefined) throw new ContextError(WORKFLOW_ERROR.UNKNOWN_WORKFLOW, workflowId);
  return snapshot;
}

function completeClaimedEffect(
  store: Store,
  repo: WorkflowRepositoryPort,
  effect: ClaimedWorkflowEffect,
  leaseOwner: string,
  output: unknown,
  at: string = new Date().toISOString(),
): WorkflowSnapshot {
  validateArtifact(store, effect.outputContractRef, output);
  const targetStepKey = routeTarget(repo, effect, output);
  repo.complete({
    effect,
    leaseOwner,
    outputArtifactId: `${WORKFLOW_ARTIFACT_ID_PREFIX}${uuidv7()}`,
    outputJson: canonicalJson(output),
    outputDigest: digest(output),
    targetStepKey,
    targetExecutor: targetExecutor(repo, effect, targetStepKey),
    at,
  });
  return requireSnapshot(repo, effect.workflowId);
}

export function completeWorkflowEffect(store: Store, input: CompleteWorkflowEffectInput): WorkflowSnapshot {
  const repo = new DrizzleWorkflowRepository(store);
  const effect = repo.claimedEffect(input.effectId, input.leaseOwner);
  if (effect === undefined) throw new ContextError(WORKFLOW_ERROR.EFFECT_NOT_OWNED, `effect is not claimed by ${input.leaseOwner}: ${input.effectId}`);
  return completeClaimedEffect(store, repo, effect, input.leaseOwner, input.output);
}

// Camino de dos pasos, no uno: claimHuman() primero adquiere el lease sobre
// el efecto pending (compare-and-swap, puede fallar con
// EFFECT_CLAIM_CONFLICT si dos humanos contestan a la vez), y RECIÉN
// entonces completeClaimedEffect() lo completa con el mismo leaseOwner. Esto
// reutiliza exactamente la misma ruta de completar/rutear que un efecto
// agent/runtime — humano no es un atajo paralelo, es el mismo pipeline con
// otro executor.
export function resolveHumanWorkflowEffect(
  store: Store,
  input: ResolveHumanWorkflowEffectInput,
  now: Date = new Date(),
): WorkflowSnapshot {
  if (input.resolvedBy.trim().length === 0) throw new ContextError(WORKFLOW_ERROR.INVALID_STATE, 'resolvedBy must not be empty');
  const repo = new DrizzleWorkflowRepository(store);
  const pending = repo.pendingHumanEffect(input.effectId);
  if (pending === undefined) {
    throw new ContextError(WORKFLOW_ERROR.HUMAN_EFFECT_NOT_PENDING, `human effect is not pending: ${input.effectId}`);
  }
  validateArtifact(store, pending.outputContractRef, input.output);
  const leaseOwner = `${HUMAN_LEASE_OWNER_PREFIX}${input.resolvedBy}`;
  const leaseExpiresAt = new Date(now.getTime() + HUMAN_EFFECT_LEASE_MS).toISOString();
  const claimed = repo.claimHuman(input.effectId, leaseOwner, leaseExpiresAt, now.toISOString());
  if (claimed === undefined) {
    throw new ContextError(WORKFLOW_ERROR.EFFECT_CLAIM_CONFLICT, `human effect was resolved concurrently: ${input.effectId}`);
  }
  return completeClaimedEffect(store, repo, claimed, leaseOwner, input.output, now.toISOString());
}
