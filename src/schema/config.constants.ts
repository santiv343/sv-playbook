import * as s from './core.js';
import { ConfigError } from '../config.errors.js';
import { SchemaError } from './core.errors.js';
import { BACKUP_EVENT } from '../db/backup.constants.js';
import { DEFAULTS } from '../config.constants.js';

const tierValues = ['TIER-1', 'TIER-2', 'TIER-3'] as const;
const autonomyValues = ['strict', 'standard', 'high'] as const;
const operatingModelValues = ['solo', 'founder-led', 'enterprise'] as const;
const pipelineValues = ['off', 'assist', 'full'] as const;

export const TierSchema = s.enu(tierValues);
export const AutonomySchema = s.enu(autonomyValues);
export const OperatingModelSchema = s.enu(operatingModelValues);
export const PipelineSchema = s.enu(pipelineValues);
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

export const BaselineConfigSchema = s.object({
  commit: s.optional(s.string()),
  timestamp: s.optional(s.string()),
  fingerprints: s.optional(s.array(s.string())),
});

export const GatesConfigSchema = s.object({
  maxLines: s.positiveInteger(),
  maxLinesPerFunction: s.positiveInteger(),
  complexity: s.positiveInteger(),
  cognitiveComplexity: s.positiveInteger(),
  layout: s.boolean(),
});

export const PlaybookConfigSchema = s.object({
  productName: s.string(),
  chatLanguage: s.string(),
  tier: TierSchema,
  verifyCommand: s.string(),
  autonomy: AutonomySchema,
  operatingModel: OperatingModelSchema,
  entryRole: s.string(),
  pipeline: PipelineSchema,
  maxConcurrentWorkers: s.positiveInteger(),
  backup: BackupConfigSchema,
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

function mergeDefaults(raw: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    productName: raw.productName ?? DEFAULTS.productName,
    chatLanguage: raw.chatLanguage ?? DEFAULTS.chatLanguage,
    tier: raw.tier ?? DEFAULTS.tier,
    verifyCommand: raw.verifyCommand ?? DEFAULTS.verifyCommand,
    autonomy: raw.autonomy ?? DEFAULTS.autonomy,
    operatingModel: raw.operatingModel ?? DEFAULTS.operatingModel,
    entryRole: raw.entryRole ?? DEFAULTS.entryRole,
    pipeline: raw.pipeline ?? DEFAULTS.pipeline,
    maxConcurrentWorkers: raw.maxConcurrentWorkers ?? DEFAULTS.maxConcurrentWorkers,
    backup: mergeNested(raw.backup, DEFAULTS.backup),
    gates: mergeNested(raw.gates, DEFAULTS.gates),
  };
  if (raw.baseline !== undefined) {
    merged.baseline = isRecord(raw.baseline) ? raw.baseline : undefined;
  }
  return merged;
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
    return PlaybookConfigSchema.parse(merged);
  } catch (err) {
    if (err instanceof SchemaError) {
      throw new ConfigError(err.message);
    }
    throw err;
  }
}
