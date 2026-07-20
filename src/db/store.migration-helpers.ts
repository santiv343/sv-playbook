import type Database from 'better-sqlite3';

// El helper detrás de casi todas las migraciones ADD COLUMN del sistema
// (decision-linkage, run-retry, packet-path-nullable, etc.) — idempotente
// por diseño: si la columna YA existe (pragma_table_info la encuentra),
// no hace nada. Esto es lo que permite correr migraciones sobre un store
// que ya fue migrado antes sin duplicar columnas ni lanzar error "column
// already exists".
export function migrateTableColumn(
  db: Database.Database,
  table: string,
  column: string,
  type: string,
  notNull: boolean,
  defaultValue?: string,
): void {
  const cols = db.prepare(`SELECT name FROM pragma_table_info('${table}') WHERE name = ?`).all(column);
  if (cols.length > 0) return;
  const defaultClause = defaultValue === undefined ? '' : ` DEFAULT ${defaultValue}`;
  const nullabilityClause = notNull ? ' NOT NULL' : '';
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}${nullabilityClause}${defaultClause}`);
}
