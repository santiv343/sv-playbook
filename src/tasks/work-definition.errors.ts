export class WorkDefinitionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'WorkDefinitionError';
  }
}
