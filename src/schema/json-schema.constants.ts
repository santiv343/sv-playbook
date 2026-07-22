// Vocabulario compartido para los JSON Schema literales que se declaran a
// mano en varios *.constants.ts (review-candidate, protocol-work, model-
// capability-evaluation) — evita repetir los strings `'object'`/`'array'`
// como literales sueltos.
export const JSON_SCHEMA_TYPE = {
  ARRAY: 'array',
  INTEGER: 'integer',
  OBJECT: 'object',
  STRING: 'string',
} as const;

export const JSON_SCHEMA_DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';
