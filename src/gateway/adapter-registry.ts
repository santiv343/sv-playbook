import { OpenCodeAdapter } from './adapters/opencode-adapter.js';
import type { AgentAdapter } from './gateway.types.js';

// Único punto donde se instancian los adapters concretos de agente. Hoy
// sólo `opencode`, pero el mapa (por `adapter.id`) es lo que le permite a
// `dispatchRun()` (gateway.ts) resolver un `RunSpec.executionProfile.adapterId`
// a una implementación real sin acoplarse a un provider específico.
export function createDefaultAgentAdapterRegistry(): ReadonlyMap<string, AgentAdapter> {
  const adapters: AgentAdapter[] = [new OpenCodeAdapter()];
  return new Map(adapters.map((adapter) => [adapter.id, adapter]));
}
