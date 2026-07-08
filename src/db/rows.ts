function column(row: unknown, key: string): unknown {
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
