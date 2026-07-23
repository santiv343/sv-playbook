import * as s from './core.js';
import { ConfigError } from '../config.errors.js';
import { SchemaError } from './core.errors.js';
import { BACKUP_EVENT } from '../db/backup.constants.js';
import { DEFAULTS } from '../config.constants.js';

const tierValues = ['TIER-1', 'TIER-2', 'TIER-3'] as const;
const autonomyValues = ['strict', 'standard', 'high'] as const;

export const TierSchema = s.enu(tierValues);
export const AutonomySchema = s.enu(autonomyValues);
export const BackupEventSchema = s.enu([
  BACKUP_EVENT.DONE,
  BACKUP_EVENT.FORCE_TAKEOVER,
  BACKUP_EVENT.RESTORE,
  BACKUP_EVENT.REPAIR,
  BACKUP_EVENT.SCHEMA_MISMATCH,
] as const);

export const BackupConfigSchema = s.object({
  enabled: s.boolean(),
  retention: s.positiveInteger(),
  maxAgeHours: s.positiveInteger(),
  onEvents: s.array(BackupEventSchema),
  dir: s.optional(s.string()),
});

const SourceDebtBaselineSchema = s.object({
  count: s.integer(),
  digest: s.string(),
});

// baseline.* es la config de deuda MONOTÓNICA (PRINCIPLE-015 aplicado):
// ormApplicationSql/literalComparisons/duplicateStrings guardan un count +
// digest congelados — cada gate (orm-boundary.ts, literal-comparison.ts,
// duplicate-string.ts) compara la deuda ACTUAL contra esto y sólo falla si
// creció. `commit`/`timestamp`/`fingerprints` son metadata de cuándo se
// congeló, no reglas activas.
export const BaselineConfigSchema = s.object({
  commit: s.optional(s.string()),
  timestamp: s.optional(s.string()),
  fingerprints: s.optional(s.array(s.string())),
  ormApplicationSql: s.optional(SourceDebtBaselineSchema),
  literalComparisons: s.optional(SourceDebtBaselineSchema),
  duplicateStrings: s.optional(SourceDebtBaselineSchema),
});

export const GatesConfigSchema = s.object({
  maxLines: s.positiveInteger(),
  maxLinesPerFunction: s.positiveInteger(),
  complexity: s.positiveInteger(),
  cognitiveComplexity: s.positiveInteger(),
  layout: s.boolean(),
});

export const ModelEvaluationConfigSchema = s.object({
  evidenceValidityDays: s.positiveInteger(),
});

export const DaemonConfigSchema = s.object({
  dispatchTimeoutMs: s.positiveInteger(),
});

export const ReviewPreflightConfigSchema = s.object({
  baseReference: s.nonEmptyString(),
  preparationCommand: s.string(),
  noOutputTimeoutMs: s.positiveInteger(),
});

export const ComplexityCheckpointConfigSchema = s.object({
  enabled: s.boolean(),
  requireDecisionForTypes: s.array(s.string()),
  requireDecisionForPaths: s.array(s.string()),
});

export const TasksConfigSchema = s.object({
  leaseTtlMs: s.positiveInteger(),
  complexityCheckpoint: ComplexityCheckpointConfigSchema,
});

export const PlaybookConfigSchema = s.object({
  productName: s.string(),
  chatLanguage: s.string(),
  tier: TierSchema,
  verifyCommand: s.string(),
  autonomy: AutonomySchema,
  maxConcurrentWorkers: s.positiveInteger(),
  reviewCandidateMaxBytes: s.positiveInteger(),
  reviewPreflight: ReviewPreflightConfigSchema,
  tasks: TasksConfigSchema,
  backup: BackupConfigSchema,
  modelEvaluation: ModelEvaluationConfigSchema,
  daemon: DaemonConfigSchema,
  baseline: s.optional(BaselineConfigSchema),
  gates: GatesConfigSchema,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeNested<T extends Record<string, unknown>>(
  raw: unknown,
  defaults: T,
): T {
  return isRecord(raw) ? { ...defaults, ...raw } : { ...defaults };
}

// Merge manual campo por campo (no `{...DEFAULTS, ...raw}` shallow) porque
// los objetos anidados (reviewPreflight/tasks/backup/gates) necesitan su
// PROPIO merge con sus propios defaults — mergeNested — así un usuario que
// sólo declara `backup: { retention: 5 }` no pierde enabled/maxAgeHours/
// onEvents por default. Ver F-005 en findings.md: config.constants.ts SÍ
// hace shallow copy de DEFAULTS, pero acá en el merge real es profundo por
// campo — dos capas distintas del mismo sistema de config con estrategias
// de copia diferentes.
function mergeDefaults(raw: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    productName: raw.productName ?? DEFAULTS.productName,
    chatLanguage: raw.chatLanguage ?? DEFAULTS.chatLanguage,
    tier: raw.tier ?? DEFAULTS.tier,
    verifyCommand: raw.verifyCommand ?? DEFAULTS.verifyCommand,
    autonomy: raw.autonomy ?? DEFAULTS.autonomy,
    maxConcurrentWorkers: raw.maxConcurrentWorkers ?? DEFAULTS.maxConcurrentWorkers,
    reviewCandidateMaxBytes: raw.reviewCandidateMaxBytes ?? DEFAULTS.reviewCandidateMaxBytes,
    reviewPreflight: mergeNested(raw.reviewPreflight, DEFAULTS.reviewPreflight),
    tasks: mergeNested(raw.tasks, DEFAULTS.tasks),
    backup: mergeNested(raw.backup, DEFAULTS.backup),
    modelEvaluation: mergeNested(raw.modelEvaluation, DEFAULTS.modelEvaluation),
    daemon: mergeNested(raw.daemon, DEFAULTS.daemon),
    gates: mergeNested(raw.gates, DEFAULTS.gates),
  };
  if (raw.baseline !== undefined) {
    merged.baseline = isRecord(raw.baseline) ? raw.baseline : undefined;
  }
  return merged;
}

function validateSourceBaselines(parsed: ReturnType<typeof PlaybookConfigSchema.parse>): void {
  const baselines = [
    ['ormApplicationSql', parsed.baseline?.ormApplicationSql],
    ['literalComparisons', parsed.baseline?.literalComparisons],
    ['duplicateStrings', parsed.baseline?.duplicateStrings],
  ] as const;
  for (const [name, baseline] of baselines) {
    if (baseline !== undefined && baseline.count < 0) {
      throw new ConfigError(`baseline.${name}.count: expected a non-negative integer`);
    }
    if (baseline !== undefined && !/^[a-f0-9]{64}$/.test(baseline.digest)) {
      throw new ConfigError(`baseline.${name}.digest: expected a SHA-256 hex digest`);
    }
  }
}

export function parsePlaybookConfig(text: string) {
  let raw: unknown;
  try {
    raw = s.parseJson(text);
  } catch {
    throw new ConfigError('playbook.config.json: malformed JSON');
  }

  if (!isRecord(raw)) {
    throw new ConfigError('playbook.config.json: expected an object');
  }

  const merged = mergeDefaults(raw);

  try {
    const parsed = PlaybookConfigSchema.parse(merged);
    validateSourceBaselines(parsed);
    return parsed;
  } catch (err) {
    if (err instanceof SchemaError) {
      throw new ConfigError(err.message);
    }
    throw err;
  }
}
