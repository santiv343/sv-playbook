// Substrings que inferEslintConventions (taste-infer.ts) busca en el texto
// crudo de eslint.config.js — heurística de contenido, no parseo real del
// AST del config (ver el comentario en taste-infer.ts sobre confidence 0.9).
export const ESLINT_CONFIG_SIGNAL = {
  TYPESCRIPT_ESLINT: 'typescript-eslint',
  RECOMMENDED: 'eslint.configs.recommended',
  STRICT_TYPE_CHECKED: 'strictTypeChecked',
} as const;
