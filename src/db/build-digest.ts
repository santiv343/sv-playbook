import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEXT_ENCODING } from '../platform.constants.js';
import { BUILD_DIGEST_FIELD, BUILD_DIGEST_FILE_NAME } from './build-digest.constants.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object(value) === value && !Array.isArray(value);
}

// El "build digest" identifica QUÉ build del propio sv-playbook está
// corriendo — usado por daemon/client.ts (fetchDaemonBuildDigestSync) para
// que un CLI recién actualizado pueda detectar si el daemon en ejecución
// es de una versión distinta (build viejo corriendo en background) antes
// de reenviarle comandos. null (no throw) cuando el archivo no existe o
// está mal formado — es señal informativa, no algo que deba bloquear
// arranque.
export function readBuildDigest(digestPath?: string): string | null {
  const path = digestPath ?? join(dirname(fileURLToPath(import.meta.url)), '..', BUILD_DIGEST_FILE_NAME);
  if (!existsSync(path)) return null;
  const parsed: unknown = JSON.parse(readFileSync(path, TEXT_ENCODING.UTF8));
  if (!isRecord(parsed) || !(BUILD_DIGEST_FIELD in parsed)) return null;
  const digest = parsed.digest;
  return String(digest) === digest ? digest : null;
}
