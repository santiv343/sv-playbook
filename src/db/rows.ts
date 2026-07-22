// better-sqlite3 devuelve filas como `unknown` (sin tipar) — este archivo
// es el único lugar del repo donde se hace el "unboxing" seguro de una
// columna cruda a un tipo TS concreto. Se usa en TODO el código que
// todavía consulta con `store.db.prepare(...)` en vez de `store.orm`
// (patrón más viejo, coexiste con Drizzle — ver architecture.md). Cada
// función lanza `TypeError` inmediatamente si el valor no es del tipo
// esperado, en vez de dejar pasar un `undefined`/tipo incorrecto que
// recién explotaría más adelante y en otro lugar.
export function column(row: unknown, key: string): unknown {
  if (typeof row !== 'object' || row === null) {
    throw new TypeError(`invalid row: expected object for ${key}`);
  }
  for (const [candidate, value] of Object.entries(row)) {
    if (candidate === key) return value;
  }
  throw new TypeError(`invalid row: missing column ${key}`);
}

export function stringColumn(row: unknown, key: string): string {
  const value = column(row, key);
  if (typeof value !== 'string') {
    throw new TypeError(`invalid row: column ${key} must be a string`);
  }
  return value;
}

export function numberColumn(row: unknown, key: string): number {
  const value = column(row, key);
  if (typeof value !== 'number') {
    throw new TypeError(`invalid row: column ${key} must be a number`);
  }
  return value;
}

export function nullableNumberColumn(row: unknown, key: string): number | null {
  const value = column(row, key);
  if (value === null) return null;
  if (typeof value !== 'number') {
    throw new TypeError(`invalid row: column ${key} must be a number or null`);
  }
  return value;
}

export function nullableStringColumn(row: unknown, key: string): string | null {
  const value = column(row, key);
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new TypeError(`invalid row: column ${key} must be a string or null`);
  }
  return value;
}
