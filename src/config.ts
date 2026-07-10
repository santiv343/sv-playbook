import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULTS } from './config.constants.js';
import { ConfigError } from './config.errors.js';
import type { Autonomy, BackupConfig, BaselineConfig, PlaybookConfig, Tier } from './config.types.js';
import { BACKUP_EVENT } from './db/backup.constants.js';
import type { BackupEvent } from './db/backup.types.js';

function isTier(value: unknown): value is Tier {
  return value === 'TIER-1' || value === 'TIER-2' || value === 'TIER-3';
}

function isAutonomy(value: unknown): value is Autonomy {
  return value === 'strict' || value === 'standard' || value === 'high';
}

function isBackupEvent(value: unknown): value is BackupEvent {
  return Object.values(BACKUP_EVENT).some((event) => event === value);
}

function requireValid<T>(value: unknown, guard: (v: unknown) => v is T, fallback: T, field: string): T {
  if (value === undefined) return fallback;
  if (!guard(value)) throw new ConfigError(`${field}: invalid value`);
  return value;
}

function stringOr(value: unknown, fallback: string, field: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new ConfigError(`${field} must be a string`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ConfigError(`${field} must be a string`);
  return value;
}

function booleanOr(value: unknown, fallback: boolean, fieldName: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new ConfigError(`${fieldName} must be a boolean`);
  return value;
}

function positiveIntegerOr(value: unknown, fallback: number, fieldName: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`${fieldName} must be a positive integer`);
  }
  return value;
}

function backupEventsOr(value: unknown, fallback: BackupEvent[], fieldName: string): BackupEvent[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || !value.every(isBackupEvent)) {
    throw new ConfigError(`${fieldName} must be an array of backup events`);
  }
  return [...value];
}

function field(raw: object, key: string): unknown {
  return Object.entries(raw).find(([k]) => k === key)?.[1];
}

function objectField(raw: object, key: string): object | undefined {
  const value = field(raw, key);
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ConfigError(`${key} must be an object`);
  }
  return value;
}

function readConfigFile(repoRoot: string): unknown {
  try {
    const text = readFileSync(join(repoRoot, 'playbook.config.json'), 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT') {
      return undefined;
    }
    if (err instanceof SyntaxError) {
      throw new ConfigError('playbook.config.json: malformed JSON');
    }
    throw err;
  }
}

export function loadConfig(repoRoot: string): PlaybookConfig {
  const raw = readConfigFile(repoRoot);
  if (raw === undefined) {
    return { ...DEFAULTS };
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new ConfigError('playbook.config.json: expected an object');
  }

  const backup = objectField(raw, 'backup');
  const baseline = objectField(raw, 'baseline');
  const config: PlaybookConfig = {
    productName: stringOr(field(raw, 'productName'), DEFAULTS.productName, 'productName'),
    chatLanguage: stringOr(field(raw, 'chatLanguage'), DEFAULTS.chatLanguage, 'chatLanguage'),
    tier: requireValid(field(raw, 'tier'), isTier, DEFAULTS.tier, 'tier'),
    verifyCommand: stringOr(field(raw, 'verifyCommand'), DEFAULTS.verifyCommand, 'verifyCommand'),
    enforceVerifyOnReview: booleanOr(field(raw, 'enforceVerifyOnReview'), DEFAULTS.enforceVerifyOnReview, 'enforceVerifyOnReview'),
    autonomy: requireValid(field(raw, 'autonomy'), isAutonomy, DEFAULTS.autonomy, 'autonomy'),
    backup: loadBackupConfig(backup),
  };
  const loadedBaseline = loadBaselineConfig(baseline);
  if (loadedBaseline !== undefined) {
    config.baseline = loadedBaseline;
  }
  return config;
}

function loadBackupConfig(raw: object | undefined): BackupConfig {
  if (raw === undefined) return { ...DEFAULTS.backup, onEvents: [...DEFAULTS.backup.onEvents] };
  const dir = optionalString(field(raw, 'dir'), 'backup.dir');
  const config: BackupConfig = {
    enabled: booleanOr(field(raw, 'enabled'), DEFAULTS.backup.enabled, 'backup.enabled'),
    retention: positiveIntegerOr(field(raw, 'retention'), DEFAULTS.backup.retention, 'backup.retention'),
    maxAgeHours: positiveIntegerOr(field(raw, 'maxAgeHours'), DEFAULTS.backup.maxAgeHours, 'backup.maxAgeHours'),
    onEvents: backupEventsOr(field(raw, 'onEvents'), DEFAULTS.backup.onEvents, 'backup.onEvents'),
  };
  if (dir !== undefined) {
    config.dir = dir;
  }
  return config;
}

function loadBaselineConfig(raw: object | undefined): BaselineConfig | undefined {
  if (raw === undefined) return undefined;
  const config: BaselineConfig = {};
  const commit = optionalString(field(raw, 'commit'), 'baseline.commit');
  if (commit !== undefined) config.commit = commit;
  const timestamp = optionalString(field(raw, 'timestamp'), 'baseline.timestamp');
  if (timestamp !== undefined) config.timestamp = timestamp;
  const fingerprintsRaw = field(raw, 'fingerprints');
  if (fingerprintsRaw !== undefined) {
    if (!Array.isArray(fingerprintsRaw) || !fingerprintsRaw.every((f): f is string => typeof f === 'string')) {
      throw new ConfigError('baseline.fingerprints must be an array of strings');
    }
    config.fingerprints = [...fingerprintsRaw];
  }
  return config;
}
