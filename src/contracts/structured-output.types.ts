import type { STRUCTURED_OUTPUT_NORMALIZATION } from './structured-output.constants.js';

export type StructuredOutputNormalization = typeof STRUCTURED_OUTPUT_NORMALIZATION[
  keyof typeof STRUCTURED_OUTPUT_NORMALIZATION
];

export interface StructuredOutputReceipt {
  rawOutputDigest: string;
  normalization: StructuredOutputNormalization;
}

export interface ParsedStructuredOutput {
  value: unknown;
  receipt: StructuredOutputReceipt;
}
