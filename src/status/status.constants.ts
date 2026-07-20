import { PACKET_STATUSES } from '../tasks/service.constants.js';

export const STATUS_SQL = {
  PACKETS: 'SELECT id, title, status, updated_at FROM packets ORDER BY priority, id',
  LEASES: 'SELECT packet_id, session_id, worktree, heartbeat_at FROM leases',
  LAST_EVENTS: 'SELECT packet_id, command, detail, at FROM events WHERE packet_id IS NOT NULL ORDER BY seq ASC',
} as const;

// DISPLAY_ORDER es el orden VISUAL del tablero (`status`) — deliberadamente
// distinto del orden natural de PACKET_STATUSES (tasks/service.constants.ts,
// draft primero). Acá lo que necesita atención humana YA (active, blocked)
// va arriba, y lo terminal (done, dropped) al final, separado por
// DIVIDER_BEFORE — prioriza lo accionable sobre el orden "lógico" del
// ciclo de vida.
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

export const COL_ID = 'ID';
export const COL_STATUS = 'STATUS';
export const COL_LEASE = 'LEASE';
export const COL_LAST_EVENT = 'LAST EVENT';
export const COL_TITLE = 'TITLE';

export const TABLE_COLUMNS = [COL_ID, COL_STATUS, COL_LEASE, COL_LAST_EVENT, COL_TITLE] as const;

export const TITLE_WIDTH = 50;

export { PACKET_STATUSES };
