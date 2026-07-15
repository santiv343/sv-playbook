import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULTS } from './config.constants.js';
import { parsePlaybookConfig } from './schema/config.constants.js';
import type { PlaybookConfig } from './config.types.js';
import { NODE_ERROR_CODE } from './platform.constants.js';

function readConfigFile(repoRoot: string): string | undefined {
  try {
    return readFileSync(join(repoRoot, 'playbook.config.json'), 'utf8');
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === NODE_ERROR_CODE.FILE_NOT_FOUND) {
      return undefined;
    }
    throw err;
  }
}

export function loadConfig(repoRoot: string): PlaybookConfig {
  const text = readConfigFile(repoRoot);
  if (text === undefined) {
    return { ...DEFAULTS };
  }
  return parsePlaybookConfig(text);
}
