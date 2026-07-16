import type { Store } from '../db/store.types.js';
import { PROMOTION_OPERATION_ID } from '../promotion/promotion.constants.js';
import type { RuntimeWorkflowOperation } from './coordinator.types.js';
import { createPromotionRuntimeOperation } from './promotion-operation.js';

export function createDefaultRuntimeOperationRegistry(
  store: Store,
  repoRoot: string,
): ReadonlyMap<string, RuntimeWorkflowOperation> {
  return new Map([[PROMOTION_OPERATION_ID, createPromotionRuntimeOperation(store, repoRoot)]]);
}
