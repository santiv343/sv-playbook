import type { PacketStatus } from './service.types.js';

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

export const EVENT_TRANSITION = 'transition';
export const EVENT_NOTE = 'note';
export const EVENT_TAKEOVER = 'takeover';
export const EVENT_EVIDENCE = 'evidence';
export const SESSION_FILE_NAME = '.svp-session';
export const PACKETS_DOCS_DIR = 'docs';
export const PACKETS_DIR = 'packets';
export const DEFAULT_EVIDENCE: readonly string[] = ['final-sha'];
export const LEASE_TTL_MS = 30 * 60 * 1000;
export const INSERT_EVENT_SQL = 'INSERT INTO events (session_id, packet_id, command, detail, at) VALUES (?,?,?,?,?)';
export const INSERT_LEASE_SQL = 'INSERT INTO leases (packet_id, session_id, worktree, acquired_at, heartbeat_at) VALUES (?,?,?,?,?)';
export const DELETE_LEASE_SQL = 'DELETE FROM leases WHERE packet_id = ?';
export const INSERT_PACKET_SQL = 'INSERT INTO packets (id, title, path, status, body, write_set, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)';

export const ALLOWED: ReadonlyMap<string, readonly PacketStatus[]> = new Map([
  [STATUS.DRAFT, [STATUS.READY, STATUS.DROPPED]],
  [STATUS.READY, [STATUS.ACTIVE, STATUS.DROPPED, STATUS.DRAFT]],
  [STATUS.ACTIVE, [STATUS.REVIEW, STATUS.BLOCKED]],
  [STATUS.BLOCKED, [STATUS.READY, STATUS.DROPPED]],
  [STATUS.REVIEW, [STATUS.ACTIVE, STATUS.DONE, STATUS.READY]],
]);
