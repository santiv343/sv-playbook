export class SchemaError extends Error {
  constructor(
    public readonly path: string[],
    public readonly detail: string,
  ) {
    super(path.length > 0 ? `${path.join('.')}: ${detail}` : detail);
    this.name = 'SchemaError';
  }
}
