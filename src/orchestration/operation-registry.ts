import type { RuntimeWorkflowOperation } from './coordinator.types.js';

export function createDefaultRuntimeOperationRegistry(): ReadonlyMap<string, RuntimeWorkflowOperation> {
  return new Map();
}
