import type { PacketStatus } from './service.types.js';

export const PACKET_IMPORT_RESULT = { IMPORTED: 'imported', UPDATED: 'updated' } as const;
export type PacketImportResult = typeof PACKET_IMPORT_RESULT[keyof typeof PACKET_IMPORT_RESULT];

export const STATUS = {
  DRAFT: 'draft',
  READY: 'ready',
  ACTIVE: 'active',
  REVIEW: 'review',
  DONE: 'done',
  BLOCKED: 'blocked',
  DROPPED: 'dropped',
} satisfies Record<string, PacketStatus>;

export const PACKET_STATUSES: readonly PacketStatus[] = [
  STATUS.DRAFT,
  STATUS.READY,
  STATUS.ACTIVE,
  STATUS.REVIEW,
  STATUS.DONE,
  STATUS.BLOCKED,
  STATUS.DROPPED,
];

export const TRANSITION_COLUMN = {
  AT: 'at',
  FROM_STATUS: 'from_status',
  TO_STATUS: 'to_status',
} as const;

export const EVENT_TRANSITION = 'transition';
export const EVENT_NOTE = 'note';
export const EVENT_TAKEOVER = 'takeover';
export const EVENT_EVIDENCE = 'evidence';
export const EVENT_IMPORTED = 'imported';
export const EVENT_DESTRUCTIVE = 'destructive';
export const EVENT_AMEND_ACTIVE = 'amend-active';
export const SESSION_FILE_NAME = '.svp/session';
export const PACKETS_DOCS_DIR = 'docs';
export const PACKETS_DIR = 'packets';
export const TASK_ID_SEPARATOR = '-';
export const DEFAULT_EVIDENCE: readonly string[] = ['final-sha'];
export const INSERT_EVENT_SQL = 'INSERT INTO events (session_id, packet_id, command, detail, at) VALUES (?,?,?,?,?)';
export const INSERT_LEASE_SQL = 'INSERT INTO leases (packet_id, session_id, worktree, acquired_at, heartbeat_at) VALUES (?,?,?,?,?)';
export const DELETE_LEASE_SQL = 'DELETE FROM leases WHERE packet_id = ?';
export const INSERT_PACKET_SQL = 'INSERT INTO packets (id, title, path, status, body, write_set, type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)';
export const EXISTS_SQL = 'SELECT 1 FROM packets WHERE id = ?';

export const TASK_TYPE_PREFIX: Record<string, string> = {
  feature: 'FEAT',
  bug: 'BUG',
  config: 'CONFIG',
  docs: 'DOCS',
  gate: 'GATE',
  store: 'STORE',
  flow: 'FLOW',
  chore: 'CHORE',
};

export const ALLOWED: ReadonlyMap<string, readonly PacketStatus[]> = new Map([
  [STATUS.DRAFT, [STATUS.READY, STATUS.DROPPED]],
  [STATUS.READY, [STATUS.ACTIVE, STATUS.DROPPED, STATUS.DRAFT]],
  [STATUS.ACTIVE, [STATUS.REVIEW, STATUS.BLOCKED]],
  [STATUS.BLOCKED, [STATUS.READY, STATUS.DROPPED]],
  [STATUS.REVIEW, [STATUS.ACTIVE, STATUS.READY]],
]);
