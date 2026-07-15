export const ORM_BOUNDARY_VIOLATION = {
  DATABASE_HANDLE: 'database-handle',
  RAW_QUERY_CALL: 'raw-query-call',
  SQL_LITERAL: 'sql-literal',
} as const;

export const ORM_BOUNDARY_SOURCE_KIND = 'TS' as const;
export const DATABASE_HANDLE_MEMBER = 'db' as const;

export const ORM_INFRASTRUCTURE_PATH = 'src/db/' as const;

export const RAW_DATABASE_METHOD = {
  EXEC: 'exec',
  PREPARE: 'prepare',
} as const;

export const SQL_IDENTIFIER_SUFFIX = 'SQL' as const;
export const SQLITE_MODULE_ID = 'node:sqlite' as const;
export const SQL_DDL_PATTERN = /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TRIGGER|VIEW)\b/i;
