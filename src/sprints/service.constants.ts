export const SPRINT_STATE = {
  OPEN: 'open',
  CLOSED: 'closed',
} as const;

export const GET_SPRINT_SQL = 'SELECT state FROM sprints WHERE id = ?';
