import type { PlaybookConfig } from './config.types.js';
import { BACKUP_EVENT, BACKUP_MAX_AGE_HOURS_DEFAULT, BACKUP_RETENTION_DEFAULT } from './db/backup.constants.js';

// DEFAULTS es la única fuente de verdad para cada valor de config no
// declarado por el usuario — loadConfig() (config.ts) hace `{ ...DEFAULTS }`
// (shallow) y mergea encima lo que venga de playbook.config.json. Ver F-005
// en findings.md: por ser shallow, los objetos anidados (tasks, backup,
// gates) comparten referencia entre llamadas si nadie los reemplaza.
export const PLAYBOOK_CONFIG_FILE_NAME = 'playbook.config.json';

export const MODEL_EVALUATION_DEFAULTS = {
  evidenceValidityDays: 30,
} as const;

export const REVIEW_CANDIDATE_MAX_BYTES_DEFAULT = 16 * 1024 * 1024;
export const REVIEW_PREFLIGHT_DEFAULTS = {
  baseReference: 'main',
  preparationCommand: '',
  noOutputTimeoutMs: 10 * 60 * 1_000,
} as const;

export const TASKS_DEFAULTS = {
  leaseTtlMs: 30 * 60 * 1_000,
  complexityCheckpoint: {
    enabled: false,
    requireDecisionForTypes: [],
    requireDecisionForPaths: [],
  },
};

// dispatchTimeoutMs cubre cuánto puede tardar el daemon en responder a un
// `dispatch start` reenviado (espera un turno de agente real: sesión +
// prompt + poll hasta terminal, minutos, no segundos). El default replica
// el piso que ya probamos en vivo contra OpenCode/DeepSeek; configurable
// por proyecto porque un execution profile con modelos más lentos, o un
// `maxRunDurationMs` de perfil más alto, puede necesitar más margen.
export const DAEMON_DEFAULTS = {
  dispatchTimeoutMs: 1_200_000,
} as const;

export const DEFAULTS: PlaybookConfig = {
  productName: 'unnamed',
  chatLanguage: 'en',
  tier: 'TIER-2',
  verifyCommand: 'npm run verify',
  autonomy: 'strict',
  maxConcurrentWorkers: 3,
  reviewCandidateMaxBytes: REVIEW_CANDIDATE_MAX_BYTES_DEFAULT,
  reviewPreflight: { ...REVIEW_PREFLIGHT_DEFAULTS },
  tasks: { ...TASKS_DEFAULTS },
  backup: {
    enabled: true,
    retention: BACKUP_RETENTION_DEFAULT,
    maxAgeHours: BACKUP_MAX_AGE_HOURS_DEFAULT,
    onEvents: [BACKUP_EVENT.DONE, BACKUP_EVENT.FORCE_TAKEOVER, BACKUP_EVENT.RESTORE, BACKUP_EVENT.SCHEMA_MISMATCH],
  },
  modelEvaluation: { ...MODEL_EVALUATION_DEFAULTS },
  daemon: { ...DAEMON_DEFAULTS },
  gates: {
    maxLines: 350,
    maxLinesPerFunction: 60,
    complexity: 10,
    cognitiveComplexity: 10,
    layout: true,
  },
};
