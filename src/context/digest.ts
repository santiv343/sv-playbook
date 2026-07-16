import { createHash } from 'node:crypto';
import { canonicalize } from 'json-canonicalize';

export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

export function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}
