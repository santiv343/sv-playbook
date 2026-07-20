import type { Store } from '../db/store.types.js';
import { PROMOTION_OPERATION_ID } from '../promotion/promotion.constants.js';
import type { RuntimeWorkflowOperation } from './coordinator.types.js';
import { createPromotionRuntimeOperation } from './promotion-operation.js';

// El análogo de createDefaultAgentAdapterRegistry (gateway/adapter-registry.ts)
// pero para operaciones RUNTIME de un workflow — hoy sólo `promotion.execute`
// está registrada; RuntimeWorkflowEffectExecutor (effect-executors.ts)
// resuelve por este mapa el operationId de un step contra su
// implementación real, igual que el gateway resuelve adapterId.
export function createDefaultRuntimeOperationRegistry(
  store: Store,
  repoRoot: string,
): ReadonlyMap<string, RuntimeWorkflowOperation> {
  return new Map([[PROMOTION_OPERATION_ID, createPromotionRuntimeOperation(store, repoRoot)]]);
}
