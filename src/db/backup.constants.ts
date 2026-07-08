const FORCE_TAKEOVER = 'force-takeover';

export const BACKUPS_DIR = 'backups';
export const BACKUP_PREFIX = 'playbook';
export const BACKUP_REASON = {
  MANUAL: 'manual',
  PRE_RESTORE: 'pre-restore',
  AUTO_DONE: 'auto-done',
  FORCE_TAKEOVER,
  STORE_OPEN: 'store-open',
} as const;

export const BACKUP_EVENT = {
  DONE: 'done',
  FORCE_TAKEOVER,
  RESTORE: 'restore',
  REPAIR: 'repair',
  SCHEMA_MISMATCH: 'schema-mismatch',
} as const;

export const BACKUP_RETENTION_DEFAULT = 20;
export const BACKUP_MAX_AGE_HOURS_DEFAULT = 6;
