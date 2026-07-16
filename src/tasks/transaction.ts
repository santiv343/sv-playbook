import type { Store } from '../db/store.types.js';

export function transact(store: Store, operation: () => void): void {
  try { store.db.exec('BEGIN IMMEDIATE'); operation(); store.db.exec('COMMIT'); }
  catch (error) { try { store.db.exec('ROLLBACK'); } catch {} throw error; }
}
