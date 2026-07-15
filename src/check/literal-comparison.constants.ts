export const LITERAL_COMPARISON_KIND = {
  NUMBER: 'number-literal-comparison',
} as const;

export const COMPARISON_OPERATOR = new Set([
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
]);
