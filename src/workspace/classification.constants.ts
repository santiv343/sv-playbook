import { STATUS } from '../tasks/service.constants.js';
import type { PacketStatus } from '../tasks/service.types.js';

// La clasificación de un archivo sucio depende de a qué GRUPO de estados
// del packet que lo reclama pertenece — CURRENT (ready/active/review, hay
// trabajo real en curso), PLANNED (draft/blocked, todavía no arrancó de
// verdad), TERMINAL (done/dropped, ya cerrado — reclamarlo ahora es
// sospechoso). Este mapeo es lo que classifyWorkspace usa para derivar
// AMBIGUOUS/ORPHAN sin tener que consultar el status de cada packet cada
// vez.
export const WORKSPACE_OWNERSHIP = {
  CURRENT: 'current',
  PLANNED: 'planned',
  AMBIGUOUS: 'multiple-non-terminal',
  TERMINAL: 'terminal-only',
  ORPHAN: 'orphan',
} as const;

export const CURRENT_PACKET_STATUSES: readonly PacketStatus[] = [
  STATUS.READY,
  STATUS.ACTIVE,
  STATUS.REVIEW,
];

export const PLANNED_PACKET_STATUSES: readonly PacketStatus[] = [
  STATUS.DRAFT,
  STATUS.BLOCKED,
];

export const TERMINAL_PACKET_STATUSES: readonly PacketStatus[] = [
  STATUS.DONE,
  STATUS.DROPPED,
];

export const GIT_CHANGE_CODE = {
  COPIED: 'C',
  RENAMED: 'R',
} as const;

export const GIT_STATUS_RECORD = {
  PATH_OFFSET: 3,
  STATUS_LENGTH: 2,
} as const;
