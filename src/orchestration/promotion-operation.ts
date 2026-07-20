import type { Store } from '../db/store.types.js';
import { PromotionController } from '../promotion/promotion.controller.js';
import { PROMOTION_ERROR } from '../promotion/promotion.constants.js';
import { PromotionError } from '../promotion/promotion.errors.js';
import type { PromotionRequest } from '../promotion/promotion.types.js';
import { s } from '../schema/index.js';
import { SchemaError } from '../schema/core.errors.js';
import type { RuntimeWorkflowOperation } from './coordinator.types.js';

const PromotionRequestSchema = s.object({
  reviewCandidateId: s.nonEmptyString(),
  reviewerRunSpecId: s.nonEmptyString(),
  targetRef: s.optional(s.nonEmptyString()),
});

export function parsePromotionRequest(input: unknown): PromotionRequest {
  try {
    return PromotionRequestSchema.parse(input);
  } catch (error: unknown) {
    if (error instanceof SchemaError) {
      throw new PromotionError(
        PROMOTION_ERROR.INPUT_INVALID,
        `promotion input is invalid at ${error.path.join('.')}: ${error.detail}`,
      );
    }
    throw error;
  }
}

// Adapter que le permite al motor de workflows (orchestration/) disparar
// una promoción como un efecto RUNTIME más — implementa
// RuntimeWorkflowOperation para que un workflow definido declarativamente
// pueda tener un step `executor: runtime, operationId: promotion.execute`
// (ver PROMOTION_OPERATION_ID en promotion.constants.ts) sin que el
// coordinator necesite saber nada de promoción específicamente; sólo ve
// "ejecutar esta operación registrada con este input".
export class PromotionRuntimeOperation implements RuntimeWorkflowOperation {
  constructor(private readonly controller: PromotionController) {}

  execute(input: unknown): Promise<unknown> {
    return this.controller.promote(parsePromotionRequest(input));
  }
}

export function createPromotionRuntimeOperation(store: Store, repoRoot: string): RuntimeWorkflowOperation {
  return new PromotionRuntimeOperation(new PromotionController(store, repoRoot));
}
