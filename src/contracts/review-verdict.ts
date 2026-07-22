import { ContextError } from '../context/context.errors.js';
import { s } from '../schema/index.js';
import { SchemaError } from '../schema/core.errors.js';
import {
  REVIEW_VERDICT_ERROR,
  REVIEW_VERDICT_KIND,
  ReviewVerdictEnvelopeSchema,
} from './review-verdict.constants.js';
import type { ParsedReviewVerdict } from './review-verdict.types.js';

const ReviewVerdictKindSchema = s.object({ kind: s.literal(REVIEW_VERDICT_KIND) });

// Chequeo barato de "esto DICE ser un veredicto de review" antes de
// pagar el costo de validarlo estrictamente contra el schema completo —
// usado en gateway-lifecycle.ts para decidir si un output de agente
// necesita el camino de validación estricta de veredictos (fail-fast) o
// el camino genérico de cualquier otro contrato.
export function hasReviewVerdictKind(value: unknown): boolean {
  try {
    ReviewVerdictKindSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

// Validación estricta del envelope completo — se llama DESPUÉS de
// hasReviewVerdictKind confirmar que vale la pena el costo. Un veredicto
// malformado se convierte acá en un ContextError con el path exacto
// dentro del objeto donde falló, no un mensaje genérico de "inválido".
export function parseReviewVerdict(value: unknown): ParsedReviewVerdict {
  try {
    return ReviewVerdictEnvelopeSchema.parse(value).payload;
  } catch (error: unknown) {
    if (error instanceof SchemaError) {
      throw new ContextError(
        REVIEW_VERDICT_ERROR.INVALID,
        `review verdict is invalid at ${error.path.join('.')}: ${error.detail}`,
      );
    }
    throw error;
  }
}
