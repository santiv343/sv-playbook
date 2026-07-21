import { STORE_INITIAL_SCHEMA_VERSION, STORE_MIGRATION_IDS } from './store.migration-manifest.constants.js';
import type { StoreMigrationId } from './store.migration-manifest.types.js';

// El índice de la migración PENDIENTE se deriva de la aritmética
// version - INITIAL — no hay una tabla de "migraciones aplicadas", el
// user_version de SQLite (que avanza 1 por migración) ES el puntero. Si
// currentVersion ya está al día o es mayor a lo que este build conoce,
// devuelve vacío (nada que aplicar, o una versión más nueva que este
// build — StoreVersionError lo maneja en otro lado).
export function pendingMigrationIds(currentVersion: number): readonly StoreMigrationId[] {
  const firstPendingIndex = currentVersion - STORE_INITIAL_SCHEMA_VERSION;
  if (firstPendingIndex < 0 || firstPendingIndex >= STORE_MIGRATION_IDS.length) return [];
  return STORE_MIGRATION_IDS.slice(firstPendingIndex);
}
