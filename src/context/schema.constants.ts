import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { DATABASE_COLUMN } from '../db/schema-vocabulary.constants.js';

// Definiciones Drizzle que espejan CONTEXT_STORE_SCHEMA
// (db/context.schema.constants.ts) — dos representaciones del MISMO schema
// SQL: el DDL crudo (para CREATE TABLE) y estas tablas tipadas (para
// store.orm). Deben mantenerse en sincronía manualmente; no hay generación
// automática de uno a partir del otro.
export const contextItems = sqliteTable('context_items', {
  id: text('id').notNull(),
  version: integer('version').notNull(),
  kind: text(DATABASE_COLUMN.KIND).notNull(),
  status: text('status').notNull(),
  strength: text('strength').notNull(),
  semanticKey: text('semantic_key').notNull(),
  body: text('body').notNull(),
  provenance: text('provenance').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [primaryKey({ columns: [table.id, table.version] })]);

export const contextItemSelectors = sqliteTable('context_item_selectors', {
  itemId: text('item_id').notNull(),
  itemVersion: integer('item_version').notNull(),
  dimension: text('dimension').notNull(),
  value: text('value').notNull(),
}, (table) => [primaryKey({ columns: [table.itemId, table.itemVersion, table.dimension, table.value] })]);

export const contextItemCapabilities = sqliteTable('context_item_capabilities', {
  itemId: text('item_id').notNull(),
  itemVersion: integer('item_version').notNull(),
  capability: text('capability').notNull(),
  effect: text('effect').notNull(),
}, (table) => [primaryKey({ columns: [table.itemId, table.itemVersion, table.capability] })]);

export const contextPrecedence = sqliteTable('context_precedence', {
  kind: text(DATABASE_COLUMN.KIND).primaryKey(),
  rank: integer(DATABASE_COLUMN.RANK).notNull().unique(),
});
