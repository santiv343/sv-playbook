// `path` es lo que array()/object() en schema/core.ts van acumulando al
// re-lanzar desde un campo hijo — permite que un error en un campo anidado
// profundo llegue con el camino completo (`a.b.c: expected string`), no
// sólo "algo falló en algún lado".
export class SchemaError extends Error {
  constructor(
    public readonly path: string[],
    public readonly detail: string,
  ) {
    super(path.length > 0 ? `${path.join('.')}: ${detail}` : detail);
    this.name = 'SchemaError';
  }
}
