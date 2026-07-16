import type { AgentAdapter } from '../gateway/gateway.types.js';
import type { RuntimeWorkflowOperation } from './coordinator.types.js';

export interface WorkflowRuntimeWorker {
  start(): void;
  stop(): Promise<void>;
}

export interface WorkflowRuntimeDependencies {
  adapters: ReadonlyMap<string, AgentAdapter>;
  operations: ReadonlyMap<string, RuntimeWorkflowOperation>;
  workerId: string;
}
