import { SECRET_PATTERNS } from './secrets.constants.js';
import type { SecretViolation } from './secrets.types.js';

// Escaneo por patrones regex línea por línea (no AST — a diferencia de
// duplicate-string.ts/orm-boundary.ts, un secreto puede aparecer en
// cualquier tipo de archivo, no sólo TypeScript ejecutable).
// SECRET_PATTERNS (secrets.constants.ts) es la fuente única de patrones
// conocidos — agregar un tipo nuevo de secreto a detectar significa
// agregarlo ahí, no acá.
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
