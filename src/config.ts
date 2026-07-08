import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface PlaybookConfig {
  productName: string;
  chatLanguage: string;
  tier: 'TIER-1' | 'TIER-2' | 'TIER-3';
  verifyCommand: string;
  autonomy: 'strict' | 'standard' | 'high';
}

const DEFAULTS: PlaybookConfig = {
  productName: 'unnamed',
  chatLanguage: 'en',
  tier: 'TIER-2',
  verifyCommand: 'npm run verify',
  autonomy: 'strict',
};

function isTier(value: unknown): value is 'TIER-1' | 'TIER-2' | 'TIER-3' {
  return value === 'TIER-1' || value === 'TIER-2' || value === 'TIER-3';
}

function isAutonomy(value: unknown): value is 'strict' | 'standard' | 'high' {
  return value === 'strict' || value === 'standard' || value === 'high';
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ConfigError(`${field} must be a string`);
  }
  return value;
}

function readConfigFile(repoRoot: string): unknown {
  try {
    const text = readFileSync(join(repoRoot, 'playbook.config.json'), 'utf-8');
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

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    data[key] = value;
  }

  const tier = data.tier !== undefined
    ? (isTier(data.tier) ? data.tier : (() => { throw new ConfigError('tier: invalid value'); })())
    : DEFAULTS.tier;

  const autonomy = data.autonomy !== undefined
    ? (isAutonomy(data.autonomy) ? data.autonomy : (() => { throw new ConfigError('autonomy: invalid value'); })())
    : DEFAULTS.autonomy;

  return {
    productName: data.productName !== undefined ? assertString(data.productName, 'productName') : DEFAULTS.productName,
    chatLanguage: data.chatLanguage !== undefined ? assertString(data.chatLanguage, 'chatLanguage') : DEFAULTS.chatLanguage,
    tier,
    verifyCommand: data.verifyCommand !== undefined ? assertString(data.verifyCommand, 'verifyCommand') : DEFAULTS.verifyCommand,
    autonomy,
  };
}
