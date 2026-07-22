import type { PROMOTION_ERROR } from './promotion.constants.js';

type PromotionErrorCode = typeof PROMOTION_ERROR[keyof typeof PROMOTION_ERROR];

// `hint` opcional es lo que separa esto de un Error genérico — un mensaje
// dirigido al operador sobre qué hacer a continuación (ver PromotionController),
// no sólo qué salió mal.
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
