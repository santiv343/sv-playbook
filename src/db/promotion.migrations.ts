import type Database from 'better-sqlite3';
import { PROMOTION_STORE_SCHEMA } from './store.constants.js';

export function addPromotionTables(db: Database.Database): void {
  db.exec(PROMOTION_STORE_SCHEMA);
}
