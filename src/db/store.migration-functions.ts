// Barril de re-exports: el orden en que STORE_MIGRATION_IDS
// (store.migration-manifest.constants.ts) las lista es lo que determina el
// orden real de ejecución, no el orden acá — este archivo sólo junta las
// funciones para que quien orqueste migraciones (store.migrations.ts) las
// importe desde un único lugar.
export { addVersionedWorkDefinitions, addTypedRunSpecReferences } from './work-definition.migrations.js';
export { addVersionedRoleCatalog } from './role-catalog.migrations.js';
export { addRoleProjectionReceipts } from './role-projection.migrations.js';
export { addSemanticRoleContractFields } from './semantic-role-contract.migrations.js';
export { addModelCapabilityEvaluations } from './model-capability-evaluation.migrations.js';
export { addReviewCandidates } from './review-candidate.migrations.js';
