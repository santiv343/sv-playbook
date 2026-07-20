const FORCE_TAKEOVER = 'force-takeover';

export const BACKUPS_DIR = 'backups';
export const BACKUP_PREFIX = 'playbook';
export const BACKUP_REFUSED_PREFIX = 'backup refused:';
// Dos vocabularios relacionados pero distintos: BACKUP_REASON queda
// grabado en la metadata de CADA backup individual ("por qué se tomó
// éste"); BACKUP_EVENT es el vocabulario que se compara contra
// `config.backup.onEvents` (instancia por instancia) para decidir si un
// evento del sistema amerita forzar un backup ahora, sin esperar a que
// venza `maxAgeHours`. No son 1:1 — MANUAL y STORE_OPEN son razones sin
// evento correspondiente.
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
export const BACKUP_RETENTION_FLOOR_DEFAULT = 3;
export const BACKUP_MAX_FAILED_CYCLES = 3;
export const BACKUP_MANIFEST_FIELD = { SHA256: 'sha256' } as const;
