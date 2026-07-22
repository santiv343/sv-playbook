// Vocabulario que isCommandFile/isFixtureFile (generate-index.ts) usan para
// filtrar qué archivos de cli/commands/ cuentan como un COMANDO real vs
// infraestructura del propio generador/fixtures de test.
export const COMMAND_FILE_TOKEN = {
  FIXTURE_BOUNDARY: '__',
  GENERATED_INDEX: 'index.gen',
  GENERATOR: 'generate-index',
} as const;
