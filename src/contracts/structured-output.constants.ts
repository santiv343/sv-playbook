// STRUCTURED_OUTPUT_NORMALIZATION documenta CÓMO se llegó al JSON parseado
// — RAW_JSON/SINGLE_JSON_FENCE son los dos caminos de parseAgentJsonOutput
// (structured-output.ts); PRE_PARSED/RUNTIME_BATCH_ASSEMBLY son para otros
// call sites que no pasan por ese parser (input ya estructurado, o
// ensamblado en batch por el runtime).
export const STRUCTURED_OUTPUT_ERROR = {
  INVALID: 'INVALID_STRUCTURED_OUTPUT',
} as const;

export const STRUCTURED_OUTPUT_NORMALIZATION = {
  PRE_PARSED: 'pre-parsed',
  RAW_JSON: 'raw-json',
  RUNTIME_BATCH_ASSEMBLY: 'runtime-batch-assembly',
  SINGLE_JSON_FENCE: 'single-json-fence',
} as const;
