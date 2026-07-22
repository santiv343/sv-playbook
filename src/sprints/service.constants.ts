// SPRINT_STATE.CLOSED es literalmente el mismo string que
// PROMOTION_STATUS.CLOSED (promotion.constants.ts) — reutilizado a
// propósito, no coincidencia (ver el comentario ahí sobre PRINCIPLE-011).
export const SPRINT_STATE = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const;

export const GET_SPRINT_SQL = 'SELECT state FROM sprints WHERE id = ?';
