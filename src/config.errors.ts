// Error dedicado (no genérico) para que los callers de loadConfig() puedan
// distinguir "config mal formada/inválida" de cualquier otro error — usado
// por parsePlaybookConfig (schema/config.constants.ts) para envolver
// SchemaError con un mensaje orientado al operador, no al detalle interno
// del parser.
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
