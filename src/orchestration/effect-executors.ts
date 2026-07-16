import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { dispatchRun } from '../gateway/gateway.js';
import type { AgentAdapter } from '../gateway/gateway.types.js';
import { prepareWorkflowRunSpec } from '../gateway/run-spec.js';
import { COORDINATOR_ERROR } from './coordinator.constants.js';
import type { RuntimeWorkflowOperation, WorkflowEffectExecutor } from './coordinator.types.js';
import type { WorkflowEffect } from './service.types.js';

export class AgentWorkflowEffectExecutor implements WorkflowEffectExecutor {
  constructor(
    private readonly store: Store,
    private readonly adapters: ReadonlyMap<string, AgentAdapter>,
    private readonly directory: string,
  ) {}

  async execute(effect: WorkflowEffect): Promise<unknown> {
    if (effect.roleId === null) {
      throw new ContextError(COORDINATOR_ERROR.INVALID_AGENT_EFFECT, `agent effect has no role: ${effect.id}`);
    }
    const runSpec = prepareWorkflowRunSpec(this.store, effect);
    const receipt = await dispatchRun(this.store, runSpec.id, this.adapters, this.directory);
    return receipt.completion.output;
  }
}

export class RuntimeWorkflowEffectExecutor implements WorkflowEffectExecutor {
  constructor(private readonly operations: ReadonlyMap<string, RuntimeWorkflowOperation>) {}

  execute(effect: WorkflowEffect): Promise<unknown> {
    if (effect.operationId === null) {
      return Promise.reject(new ContextError(COORDINATOR_ERROR.INVALID_RUNTIME_EFFECT, `runtime effect has no operation: ${effect.id}`));
    }
    const operation = this.operations.get(effect.operationId);
    if (operation === undefined) {
      return Promise.reject(new ContextError(
        COORDINATOR_ERROR.RUNTIME_OPERATION_UNAVAILABLE,
        `runtime operation is not registered: ${effect.operationId}`,
      ));
    }
    return operation.execute(effect.input, effect);
  }
}
