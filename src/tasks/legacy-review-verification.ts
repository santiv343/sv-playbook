import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { PLAYBOOK_CONFIG_FILE_NAME } from '../config.constants.js';
import { PROCESS_STDIO } from '../git.constants.js';
import { LEGACY_REVIEW_VERIFY_TIMEOUT_MS } from '../review/preflight.constants.js';
import { TEXT_ENCODING } from '../platform.constants.js';
import { LifecycleError } from './service.errors.js';

// ⚠️ Ver findings.md F-007: duplica (con distinto comportamiento —
// síncrona, timeout fijo, sin captura de output) la misma verificación
// que runSourceWorktreeVerifyCheck (src/review/preflight.ts) hace de
// forma async y configurable. Sólo se alcanza vía gateVerify() en
// tasks/service.ts, que a su vez sólo se alcanza si algo llama
// movePacket() con to=REVIEW — el comando real del CLI (`task move`) no
// lo hace, sólo lo hacen tests del dominio tasks/.
export function verifyLegacyReviewSync(worktree: string): void {
  const configPath = join(worktree, PLAYBOOK_CONFIG_FILE_NAME);
  if (!existsSync(configPath) || /enforceVerifyOnReview\s*:\s*false/.test(readFileSync(configPath, TEXT_ENCODING.UTF8))) return;
  const config = loadConfig(worktree);
  if (config.verifyCommand.trim() === '') return;
  try {
    execSync(config.verifyCommand, {
      cwd: worktree,
      timeout: LEGACY_REVIEW_VERIFY_TIMEOUT_MS,
      stdio: PROCESS_STDIO.PIPE,
    });
  } catch {
    throw new LifecycleError(`verify command failed: ${config.verifyCommand}`);
  }
}
