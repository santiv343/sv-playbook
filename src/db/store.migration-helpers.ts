import type Database from 'better-sqlite3';

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
