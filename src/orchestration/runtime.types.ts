import type { AgentAdapter } from '../gateway/gateway.types.js';
import type { RuntimeWorkflowOperation } from './coordinator.types.js';

// WorkflowRuntimeDependencies es lo que el daemon inyecta al arrancar el
// motor de workflows (ver backgroundWorkerFactory en daemon.production.ts)
// — adapters/operations son los mismos registries de gateway/adapter-registry.ts
// y orchestration/operation-registry.ts, workerId identifica esta instancia
// del coordinator (usado como leaseOwner en los claims).
export interface WorkflowRuntimeWorker {
  start(): void;
  stop(): Promise<void>;
}

export interface WorkflowRuntimeDependencies {
  adapters: ReadonlyMap<string, AgentAdapter>;
  operations: ReadonlyMap<string, RuntimeWorkflowOperation>;
  workerId: string;
}
