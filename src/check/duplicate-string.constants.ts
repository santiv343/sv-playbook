// TEST_FILE_MARKER es lo que isTestSource (duplicate-string.ts) usa para
// excluir tests del gate — duplicar literales en tests es común y
// aceptable (fixtures, assertions repetidas), no indica una constante
// faltante.
export const DUPLICATE_STRING_KIND = 'duplicate-string' as const;
export const SYNTAX_NAME_PROPERTY = 'name' as const;

export const TEST_FILE_MARKER = {
  SPEC: '.spec.',
  TEST: '.test.',
} as const;
