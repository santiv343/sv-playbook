import type { PROMOTION_ERROR } from './promotion.constants.js';

type PromotionErrorCode = typeof PROMOTION_ERROR[keyof typeof PROMOTION_ERROR];

export class PromotionError extends Error {
  constructor(
    readonly code: PromotionErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'PromotionError';
  }
}
