// WAL (write-ahead logging) es lo que permite lecturas concurrentes
// mientras hay una escritura en curso — necesario porque el daemon escribe
// mientras `status`/`doctor`/otros comandos de sólo lectura pueden estar
// abriendo el store al mismo tiempo. LOCKING_EXCLUSIVE vs NORMAL es el
// mecanismo real detrás del "single blessed writer": el daemon toma
// EXCLUSIVE, cualquier otro proceso que intente abrir para escribir choca.
// QUERY_ONLY_ON es lo que fuerza openStoreReadOnly a nivel SQLite (no sólo
// convención de código) — un intento de escritura falla en el motor mismo.
export const STORE_PRAGMA = {
  BUSY_TIMEOUT: 'PRAGMA busy_timeout = 5000;',
  FOREIGN_KEYS_ON: 'PRAGMA foreign_keys = ON;',
  JOURNAL_MODE_WAL: 'PRAGMA journal_mode = WAL;',
  LOCKING_EXCLUSIVE: 'PRAGMA locking_mode = EXCLUSIVE;',
  LOCKING_NORMAL: 'PRAGMA locking_mode = NORMAL;',
  QUERY_ONLY_ON: 'PRAGMA query_only = ON;',
  USER_VERSION: 'PRAGMA user_version',
} as const;
