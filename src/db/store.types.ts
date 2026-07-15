import type Database from 'better-sqlite3';
import type { StoreOrm } from './orm.types.js';

export interface Store {
  readonly db: Database.Database;
  readonly orm: StoreOrm;
  readonly dir: string;
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
