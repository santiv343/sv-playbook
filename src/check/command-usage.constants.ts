// Un único tipo de violación posible hoy (usage vacío) — el objeto existe
// igual (en vez de un string suelto) para que agregar un segundo tipo de
// violación algún día no rompa la forma en que se referencia.
export const COMMAND_USAGE_VIOLATION_KIND = {
  MISSING: 'missing-usage',
} as const;
