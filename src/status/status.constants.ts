import { PACKET_STATUSES } from '../tasks/service.constants.js';

export const STATUS_SQL = {
  PACKETS: 'SELECT id, title, status, updated_at FROM packets ORDER BY priority, id',
  LEASES: 'SELECT packet_id, session_id, worktree, heartbeat_at FROM leases',
  LAST_EVENTS: 'SELECT packet_id, command, detail, at FROM events ORDER BY seq ASC',
} as const;

export const COLUMNS = [
  { key: 'id', header: 'ID', width: 24 },
  { key: 'status', header: 'STATUS', width: 8 },
  { key: 'lease', header: 'LEASE', width: 24 },
  { key: 'lastEvent', header: 'LAST EVENT', width: 30 },
  { key: 'title', header: 'TITLE', width: 40 },
] as const;

export const SORT_ORDER: readonly string[] = ['active', 'blocked', 'ready', 'review', 'draft', 'done', 'dropped'];

export const DIVIDER_BEFORE: readonly string[] = ['done', 'dropped'];

export { PACKET_STATUSES };
