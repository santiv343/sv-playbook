import { and, eq } from 'drizzle-orm';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { selectExecutionProfile } from '../gateway/profiles.js';
import type { AgentAdapter } from '../gateway/gateway.types.js';
import type { RuntimeWorkflowOperation } from './coordinator.types.js';
import {
  WORKFLOW_DEFINITION_STATUS,
  WORKFLOW_EXECUTOR,
  WORKFLOW_RUNTIME_ERROR,
} from './orchestration.constants.js';
import { workflowDefinitions, workflowDefinitionSteps } from './schema.constants.js';

interface RuntimeBinding {
  readonly stepKey: string;
  readonly executor: string;
  readonly roleId: string | null;
  readonly operationId: string | null;
}

function validateAgentBinding(
  store: Store,
  adapters: ReadonlyMap<string, AgentAdapter>,
  binding: RuntimeBinding,
): void {
  if (binding.roleId === null) {
    throw new ContextError(WORKFLOW_RUNTIME_ERROR.INVALID_BINDING, `agent step has no role: ${binding.stepKey}`);
  }
  const profile = selectExecutionProfile(store, binding.roleId);
  if (!adapters.has(profile.adapterId)) {
    throw new ContextError(
      WORKFLOW_RUNTIME_ERROR.ADAPTER_UNAVAILABLE,
      `adapter ${profile.adapterId} is not registered for ${binding.stepKey}`,
    );
  }
}

function validateRuntimeBinding(
  operations: ReadonlyMap<string, RuntimeWorkflowOperation>,
  binding: RuntimeBinding,
): void {
  if (binding.operationId === null) {
    throw new ContextError(WORKFLOW_RUNTIME_ERROR.INVALID_BINDING, `runtime step has no operation: ${binding.stepKey}`);
  }
  if (!operations.has(binding.operationId)) {
    throw new ContextError(
      WORKFLOW_RUNTIME_ERROR.OPERATION_UNAVAILABLE,
      `runtime operation ${binding.operationId} is not registered for ${binding.stepKey}`,
    );
  }
}

export function validateWorkflowRuntimeBindings(
  store: Store,
  adapters: ReadonlyMap<string, AgentAdapter>,
  operations: ReadonlyMap<string, RuntimeWorkflowOperation>,
): void {
  const bindings = store.orm.select({
    stepKey: workflowDefinitionSteps.stepKey,
    executor: workflowDefinitionSteps.executor,
    roleId: workflowDefinitionSteps.roleId,
    operationId: workflowDefinitionSteps.operationId,
  }).from(workflowDefinitionSteps).innerJoin(workflowDefinitions, and(
    eq(workflowDefinitions.id, workflowDefinitionSteps.definitionId),
    eq(workflowDefinitions.version, workflowDefinitionSteps.definitionVersion),
  )).where(eq(workflowDefinitions.status, WORKFLOW_DEFINITION_STATUS.ACTIVE)).all();

  for (const binding of bindings) {
    if (binding.executor === WORKFLOW_EXECUTOR.AGENT) validateAgentBinding(store, adapters, binding);
    if (binding.executor === WORKFLOW_EXECUTOR.RUNTIME) validateRuntimeBinding(operations, binding);
  }
}
