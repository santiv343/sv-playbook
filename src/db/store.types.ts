import type Database from 'better-sqlite3';
import type { StoreOrm } from './orm.types.js';

// El objeto Store es lo que TODA función de dominio recibe como primer
// argumento — expone tanto `db` (better-sqlite3 crudo, para el SQL de
// src/db/ y los pocos call sites documentados fuera de ahí) como `orm`
// (Drizzle, el camino normal). `close()` es obligatorio de llamar siempre
// (ver el patrón withStore repetido en cli/commands/) — dejar un store
// abierto mantiene el lock/conexión viva más de lo necesario.
export interface Store {
  readonly db: Database.Database;
  readonly orm: StoreOrm;
  readonly dir: string;
  readonly repoRoot: string;
  close(): void;
}

export interface OpenStoreOptions {
  skipVersionCheck?: boolean;
  migrateLive?: boolean;
}

export interface MigrateStoreOptions {
  currentSessionId?: string;
  migrateLive?: boolean;
}
