import type { WorkflowExecutorKind, WorkflowEffect, WorkflowSnapshot } from './service.types.js';

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
