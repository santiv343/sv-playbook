import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { TEXT_ENCODING } from '../platform.constants.js';
import {
  CHECKED_SOURCE_ROOTS,
  CHECKED_SOURCE_SUFFIXES,
  DECLARATION_SOURCE_SUFFIX,
} from './source-tree.constants.js';
import type { SourceText } from './source-tree.types.js';

export function normalizedSourcePath(path: string): string {
  return path.replace(/\\/g, '/');
}

// La fuente de verdad de QUÉ archivos cubren los gates de deuda
// (orm-boundary, literal-comparison, duplicate-string) — todos comparten
// esta misma función para no divergir en criterio de inclusión.
// normalizedSourcePath() convierte separadores Windows a POSIX SIEMPRE, así
// los fingerprints/baselines son estables entre SO (un dev en Windows y CI
// en Linux calculan el mismo digest).
export function readCheckedSources(repoRoot: string): SourceText[] {
  return CHECKED_SOURCE_ROOTS.flatMap((sourceRoot) => {
    const root = join(repoRoot, sourceRoot);
    return readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      .filter((path) => CHECKED_SOURCE_SUFFIXES.some((suffix) => path.endsWith(suffix)))
      .filter((path) => !path.endsWith(DECLARATION_SOURCE_SUFFIX));
  }).map((absolutePath) => ({
    path: normalizedSourcePath(relative(repoRoot, absolutePath)),
    source: readFileSync(absolutePath, TEXT_ENCODING.UTF8),
  })).sort((left, right) => left.path.localeCompare(right.path));
}
