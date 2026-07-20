// MIN_NODE_MAJOR/MINOR (22.13) es el piso real de Node que sv-playbook
// necesita (ver package.json engines) — nodeVersionOk() en doctor.ts lo usa
// para el primer chequeo, antes de siquiera intentar abrir un store.
export const DOCTOR_USAGE = 'Usage: sv-playbook doctor [--json]';
export const MIN_NODE_MAJOR = 22;
export const MIN_NODE_MINOR = 13;

export const DOCTOR_STATUS = {
  OK: 'ok',
  WARN: 'warn',
  FAIL: 'fail',
} as const;

export const DOCTOR_LABEL = {
  NODE: 'node',
  GIT: 'git',
  STORE: 'store',
  PACKETS: 'packets',
  LEASES: 'leases',
  BACKUP: 'backup',
  ACTIVE_LEASES: 'active-leases',
  REVIEW_MERGED: 'review-merged',
  PACKET_DRIFT: 'packet-drift',
} as const;

export const DOCTOR_DETAIL = {
  SCHEMA_CURRENT: 'schema current',
  GIT_ROOT_UNAVAILABLE: 'git root unavailable',
  NO_BACKUP: 'no local backup',
  BACKUP_DISABLED: 'backup disabled',
} as const;
