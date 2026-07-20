// `code` viene de WORK_DEFINITION_ERROR (work-definition.constants.ts) —
// distingue STALE (referencia vieja), DIGEST_MISMATCH (corrupción),
// UNKNOWN, STATUS_INELIGIBLE, etc. sin parsear el mensaje de texto.
export class WorkDefinitionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'WorkDefinitionError';
  }
}
