import { PACKET_STATUSES } from '../tasks/service.constants.js';

export const STATUS_SQL = {
  PACKETS: 'SELECT id, title, status, updated_at FROM packets ORDER BY priority, id',
  LEASES: 'SELECT packet_id, session_id, worktree, heartbeat_at FROM leases',
  LAST_EVENTS: 'SELECT packet_id, command, detail, at FROM events ORDER BY seq ASC',
} as const;
export { PACKET_STATUSES };
