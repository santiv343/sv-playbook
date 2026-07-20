import type { Store } from '../db/store.types.js';

// Wrapper mínimo de transacción SQL cruda (BEGIN IMMEDIATE, no DEFERRED —
// toma el lock de escritura de entrada, evita el caso donde dos
// operaciones empiezan como lectura y después una de las dos no puede
// escalar a escritura). Si `operation` tira, hace ROLLBACK; si el
// ROLLBACK en sí falla (ej. la transacción ya se cerró), lo ignora para
// no enmascarar el error original con uno secundario.
export function transact(store: Store, operation: () => void): void {
  try { store.db.exec('BEGIN IMMEDIATE'); operation(); store.db.exec('COMMIT'); }
  catch (error) { try { store.db.exec('ROLLBACK'); } catch {} throw error; }
}
