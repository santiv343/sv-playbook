import { ContextError } from '../context/context.errors.js';
import { COORDINATOR_ERROR, COORDINATOR_OUTCOME } from './coordinator.constants.js';
import type {
  WorkflowCoordinatorConfig,
  WorkflowCoordinatorRuntime,
  WorkflowEffectExecutor,
  WorkflowExecutorRegistry,
  WorkflowFailureClassifier,
  WorkflowQueuePort,
} from './coordinator.types.js';
import type { WorkflowEffect } from './service.types.js';

const SYSTEM_COORDINATOR_RUNTIME: WorkflowCoordinatorRuntime = {
  now: () => new Date(),
  wait: (delayMs) => new Promise((resolve) => { setTimeout(resolve, delayMs); }),
};

function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${field} must be a positive integer`);
}

function validateConfig(config: WorkflowCoordinatorConfig): void {
  if (config.workerId.trim().length === 0) throw new RangeError('workerId must not be empty');
  requirePositiveInteger(config.effectLeaseMs, 'effectLeaseMs');
  requirePositiveInteger(config.leaseRenewalIntervalMs, 'leaseRenewalIntervalMs');
  requirePositiveInteger(config.idlePollIntervalMs, 'idlePollIntervalMs');
  if (config.leaseRenewalIntervalMs >= config.effectLeaseMs) {
    throw new RangeError('leaseRenewalIntervalMs must be shorter than effectLeaseMs');
  }
}

function requireExecutor(registry: WorkflowExecutorRegistry, effect: WorkflowEffect): WorkflowEffectExecutor {
  const executor = registry.get(effect.executor);
  if (executor === undefined) {
    throw new ContextError(COORDINATOR_ERROR.EXECUTOR_UNAVAILABLE, `executor is not registered: ${effect.executor}`);
  }
  return executor;
}

type ExecutionOutcome =
  | { kind: typeof COORDINATOR_OUTCOME.COMPLETED; output: unknown }
  | { kind: typeof COORDINATOR_OUTCOME.FAILED; error: unknown };

// Corre el efecto real mientras compite en una carrera contra un timer de
// renovación de lease: si el efecto tarda más que leaseRenewalIntervalMs, se
// renueva el lease en DB (queue.renew) y se vuelve a correr la carrera —
// así un efecto lento no pierde su lease y otro worker no lo reclama por
// error. validateConfig obliga a que el intervalo de renovación sea más
// corto que el TTL del lease, o esta renovación llegaría siempre tarde.
async function executeWithLeaseRenewal(
  queue: WorkflowQueuePort,
  executor: WorkflowEffectExecutor,
  effect: WorkflowEffect,
  config: WorkflowCoordinatorConfig,
  runtime: WorkflowCoordinatorRuntime,
): Promise<ExecutionOutcome> {
  const execution: Promise<ExecutionOutcome> = executor.execute(effect).then(
    (output) => ({ kind: COORDINATOR_OUTCOME.COMPLETED, output }),
    (error: unknown) => ({ kind: COORDINATOR_OUTCOME.FAILED, error }),
  );
  for (;;) {
    const outcome = await Promise.race([
      execution,
      runtime.wait(config.leaseRenewalIntervalMs)
        .then((): { kind: typeof COORDINATOR_OUTCOME.RENEW } => ({ kind: COORDINATOR_OUTCOME.RENEW })),
    ]);
    if (outcome.kind !== COORDINATOR_OUTCOME.RENEW) return outcome;
    queue.renew(effect.id, config.workerId, config.effectLeaseMs, runtime.now());
  }
}

async function executeClaimedEffect(
  queue: WorkflowQueuePort,
  registry: WorkflowExecutorRegistry,
  effect: WorkflowEffect,
  config: WorkflowCoordinatorConfig,
  runtime: WorkflowCoordinatorRuntime,
): Promise<ExecutionOutcome> {
  try {
    return await executeWithLeaseRenewal(queue, requireExecutor(registry, effect), effect, config, runtime);
  } catch (error: unknown) {
    return { kind: COORDINATOR_OUTCOME.FAILED, error };
  }
}

// El motor de workflows durables: un loop que reclama efectos pendientes de
// la cola (queue.claim, con lease exclusivo por workerId), los ejecuta, y
// persiste el resultado (complete/fail) — todo esto sobrevive un crash del
// proceso que lo corre, porque el estado real vive en la cola (DB), no en
// memoria. recoverExpired() al principio de cada runOne() libera leases de
// workers que murieron sin completar, para que otro worker los retome.
export class WorkflowCoordinator {
  private stopping = false;
  private loop: Promise<void> | undefined;

  constructor(
    private readonly queue: WorkflowQueuePort,
    private readonly executors: WorkflowExecutorRegistry,
    private readonly failures: WorkflowFailureClassifier,
    private readonly config: WorkflowCoordinatorConfig,
    private readonly runtime: WorkflowCoordinatorRuntime = SYSTEM_COORDINATOR_RUNTIME,
  ) {
    validateConfig(config);
  }

  async runOne(): Promise<boolean> {
    const now = this.runtime.now();
    this.queue.recoverExpired(now);
    const effect = this.queue.claim(this.config.workerId, this.config.effectLeaseMs, now);
    if (effect === undefined) return false;
    const outcome = await executeClaimedEffect(this.queue, this.executors, effect, this.config, this.runtime);
    if (outcome.kind === COORDINATOR_OUTCOME.COMPLETED) {
      this.queue.complete(effect.id, this.config.workerId, outcome.output);
      return true;
    }
    this.queue.fail(effect.id, this.config.workerId, this.failures.classify(outcome.error));
    return true;
  }

  start(): void {
    if (this.loop !== undefined) return;
    this.loop = this.runLoop();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await this.loop;
  }

  private async runLoop(): Promise<void> {
    while (!this.stopping) {
      const worked = await this.runOne();
      if (!worked) await this.runtime.wait(this.config.idlePollIntervalMs);
    }
  }
}
