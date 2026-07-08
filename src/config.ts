import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type Tier = 'TIER-1' | 'TIER-2' | 'TIER-3';
export type Autonomy = 'strict' | 'standard' | 'high';

export interface PlaybookConfig {
  productName: string;
  chatLanguage: string;
  tier: Tier;
  verifyCommand: string;
  autonomy: Autonomy;
}

const DEFAULTS: PlaybookConfig = {
  productName: 'unnamed',
  chatLanguage: 'en',
  tier: 'TIER-2',
  verifyCommand: 'npm run verify',
  autonomy: 'strict',
};

function isTier(value: unknown): value is Tier {
  return value === 'TIER-1' || value === 'TIER-2' || value === 'TIER-3';
}

function isAutonomy(value: unknown): value is Autonomy {
  return value === 'strict' || value === 'standard' || value === 'high';
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

function field(raw: object, key: string): unknown {
  return Object.entries(raw).find(([k]) => k === key)?.[1];
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

  return {
    productName: stringOr(field(raw, 'productName'), DEFAULTS.productName, 'productName'),
    chatLanguage: stringOr(field(raw, 'chatLanguage'), DEFAULTS.chatLanguage, 'chatLanguage'),
    tier: requireValid(field(raw, 'tier'), isTier, DEFAULTS.tier, 'tier'),
    verifyCommand: stringOr(field(raw, 'verifyCommand'), DEFAULTS.verifyCommand, 'verifyCommand'),
    autonomy: requireValid(field(raw, 'autonomy'), isAutonomy, DEFAULTS.autonomy, 'autonomy'),
  };
}
