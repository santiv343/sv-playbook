import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const responsibilityInputPolicies = sqliteTable('responsibility_input_policies', {
  responsibilityId: text('responsibility_id').primaryKey(),
  phase: text('phase').notNull(),
  requiredStatus: text('required_status').notNull(),
  contractRef: text('contract_ref').notNull(),
  sourceKind: text('source_kind').notNull(),
});

export const reviewCandidates = sqliteTable('review_candidates', {
  id: text('id').primaryKey(),
  packetId: text('packet_id').notNull(),
  workDefinitionVersion: integer('work_definition_version').notNull(),
  workDefinitionDigest: text('work_definition_digest').notNull(),
  candidateSha: text('candidate_sha').notNull(),
  branch: text('branch').notNull(),
  producerSessionId: text('producer_session_id').notNull(),
  artifactId: text('artifact_id').notNull().unique(),
  createdAt: text('created_at').notNull(),
});

export const reviewSchema = { responsibilityInputPolicies, reviewCandidates };
