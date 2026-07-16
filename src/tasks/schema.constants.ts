import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { PacketStatus } from './service.types.js';

export const packets = sqliteTable('packets', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  path: text('path').notNull(),
  status: text('status').$type<PacketStatus>().notNull(),
  body: text('body').notNull(),
  writeSetJson: text('write_set').notNull(),
  type: text('type').notNull(),
  pullRequest: text('pr'),
  priority: integer('priority').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
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

export const taskSchema = { packets, packetDependencies, packetDefinitions, taskEvents };
