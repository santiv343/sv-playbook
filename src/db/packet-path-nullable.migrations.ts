import type Database from 'better-sqlite3';

// SQLite no soporta `ALTER COLUMN ... DROP NOT NULL` directo — el único
// camino es el baile add-columna-nueva/copiar-datos/borrar-vieja/renombrar,
// que es exactamente lo que hace esta migración para volver `path` nullable
// (necesario para packets que nunca se exportaron a un .md real).
export function makePacketPathNullable(db: Database.Database): void {
  db.exec(`ALTER TABLE packets ADD COLUMN path_new TEXT`);
  db.exec(`UPDATE packets SET path_new = path`);
  db.exec(`ALTER TABLE packets DROP COLUMN path`);
  db.exec(`ALTER TABLE packets RENAME COLUMN path_new TO path`);
}
