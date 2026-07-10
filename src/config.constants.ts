import type { PlaybookConfig } from './config.types.js';
import { BACKUP_EVENT, BACKUP_MAX_AGE_HOURS_DEFAULT, BACKUP_RETENTION_DEFAULT } from './db/backup.constants.js';

export const DEFAULTS: PlaybookConfig = {
  productName: 'unnamed',
  chatLanguage: 'en',
  tier: 'TIER-2',
  verifyCommand: 'npm run verify',
  enforceVerifyOnReview: true,
  autonomy: 'strict',
  backup: {
    enabled: true,
    retention: BACKUP_RETENTION_DEFAULT,
    maxAgeHours: BACKUP_MAX_AGE_HOURS_DEFAULT,
    onEvents: [BACKUP_EVENT.DONE, BACKUP_EVENT.FORCE_TAKEOVER, BACKUP_EVENT.RESTORE, BACKUP_EVENT.SCHEMA_MISMATCH],
  },
};
