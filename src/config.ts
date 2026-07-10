import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULTS } from './config.constants.js';
import { ConfigError } from './config.errors.js';
import { parsePlaybookConfig } from './schema/config.constants.js';
import { parseJson } from './schema/core.js';
import type { PlaybookConfig } from './config.types.js';

const MALFORMED_JSON = 'playbook.config.json: malformed JSON';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readConfigFile(repoRoot: string): string | undefined {
  try {
    return readFileSync(join(repoRoot, 'playbook.config.json'), 'utf8');
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT') {
      return undefined;
    }
    if (err instanceof SyntaxError) {
      throw new ConfigError(MALFORMED_JSON);
    }
    throw err;
  }
}

function validateMaxConcurrentWorkers(value: unknown): number {
  if (value === undefined) return 3;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ConfigError('playbook.config.json: maxConcurrentWorkers must be a positive integer');
  }
  return value;
}

export function loadConfig(repoRoot: string): PlaybookConfig {
  const text = readConfigFile(repoRoot);
  if (text === undefined) {
    return { ...DEFAULTS };
  }

  let parsed: unknown;
  try {
    parsed = parseJson(text);
  } catch {
    throw new ConfigError(MALFORMED_JSON);
  }
  if (!isRecord(parsed)) {
    throw new ConfigError(MALFORMED_JSON);
  }
  const maxConcurrentWorkers = validateMaxConcurrentWorkers(parsed.maxConcurrentWorkers);
  const validated = parsePlaybookConfig(text);
  return { ...validated, maxConcurrentWorkers };
}
