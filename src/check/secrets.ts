import { SECRET_PATTERNS } from './secrets.constants.js';
import type { SecretViolation } from './secrets.types.js';

export function scanForSecrets(files: readonly { path: string; content: string }[]): readonly SecretViolation[] {
  const violations: SecretViolation[] = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    lines.forEach((line, index) => {
      for (const { kind, pattern } of SECRET_PATTERNS) {
        if (pattern.test(line)) violations.push({ path: file.path, line: index + 1, kind });
      }
    });
  }
  return violations;
}
