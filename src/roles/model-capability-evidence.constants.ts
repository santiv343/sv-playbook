// SHA256_DIGEST_PATTERN valida el FORMATO del digest de evidencia
// (`sha256:` + 64 hex) — no re-calcula el hash, sólo confirma que la
// cadena tiene la forma esperada antes de persistirla.
export const MODEL_CAPABILITY_EVIDENCE_ID_PREFIX = 'MCE-';
export const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const ERROR_CODE_SEPARATOR = ':';
export const STRING_INDEX_NOT_FOUND = -1;
