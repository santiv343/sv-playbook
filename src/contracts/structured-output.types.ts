import type { STRUCTURED_OUTPUT_NORMALIZATION } from './structured-output.constants.js';

export type StructuredOutputNormalization = typeof STRUCTURED_OUTPUT_NORMALIZATION[
  keyof typeof STRUCTURED_OUTPUT_NORMALIZATION
];

// rawOutputDigest en el receipt es del texto CRUDO original (antes de
// pelar el fence, si aplicó) — permite verificar después que el output
// parseado realmente vino de ese texto exacto, sin tener que re-guardar
// el string completo en cada evidencia.
export interface StructuredOutputReceipt {
  rawOutputDigest: string;
  normalization: StructuredOutputNormalization;
}

export interface ParsedStructuredOutput {
  value: unknown;
  receipt: StructuredOutputReceipt;
}
