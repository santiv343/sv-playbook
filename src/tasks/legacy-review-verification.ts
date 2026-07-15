import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { PLAYBOOK_CONFIG_FILE_NAME } from '../config.constants.js';
import { PROCESS_STDIO } from '../git.constants.js';
import { PREFLIGHT_VERIFY_TIMEOUT_MS } from '../review/preflight.constants.js';
import { TEXT_ENCODING } from '../platform.constants.js';
import { LifecycleError } from './service.errors.js';

export function verifyLegacyReviewSync(worktree: string): void {
  const configPath = join(worktree, PLAYBOOK_CONFIG_FILE_NAME);
  if (!existsSync(configPath) || /enforceVerifyOnReview\s*:\s*false/.test(readFileSync(configPath, TEXT_ENCODING.UTF8))) return;
  const config = loadConfig(worktree);
  if (config.verifyCommand.trim() === '') return;
  try {
    execSync(config.verifyCommand, {
      cwd: worktree,
      timeout: PREFLIGHT_VERIFY_TIMEOUT_MS,
      stdio: PROCESS_STDIO.PIPE,
    });
  } catch {
    throw new LifecycleError(`verify command failed: ${config.verifyCommand}`);
  }
}
