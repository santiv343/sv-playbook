import { OpenCodeAdapter } from './adapters/opencode-adapter.js';
import type { AgentAdapter } from './gateway.types.js';

export function createDefaultAgentAdapterRegistry(): ReadonlyMap<string, AgentAdapter> {
  const adapters: AgentAdapter[] = [new OpenCodeAdapter()];
  return new Map(adapters.map((adapter) => [adapter.id, adapter]));
}
