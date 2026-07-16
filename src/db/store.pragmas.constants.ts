export const STORE_PRAGMA = {
  BUSY_TIMEOUT: 'PRAGMA busy_timeout = 5000;',
  FOREIGN_KEYS_ON: 'PRAGMA foreign_keys = ON;',
  JOURNAL_MODE_WAL: 'PRAGMA journal_mode = WAL;',
  LOCKING_EXCLUSIVE: 'PRAGMA locking_mode = EXCLUSIVE;',
  LOCKING_NORMAL: 'PRAGMA locking_mode = NORMAL;',
  QUERY_ONLY_ON: 'PRAGMA query_only = ON;',
  USER_VERSION: 'PRAGMA user_version',
} as const;
