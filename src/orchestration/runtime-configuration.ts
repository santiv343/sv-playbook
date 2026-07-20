import { eq } from 'drizzle-orm';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { COORDINATOR_ERROR } from './coordinator.constants.js';
import type { WorkflowCoordinatorConfig, WorkflowEffectFailure, WorkflowFailureClassifier } from './coordinator.types.js';
import { COORDINATOR_CONFIG_KEY } from './orchestration.constants.js';
import { workflowCoordinatorConfig, workflowFailurePolicies } from './schema.constants.js';
import type { WorkflowCoordinatorTimingInput } from './runtime-configuration.types.js';

export function loadWorkflowCoordinatorConfig(store: Store, workerId: string): WorkflowCoordinatorConfig {
  const row = store.orm.select().from(workflowCoordinatorConfig)
    .where(eq(workflowCoordinatorConfig.configKey, COORDINATOR_CONFIG_KEY)).get();
  if (row === undefined) throw new ContextError(COORDINATOR_ERROR.UNCLASSIFIED, 'workflow coordinator configuration is missing');
  return {
    workerId,
    effectLeaseMs: row.effectLeaseMs,
    leaseRenewalIntervalMs: row.leaseRenewalIntervalMs,
    idlePollIntervalMs: row.idlePollIntervalMs,
  };
}

export function setWorkflowCoordinatorTiming(store: Store, input: WorkflowCoordinatorTimingInput): void {
  if (!Number.isInteger(input.effectLeaseMs) || input.effectLeaseMs < 1
    || !Number.isInteger(input.leaseRenewalIntervalMs) || input.leaseRenewalIntervalMs < 1
    || !Number.isInteger(input.idlePollIntervalMs) || input.idlePollIntervalMs < 1
    || input.leaseRenewalIntervalMs >= input.effectLeaseMs) {
    throw new RangeError('invalid workflow coordinator timing');
  }
  store.orm.update(workflowCoordinatorConfig).set({
    effectLeaseMs: input.effectLeaseMs,
    leaseRenewalIntervalMs: input.leaseRenewalIntervalMs,
    idlePollIntervalMs: input.idlePollIntervalMs,
    updatedAt: new Date().toISOString(),
  }).where(eq(workflowCoordinatorConfig.configKey, COORDINATOR_CONFIG_KEY)).run();
}

export function setWorkflowFailurePolicy(store: Store, errorCode: string, retryable: boolean): void {
  if (errorCode.trim().length === 0) throw new RangeError('errorCode must not be empty');
  store.orm.insert(workflowFailurePolicies).values({
    errorCode,
    retryable,
    updatedAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: workflowFailurePolicies.errorCode,
    set: { retryable, updatedAt: new Date().toISOString() },
  }).run();
}

function errorIdentity(error: unknown): { code: string; detail: string } {
  if (error instanceof ContextError) return { code: error.code, detail: error.message };
  if (error instanceof Error) return { code: COORDINATOR_ERROR.UNCLASSIFIED, detail: `${error.name}: ${error.message}` };
  return { code: COORDINATOR_ERROR.UNCLASSIFIED, detail: String(error) };
}

// Política de reintentos por CÓDIGO de error, no por tipo de excepción: dos
// errores distintos con el mismo `code` comparten política. Sin fila en
// workflow_failure_policies, `retryable` cae a false — fallar cerrado, no
// reintentar indefinidamente algo no clasificado explícitamente.
export class StoreWorkflowFailureClassifier implements WorkflowFailureClassifier {
  constructor(private readonly store: Store) {}

  classify(error: unknown): WorkflowEffectFailure {
    const identity = errorIdentity(error);
    const policy = this.store.orm.select({ retryable: workflowFailurePolicies.retryable }).from(workflowFailurePolicies)
      .where(eq(workflowFailurePolicies.errorCode, identity.code)).get();
    return { ...identity, retryable: policy?.retryable ?? false };
  }
}
