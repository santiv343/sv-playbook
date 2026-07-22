import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { EXECUTION_PROFILES_TABLE, MAX_RUN_DURATION_COLUMN, RUN_SPECS_TABLE, RUN_SPEC_RETRY_OF_COLUMN } from '../db/context.schema.constants.js';

// El "rastro de auditoría" completo de un run queda repartido en 3 tablas
// append-only: gatewaySessions (1 fila, se crea una vez), gatewayTurns
// (1 fila por turno, puede haber reintentos), gatewayRunEvents (1 fila por
// observación con cambio de progreso — historial completo, nunca se
// borra). gatewayRunState es la ÚNICA tabla mutable de las cuatro — el
// snapshot "actual" que se pisa en cada observación; runStatusScope()
// (gateway-run-repository.ts) es el compare-and-swap que la protege.
export const executionProfiles = sqliteTable(EXECUTION_PROFILES_TABLE, {
  id: text('id').primaryKey(),
  roleId: text('role_id').notNull(),
  adapterId: text('adapter_id').notNull(),
  agentId: text('agent_id').notNull(),
  providerId: text('provider_id').notNull(),
  modelId: text('model_id').notNull(),
  variant: text('variant'),
  adapterConfigJson: text('adapter_config_json').notNull(),
  observationIntervalMs: integer('observation_interval_ms').notNull(),
  noProgressTimeoutMs: integer('no_progress_timeout_ms').notNull(),
  cancellationGraceMs: integer('cancellation_grace_ms').notNull(),
  maxRunDurationMs: integer(MAX_RUN_DURATION_COLUMN),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
});

export const executionProfileTools = sqliteTable('execution_profile_tools', {
  profileId: text('profile_id').notNull(),
  toolId: text('tool_id').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
}, (table) => [primaryKey({ columns: [table.profileId, table.toolId] })]);

export const runSpecs = sqliteTable(RUN_SPECS_TABLE, {
  id: text('id').primaryKey(),
  roleId: text('role_id').notNull(),
  phase: text('phase').notNull(),
  taskRef: text('task_ref').notNull(),
  dispatchRef: text('dispatch_ref').notNull(),
  workDefinitionId: text('work_definition_id'),
  workDefinitionVersion: integer('work_definition_version'),
  workDefinitionDigest: text('work_definition_digest'),
  workflowEffectId: text('workflow_effect_id'),
  inputArtifactId: text('input_artifact_id'),
  contextPackId: text('context_pack_id').notNull(),
  executionProfileId: text('execution_profile_id').notNull(),
  executionProfileJson: text('execution_profile_json').notNull(),
  tagsJson: text('tags_json').notNull(),
  referencesJson: text('references_json').notNull(),
  requestedCapabilitiesJson: text('requested_capabilities_json').notNull(),
  outputContractRef: text('output_contract_ref').notNull(),
  noProgressTimeoutMs: integer('no_progress_timeout_ms').notNull(),
  cancellationGraceMs: integer('cancellation_grace_ms').notNull(),
  maxRunDurationMs: integer(MAX_RUN_DURATION_COLUMN),
  specDigest: text('spec_digest').notNull(),
  createdAt: text('created_at').notNull(),
  retryOfRunSpecId: text(RUN_SPEC_RETRY_OF_COLUMN),
});

export const runDispatches = sqliteTable('run_dispatches', {
  dispatchRef: text('dispatch_ref').notNull(),
  roleId: text('role_id').notNull(),
  phase: text('phase').notNull(),
  taskRef: text('task_ref').notNull(),
  runSpecId: text('run_spec_id').notNull().unique(),
  createdAt: text('created_at').notNull(),
}, (table) => [primaryKey({ columns: [table.dispatchRef, table.roleId, table.phase] })]);

export const dispatchIntents = sqliteTable('dispatch_intents', {
  id: text('id').primaryKey(),
  runSpecId: text('run_spec_id').notNull(),
  operationKey: text('operation_key').notNull().unique(),
  status: text('status').notNull(),
  detail: text('detail'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const gatewaySessions = sqliteTable('gateway_sessions', {
  runSpecId: text('run_spec_id').primaryKey(),
  createIntentId: text('create_intent_id').notNull().unique(),
  adapterSessionId: text('adapter_session_id').notNull().unique(),
  profileDigest: text('profile_digest').notNull(),
  sessionReceiptJson: text('session_receipt_json').notNull(),
  createdAt: text('created_at').notNull(),
});

export const gatewayTurns = sqliteTable('gateway_turns', {
  runSpecId: text('run_spec_id').notNull(),
  turnSequence: integer('turn_sequence').notNull(),
  submitIntentId: text('submit_intent_id').notNull().unique(),
  adapterSessionId: text('adapter_session_id').notNull(),
  messageId: text('message_id').notNull().unique(),
  submissionReceiptJson: text('submission_receipt_json').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [primaryKey({ columns: [table.runSpecId, table.turnSequence] })]);

export const gatewayRunState = sqliteTable('gateway_run_state', {
  runSpecId: text('run_spec_id').primaryKey(),
  adapterSessionId: text('adapter_session_id').notNull(),
  messageId: text('message_id').notNull(),
  status: text('status').notNull(),
  progressToken: text('progress_token').notNull(),
  observedToolIdsJson: text('observed_tool_ids_json').notNull(),
  lastObservedAt: text('last_observed_at').notNull(),
  lastProgressAt: text('last_progress_at').notNull(),
  terminalAt: text('terminal_at'),
  outputJson: text('output_json'),
  outputDigest: text('output_digest'),
  observationReceiptJson: text('observation_receipt_json'),
  cancellationReceiptJson: text('cancellation_receipt_json'),
  detail: text('detail'),
  updatedAt: text('updated_at').notNull(),
});

export const gatewayRunEvents = sqliteTable('gateway_run_events', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  runSpecId: text('run_spec_id').notNull(),
  status: text('status').notNull(),
  progressToken: text('progress_token').notNull(),
  observedToolIdsJson: text('observed_tool_ids_json').notNull(),
  receiptJson: text('receipt_json').notNull(),
  observedAt: text('observed_at').notNull(),
});

export const roleProjectionReceipts = sqliteTable('role_projection_receipts', {
  id: text('id').primaryKey(),
  adapterId: text('adapter_id').notNull(),
  catalogVersion: integer('catalog_version').notNull(),
  catalogDigest: text('catalog_digest').notNull(),
  profileDigest: text('profile_digest').notNull(),
  artifactDigest: text('artifact_digest').notNull(),
  createdAt: text('created_at').notNull(),
});

export const roleProjectionActivation = sqliteTable('role_projection_activation', {
  adapterId: text('adapter_id').primaryKey(),
  receiptId: text('receipt_id').notNull(),
  activatedAt: text('activated_at').notNull(),
});

export const gatewaySchema = {
  executionProfiles,
  executionProfileTools,
  runSpecs,
  runDispatches,
  dispatchIntents,
  gatewaySessions,
  gatewayTurns,
  gatewayRunState,
  gatewayRunEvents,
  roleProjectionReceipts,
  roleProjectionActivation,
};
