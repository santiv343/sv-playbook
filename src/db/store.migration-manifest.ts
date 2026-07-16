import { STORE_INITIAL_SCHEMA_VERSION, STORE_MIGRATION_IDS } from './store.migration-manifest.constants.js';
import type { StoreMigrationId } from './store.migration-manifest.types.js';

export function pendingMigrationIds(currentVersion: number): readonly StoreMigrationId[] {
  const firstPendingIndex = currentVersion - STORE_INITIAL_SCHEMA_VERSION;
  if (firstPendingIndex < 0 || firstPendingIndex >= STORE_MIGRATION_IDS.length) return [];
  return STORE_MIGRATION_IDS.slice(firstPendingIndex);
}
