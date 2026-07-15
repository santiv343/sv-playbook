import { createHash } from 'node:crypto';
import { HASH_ALGORITHM, HASH_ENCODING } from '../platform.constants.js';

export function sourceFingerprint(parts: readonly string[]): string {
  return createHash(HASH_ALGORITHM.SHA256).update(parts.join('\0')).digest(HASH_ENCODING.HEX);
}

export function sourceInventoryDigest(fingerprints: readonly string[]): string {
  return createHash(HASH_ALGORITHM.SHA256).update(fingerprints.join('\n')).digest(HASH_ENCODING.HEX);
}
