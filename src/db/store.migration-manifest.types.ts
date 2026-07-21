import { STORE_MIGRATION_IDS } from './store.migration-manifest.constants.js';

// Union literal de TODOS los ids de migración conocidos — deriva del array
// real, así agregar una migración nueva a STORE_MIGRATION_IDS amplía este
// tipo automáticamente.
export type StoreMigrationId = typeof STORE_MIGRATION_IDS[number];
