// COMPARISON_OPERATOR es el conjunto completo de operadores binarios que
// literal-comparison.ts reconoce como "comparación" — incluye igualdad Y
// orden, porque ambos casos (`x === 350`, `x > 350`) delatan un número
// mágico igual de bien.
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
