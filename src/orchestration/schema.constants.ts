import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  WORKFLOW_DEFINITION_STATUSES,
  WORKFLOW_EFFECT_STATUSES,
  WORKFLOW_EXECUTORS,
  WORKFLOW_STATUSES,
} from './orchestration.constants.js';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { DATABASE_COLUMN } from '../db/schema-vocabulary.constants.js';
import { executionProfiles } from '../gateway/schema.constants.js';
import { roleContracts } from '../roles/schema.constants.js';

const ARTIFACT_CONTRACT_STATUSES = [ARTIFACT_CONTRACT_STATUS.ACTIVE, ARTIFACT_CONTRACT_STATUS.RETIRED] as const;

// artifactContracts es el REGISTRO central de todos los contratos
// (review-candidate, review-verdict, protocolos) — cualquier dominio que
// necesite validar un artifact contra su schema pasa por acá primero
// (managed-contracts.ts la usa vía ensureManagedArtifactContract).
// roleContracts se re-exporta desde roles/schema.constants.ts para que el
// resto de orchestration/ lo importe desde un único lugar.
export const artifactContracts = sqliteTable('artifact_contracts', {
  ref: text('ref').primaryKey(),
  schemaJson: text('schema_json').notNull(),
  schemaDigest: text('schema_digest').notNull(),
  status: text('status', { enum: ARTIFACT_CONTRACT_STATUSES }).notNull(),
  createdAt: text('created_at').notNull(),
});

export { roleContracts } from '../roles/schema.constants.js';

export const roleExecutionProfilePreferences = sqliteTable('role_execution_profile_preferences', {
  roleId: text('role_id').notNull(),
  profileId: text('profile_id').notNull(),
  priority: integer('priority').notNull(),
}, (table) => [primaryKey({ columns: [table.roleId, table.profileId] })]);

export const workflowCoordinatorConfig = sqliteTable('workflow_coordinator_config', {
  configKey: text('config_key').primaryKey(),
  effectLeaseMs: integer('effect_lease_ms').notNull(),
  leaseRenewalIntervalMs: integer('lease_renewal_interval_ms').notNull(),
  idlePollIntervalMs: integer('idle_poll_interval_ms').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const workflowFailurePolicies = sqliteTable('workflow_failure_policies', {
  errorCode: text('error_code').primaryKey(),
  retryable: integer('retryable', { mode: 'boolean' }).notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const workflowDefinitions = sqliteTable('workflow_definitions', {
  id: text('id').notNull(),
  version: integer('version').notNull(),
  status: text('status', { enum: WORKFLOW_DEFINITION_STATUSES }).notNull(),
  startStepKey: text('start_step_key').notNull(),
  definitionDigest: text('definition_digest').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.id, table.version] }),
  uniqueIndex('workflow_definition_digest').on(table.definitionDigest),
]);

export const workflowDefinitionSteps = sqliteTable('workflow_definition_steps', {
  definitionId: text('definition_id').notNull(),
  definitionVersion: integer('definition_version').notNull(),
  stepKey: text('step_key').notNull(),
  executor: text('executor', { enum: WORKFLOW_EXECUTORS }).notNull(),
  roleId: text('role_id'),
  operationId: text('operation_id'),
  phase: text('phase').notNull(),
  inputContractRef: text('input_contract_ref').notNull(),
  outputContractRef: text('output_contract_ref').notNull(),
  contextTagsJson: text('context_tags_json').notNull(),
  contextReferencesJson: text('context_references_json').notNull(),
  requestedCapabilitiesJson: text('requested_capabilities_json').notNull(),
  maxAttempts: integer('max_attempts').notNull(),
}, (table) => [primaryKey({ columns: [table.definitionId, table.definitionVersion, table.stepKey] })]);

export const workflowDefinitionRoutes = sqliteTable('workflow_definition_routes', {
  definitionId: text('definition_id').notNull(),
  definitionVersion: integer('definition_version').notNull(),
  fromStepKey: text('from_step_key').notNull(),
  priority: integer('priority').notNull(),
  targetStepKey: text('target_step_key'),
  outputPointer: text('output_pointer'),
  equalsJson: text('equals_json'),
}, (table) => [primaryKey({ columns: [table.definitionId, table.definitionVersion, table.fromStepKey, table.priority] })]);

export const workflowArtifacts = sqliteTable('workflow_artifacts', {
  id: text('id').primaryKey(),
  contractRef: text('contract_ref').notNull(),
  valueJson: text('value_json').notNull(),
  valueDigest: text('value_digest').notNull(),
  producerKind: text('producer_kind', { enum: WORKFLOW_EXECUTORS }).notNull(),
  producerRef: text('producer_ref').notNull(),
  createdAt: text('created_at').notNull(),
});

export const workflowRuns = sqliteTable('workflow_runs', {
  id: text('id').primaryKey(),
  definitionId: text('definition_id').notNull(),
  definitionVersion: integer('definition_version').notNull(),
  subjectRef: text('subject_ref').notNull(),
  requestedBy: text('requested_by').notNull(),
  status: text('status', { enum: WORKFLOW_STATUSES }).notNull(),
  currentStepKey: text('current_step_key'),
  revision: integer('revision').notNull(),
  inputArtifactId: text('input_artifact_id').notNull(),
  outputArtifactId: text('output_artifact_id'),
  failureCode: text(DATABASE_COLUMN.FAILURE_CODE),
  failureDetail: text('failure_detail'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const workflowEffects = sqliteTable('workflow_effects', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull(),
  stepKey: text('step_key').notNull(),
  attempt: integer('attempt').notNull(),
  status: text('status', { enum: WORKFLOW_EFFECT_STATUSES }).notNull(),
  inputArtifactId: text('input_artifact_id').notNull(),
  outputArtifactId: text('output_artifact_id'),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: text('lease_expires_at'),
  detail: text('detail'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [index('workflow_effects_pending').on(table.status, table.createdAt)]);

export const workflowEvents = sqliteTable('workflow_events', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  workflowId: text('workflow_id').notNull(),
  revision: integer('revision').notNull(),
  eventType: text('event_type').notNull(),
  stepKey: text('step_key'),
  safePayloadJson: text('safe_payload_json').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [index('workflow_events_stream').on(table.seq)]);

export const orchestrationSchema = {
  artifactContracts,
  roleContracts,
  executionProfiles,
  roleExecutionProfilePreferences,
  workflowCoordinatorConfig,
  workflowFailurePolicies,
  workflowDefinitions,
  workflowDefinitionSteps,
  workflowDefinitionRoutes,
  workflowArtifacts,
  workflowRuns,
  workflowEffects,
  workflowEvents,
};
