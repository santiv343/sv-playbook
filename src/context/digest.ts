import { createHash } from 'node:crypto';
import { canonicalize } from 'json-canonicalize';

// Primitiva usada en TODO el sistema (decenas de archivos): canonicalJson
// produce un JSON con orden de keys DETERMINÍSTICO — dos objetos con las
// mismas keys en distinto orden dan el mismo string. digest() es
// SHA-256 sobre ese JSON canónico, con el prefijo `sha256:` fijo — es lo
// que hace que specDigest, workDefinitionDigest, receiptDigest, etc. sean
// comparables y estables sin importar el orden de inserción de un objeto.
// Sin esta canonicalización, el mismo valor lógico podría producir
// digests distintos según cómo se construyó el objeto en memoria.
export function canonicalJson(value: unknown): string {
  return canonicalize(value);
}

export function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function compareOrdinal(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
