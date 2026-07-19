export const EXIT: Readonly<{ OK: 0; GATE_FAIL: 1; USAGE: 2; SYSTEM: 3 }> = Object.freeze({
  OK: 0,
  GATE_FAIL: 1,
  USAGE: 2,
  SYSTEM: 3,
});

export const SESSION_ROLE_FILE = '.svp-session-role';
export const DESTRUCTIVE_LOG_FILE = '.svp/destructive-events.log';
export const CLI_ASSIGNMENT_SEPARATOR = '=';
export const CLI_FORCE_FLAG = '--force';
export const CONFIRM_DESTRUCTIVE_FLAG = '--confirm-destructive';
export const USAGE_HEADER = 'Usage:';
export const ERROR_PREFIX = 'error: ';
export const CLI_OPTION_TYPE = {
  BOOLEAN: 'boolean',
} as const;

export const DONE_COUNT_SQL = "SELECT COUNT(*) AS cnt FROM packets WHERE status = 'done'";
export const EVENT_COUNT_SQL = 'SELECT COUNT(*) AS cnt FROM events';
