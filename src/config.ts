import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULTS } from './config.constants.js';
import { ConfigError } from './config.errors.js';
import { parsePlaybookConfig } from './schema/config.constants.js';

function readConfigFile(repoRoot: string): string | undefined {
  try {
    return readFileSync(join(repoRoot, 'playbook.config.json'), 'utf8');
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

export function loadConfig(repoRoot: string) {
  const text = readConfigFile(repoRoot);
  if (text === undefined) {
    return { ...DEFAULTS };
  }

  return parsePlaybookConfig(text);
}
