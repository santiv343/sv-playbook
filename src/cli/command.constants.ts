export const EXIT: Readonly<{ OK: 0; GATE_FAIL: 1; USAGE: 2; SYSTEM: 3 }> = Object.freeze({
  OK: 0,
  GATE_FAIL: 1,
  USAGE: 2,
  SYSTEM: 3,
});

export const DONE_COUNT_SQL = "SELECT COUNT(*) AS cnt FROM packets WHERE status = 'done'";
export const EVENT_COUNT_SQL = 'SELECT COUNT(*) AS cnt FROM events';
