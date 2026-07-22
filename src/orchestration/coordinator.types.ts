import type { WorkflowExecutorKind, WorkflowEffect, WorkflowSnapshot } from './service.types.js';

// Tres puertos que WorkflowCoordinator (coordinator.ts) orquesta sin saber
// sus implementaciones concretas: WorkflowEffectExecutor ejecuta el efecto
// según su tipo (agent/runtime/human, ver AgentWorkflowEffectExecutor y
// RuntimeWorkflowEffectExecutor en effect-executors.ts), WorkflowQueuePort
// es la cola persistida (claim/renew/complete/fail, implementada por
// DrizzleWorkflowRepository), WorkflowFailureClassifier decide reintentable
// o no. El coordinator es genérico sobre los 3 — testeable con fakes sin
// tocar SQLite ni un adapter real.
export interface WorkflowEffectExecutor {
  execute(effect: WorkflowEffect): Promise<unknown>;
}

export interface WorkflowEffectFailure {
  code: string;
  detail: string;
  retryable: boolean;
}

export interface WorkflowFailureClassifier {
  classify(error: unknown): WorkflowEffectFailure;
}

export interface WorkflowQueuePort {
  recoverExpired(now: Date): number;
  claim(leaseOwner: string, leaseMs: number, now: Date): WorkflowEffect | undefined;
  renew(effectId: string, leaseOwner: string, leaseMs: number, now: Date): string;
  complete(effectId: string, leaseOwner: string, output: unknown): WorkflowSnapshot;
  fail(effectId: string, leaseOwner: string, failure: WorkflowEffectFailure): WorkflowSnapshot;
}

export interface WorkflowCoordinatorRuntime {
  now(): Date;
  wait(delayMs: number): Promise<void>;
}

export interface WorkflowCoordinatorConfig {
  workerId: string;
  effectLeaseMs: number;
  leaseRenewalIntervalMs: number;
  idlePollIntervalMs: number;
}

export type WorkflowExecutorRegistry = ReadonlyMap<WorkflowExecutorKind, WorkflowEffectExecutor>;

export interface RuntimeWorkflowOperation {
  execute(input: unknown, effect: WorkflowEffect): Promise<unknown>;
}
