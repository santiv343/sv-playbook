import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { STORE_SCHEMA } from './orm.constants.js';

export type StoreOrm = BetterSQLite3Database<typeof STORE_SCHEMA>;
