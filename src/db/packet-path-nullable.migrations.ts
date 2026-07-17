import type Database from 'better-sqlite3';

export function makePacketPathNullable(db: Database.Database): void {
  db.exec(`ALTER TABLE packets ADD COLUMN path_new TEXT`);
  db.exec(`UPDATE packets SET path_new = path`);
  db.exec(`ALTER TABLE packets DROP COLUMN path`);
  db.exec(`ALTER TABLE packets RENAME COLUMN path_new TO path`);
}
