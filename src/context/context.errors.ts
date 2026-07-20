// El error más reutilizado del codebase — decenas de módulos fuera de
// context/ también lo usan como error tipado genérico con `code` (gateway,
// orchestration, contracts, roles), no sólo el dominio de contexto en
// sentido estricto.
export class ContextError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ContextError';
  }
}
