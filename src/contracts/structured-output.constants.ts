export const STRUCTURED_OUTPUT_ERROR = {
  INVALID: 'INVALID_STRUCTURED_OUTPUT',
} as const;

export const STRUCTURED_OUTPUT_NORMALIZATION = {
  PRE_PARSED: 'pre-parsed',
  RAW_JSON: 'raw-json',
  RUNTIME_BATCH_ASSEMBLY: 'runtime-batch-assembly',
  SINGLE_JSON_FENCE: 'single-json-fence',
} as const;
