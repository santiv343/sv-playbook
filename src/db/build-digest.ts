import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEXT_ENCODING } from '../platform.constants.js';
import { BUILD_DIGEST_FIELD, BUILD_DIGEST_FILE_NAME } from './build-digest.constants.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object(value) === value && !Array.isArray(value);
}

export function readBuildDigest(): string | null {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', BUILD_DIGEST_FILE_NAME);
  if (!existsSync(path)) return null;
  const parsed: unknown = JSON.parse(readFileSync(path, TEXT_ENCODING.UTF8));
  if (!isRecord(parsed) || !(BUILD_DIGEST_FIELD in parsed)) return null;
  const digest = parsed.digest;
  return String(digest) === digest ? digest : null;
}
