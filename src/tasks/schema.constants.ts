import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { DATABASE_COLUMN, DATABASE_TABLE } from '../db/schema-vocabulary.constants.js';
import type { PacketStatus } from './service.types.js';

export const packets = sqliteTable('packets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  path: text('path'),
  status: text('status').$type<PacketStatus>().notNull(),
  body: text('body').notNull(),
  writeSetJson: text('write_set').notNull(),
  type: text('type').notNull(),
  pullRequest: text('pr'),
  priority: integer('priority').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text(DATABASE_COLUMN.UPDATED_AT).notNull(),
});

export const packetDependencies = sqliteTable('packet_deps', {
  packetId: text('packet_id').notNull().references(() => packets.id),
  dependsOnId: text('depends_on_id').notNull().references(() => packets.id),
}, (table) => [primaryKey({ columns: [table.packetId, table.dependsOnId] })]);

export const packetDefinitions = sqliteTable('packet_definitions', {
  packetId: text('packet_id').notNull().references(() => packets.id),
  version: integer('version').notNull(),
  definitionDigest: text('definition_digest').notNull(),
  definitionJson: text('definition_json').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [primaryKey({ columns: [table.packetId, table.version] })]);

export const taskEvents = sqliteTable('events', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id'),
  packetId: text('packet_id'),
  command: text('command').notNull(),
  detail: text('detail'),
  at: text('at').notNull(),
});

export const decisions = sqliteTable(DATABASE_TABLE.DECISIONS, {
  id: text(DATABASE_COLUMN.ID).primaryKey(),
  question: text(DATABASE_COLUMN.QUESTION).notNull(),
  answer: text(DATABASE_COLUMN.ANSWER),
  packetId: text(DATABASE_COLUMN.PACKET_ID).references(() => packets.id),
  answeredAgainstVersion: integer(DATABASE_COLUMN.ANSWERED_AGAINST_VERSION),
  createdAt: text(DATABASE_COLUMN.CREATED_AT).notNull(),
  updatedAt: text(DATABASE_COLUMN.UPDATED_AT).notNull(),
});

export const taskSchema = { packets, packetDependencies, packetDefinitions, taskEvents, decisions };
