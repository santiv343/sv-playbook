import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { DATABASE_COLUMN, SQLITE_INTEGER_MODE } from '../db/schema-vocabulary.constants.js';

export const responsibilities = sqliteTable('responsibilities', {
  id: text(DATABASE_COLUMN.ID).primaryKey(),
  classification: text(DATABASE_COLUMN.CLASSIFICATION).notNull(),
  description: text(DATABASE_COLUMN.DESCRIPTION).notNull(),
});

export const roleContracts = sqliteTable('role_contracts', {
  roleId: text(DATABASE_COLUMN.ROLE_ID).primaryKey(),
  definitionVersion: integer('definition_version').notNull(),
  mission: text('mission').notNull(),
  contextItemId: text('context_item_id').notNull(),
  contextItemVersion: integer('context_item_version').notNull(),
  inputContractRef: text('input_contract_ref').notNull(),
  outputContractRef: text('output_contract_ref').notNull(),
  minimumModelCapability: text('minimum_model_capability').notNull(),
});

export const roleCapabilityRequestClasses = sqliteTable('role_capability_request_classes', {
  roleId: text(DATABASE_COLUMN.ROLE_ID).notNull(),
  capabilityClass: text('capability_class').notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.capabilityClass] })]);

export const roleCatalogProfile = sqliteTable('role_catalog_profile', {
  profileKey: text('profile_key').primaryKey(),
  profileId: text(DATABASE_COLUMN.PROFILE_ID).notNull(),
  entryRoleId: text('entry_role_id').notNull(),
  sourceKind: text('source_kind').notNull(),
});

export const roleCatalogBootstrapReceipts = sqliteTable('role_catalog_bootstrap_receipts', {
  bootstrapKey: text('bootstrap_key').primaryKey(),
  profileId: text(DATABASE_COLUMN.PROFILE_ID).notNull(),
  profileDigest: text(DATABASE_COLUMN.PROFILE_DIGEST).notNull(),
  catalogVersion: integer(DATABASE_COLUMN.CATALOG_VERSION).notNull(),
  catalogDigest: text(DATABASE_COLUMN.CATALOG_DIGEST).notNull(),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
});

export const runtimeResponsibilities = sqliteTable('runtime_responsibilities', {
  responsibilityId: text(DATABASE_COLUMN.RESPONSIBILITY_ID).primaryKey(),
});

export const roleResponsibilities = sqliteTable('role_responsibilities', {
  roleId: text(DATABASE_COLUMN.ROLE_ID).notNull(),
  responsibilityId: text(DATABASE_COLUMN.RESPONSIBILITY_ID).notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.responsibilityId] })]);

export const roleHandoffs = sqliteTable('role_handoffs', {
  sourceRoleId: text('source_role_id').notNull(),
  targetRoleId: text('target_role_id').notNull(),
  artifactContractRef: text('artifact_contract_ref').notNull(),
}, (table) => [primaryKey({ columns: [table.sourceRoleId, table.targetRoleId, table.artifactContractRef] })]);

export const modelCapabilities = sqliteTable('model_capabilities', {
  id: text(DATABASE_COLUMN.ID).primaryKey(),
  description: text(DATABASE_COLUMN.DESCRIPTION).notNull(),
});

export const requiredRoles = sqliteTable('required_roles', {
  roleId: text(DATABASE_COLUMN.ROLE_ID).primaryKey(),
});

export const roleProhibitions = sqliteTable('role_prohibitions', {
  roleId: text(DATABASE_COLUMN.ROLE_ID).notNull(),
  operationId: text('operation_id').notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.operationId] })]);

export const rolePolicyDeclarations = sqliteTable('role_policy_declarations', {
  roleId: text(DATABASE_COLUMN.ROLE_ID).primaryKey(),
  selfCorrectionMode: text('self_correction_mode').notNull(),
});

export const roleSelfCorrectionScopes = sqliteTable('role_self_correction_scopes', {
  roleId: text(DATABASE_COLUMN.ROLE_ID).notNull(),
  outputClass: text('output_class').notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.outputClass] })]);

export const roleStopConditions = sqliteTable('role_stop_conditions', {
  roleId: text(DATABASE_COLUMN.ROLE_ID).notNull(),
  conditionId: text('condition_id').notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.conditionId] })]);

export const roleEscalationClasses = sqliteTable('role_escalation_classes', {
  roleId: text(DATABASE_COLUMN.ROLE_ID).notNull(),
  classId: text('class_id').notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.classId] })]);

export const roleCatalogVersions = sqliteTable('role_catalog_versions', {
  version: integer('version').primaryKey(),
  definitionJson: text('definition_json').notNull(),
  catalogDigest: text(DATABASE_COLUMN.CATALOG_DIGEST).notNull().unique(),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
});

export const roleCatalogActivation = sqliteTable('role_catalog_activation', {
  activationKey: text('activation_key').primaryKey(),
  catalogVersion: integer(DATABASE_COLUMN.CATALOG_VERSION).notNull(),
  catalogDigest: text(DATABASE_COLUMN.CATALOG_DIGEST).notNull(),
  activatedAt: text(DATABASE_COLUMN.ACTIVATED_AT).notNull(),
});

export const modelCapabilityEvidence = sqliteTable('model_capability_evidence', {
  id: text(DATABASE_COLUMN.ID).primaryKey(),
  providerId: text(DATABASE_COLUMN.PROVIDER_ID).notNull(),
  modelId: text(DATABASE_COLUMN.MODEL_ID).notNull(),
  variant: text(DATABASE_COLUMN.VARIANT),
  capabilityId: text(DATABASE_COLUMN.CAPABILITY_ID).notNull(),
  evidenceRef: text('evidence_ref').notNull(),
  evidenceDigest: text('evidence_digest').notNull(),
  assessedAt: text(DATABASE_COLUMN.ASSESSED_AT).notNull(),
  expiresAt: text(DATABASE_COLUMN.EXPIRES_AT).notNull(),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
});

export const modelCapabilityEvaluations = sqliteTable('model_capability_evaluations', {
  id: text(DATABASE_COLUMN.ID).primaryKey(),
  suiteId: text('suite_id').notNull(),
  suiteDigest: text('suite_digest').notNull(),
  capabilityId: text(DATABASE_COLUMN.CAPABILITY_ID).notNull(),
  profileId: text(DATABASE_COLUMN.PROFILE_ID).notNull(),
  adapterId: text(DATABASE_COLUMN.ADAPTER_ID).notNull(),
  providerId: text(DATABASE_COLUMN.PROVIDER_ID).notNull(),
  modelId: text(DATABASE_COLUMN.MODEL_ID).notNull(),
  variant: text(DATABASE_COLUMN.VARIANT),
  adapterProfileDigest: text('adapter_profile_digest').notNull(),
  sessionId: text(DATABASE_COLUMN.SESSION_ID).notNull(),
  messageId: text(DATABASE_COLUMN.MESSAGE_ID).notNull(),
  receiptJson: text(DATABASE_COLUMN.RECEIPT_JSON).notNull(),
  receiptDigest: text('receipt_digest').notNull().unique(),
  passed: integer('passed', { mode: SQLITE_INTEGER_MODE.BOOLEAN }).notNull(),
  assessedAt: text(DATABASE_COLUMN.ASSESSED_AT).notNull(),
  expiresAt: text(DATABASE_COLUMN.EXPIRES_AT).notNull(),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
});
