import { createHash } from 'node:crypto';
import { HASH_ALGORITHM, HASH_ENCODING } from '../platform.constants.js';

// sourceFingerprint identifica UNA violación puntual (path+kind+texto) para
// poder "perdonarla" individualmente en un baseline (checkViolation en
// baseline.ts busca por fingerprint exacto); sourceInventoryDigest resume
// el INVENTARIO completo (ordenado, join con \n) en un único hash — eso es
// lo que se compara contra baseline.count/digest para decidir si la deuda
// total cambió, sin necesitar comparar fingerprint por fingerprint en cada
// verify.
export function sourceFingerprint(parts: readonly string[]): string {
  return createHash(HASH_ALGORITHM.SHA256).update(parts.join('\0')).digest(HASH_ENCODING.HEX);
}

export function sourceInventoryDigest(fingerprints: readonly string[]): string {
  return createHash(HASH_ALGORITHM.SHA256).update([...fingerprints].sort().join('\n')).digest(HASH_ENCODING.HEX);
}
