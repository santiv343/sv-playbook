import type { Store } from '../db/store.types.js';
import { WORKFLOW_EXECUTOR } from './orchestration.constants.js';
import { WorkflowCoordinator } from './coordinator.js';
import type { WorkflowEffectExecutor } from './coordinator.types.js';
import type { WorkflowExecutorKind } from './service.types.js';
import { AgentWorkflowEffectExecutor, RuntimeWorkflowEffectExecutor } from './effect-executors.js';
import { loadWorkflowCoordinatorConfig, StoreWorkflowFailureClassifier } from './runtime-configuration.js';
import { createWorkflowQueue } from './workflow-queue.js';
import type { WorkflowRuntimeDependencies, WorkflowRuntimeWorker } from './runtime.types.js';
import { validateWorkflowRuntimeBindings } from './runtime-validation.js';
import { reconcileOrphanedGatewayRuns } from '../gateway/gateway-recovery.js';

class RecoveringWorkflowRuntime implements WorkflowRuntimeWorker {
  private startup: Promise<void> | undefined;

  constructor(
    private readonly coordinator: WorkflowCoordinator,
    private readonly recover: () => Promise<number>,
  ) {}

  start(): void {
    if (this.startup !== undefined) return;
    this.startup = this.recover().then(() => { this.coordinator.start(); });
  }

  async stop(): Promise<void> {
    await this.startup;
    await this.coordinator.stop();
  }
}

export function createWorkflowRuntime(
  store: Store,
  repoRoot: string,
  dependencies: WorkflowRuntimeDependencies,
): WorkflowRuntimeWorker {
  validateWorkflowRuntimeBindings(store, dependencies.adapters, dependencies.operations);
  const executors = new Map<WorkflowExecutorKind, WorkflowEffectExecutor>();
  executors.set(WORKFLOW_EXECUTOR.AGENT, new AgentWorkflowEffectExecutor(store, dependencies.adapters, repoRoot));
  executors.set(WORKFLOW_EXECUTOR.RUNTIME, new RuntimeWorkflowEffectExecutor(dependencies.operations));
  const coordinator = new WorkflowCoordinator(
    createWorkflowQueue(store),
    executors,
    new StoreWorkflowFailureClassifier(store),
    loadWorkflowCoordinatorConfig(store, dependencies.workerId),
  );
  return new RecoveringWorkflowRuntime(
    coordinator,
    () => reconcileOrphanedGatewayRuns(store, dependencies.adapters, repoRoot),
  );
}
