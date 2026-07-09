import { PACKET_STATUSES } from '../tasks/service.constants.js';

export const STATUS_SQL = {
  PACKETS: 'SELECT id, title, status, updated_at FROM packets ORDER BY priority, id',
  LEASES: 'SELECT packet_id, session_id, worktree, heartbeat_at FROM leases',
  LAST_EVENTS: 'SELECT packet_id, command, detail, at FROM events ORDER BY seq ASC',
} as const;

export const DISPLAY_ORDER: readonly string[] = [
  'active',
  'blocked',
  'ready',
  'review',
  'draft',
  'done',
  'dropped',
];

export const DIVIDER_BEFORE: ReadonlySet<string> = new Set(['done', 'dropped']);

export const TABLE_COLUMNS = ['ID', 'STATUS', 'LEASE', 'LAST EVENT', 'TITLE'] as const;

export const TITLE_WIDTH = 50;

export const COLUMN_PAD = 2;

export { PACKET_STATUSES };
