import { s } from '../schema/index.js';
import { JSON_SCHEMA_DRAFT_2020_12, JSON_SCHEMA_TYPE } from '../schema/json-schema.constants.js';

export const REVIEW_VERDICT_KIND = 'review-verdict';

export const REVIEW_VERDICT = {
  APPROVED: 'APPROVED',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
} as const;

export const REVIEW_VERDICT_VALUES = Object.values(REVIEW_VERDICT);

export const REVIEW_VERDICT_ERROR = {
  INVALID: 'REVIEW_VERDICT_INVALID',
} as const;

// Dos representaciones del MISMO contrato, no dos contratos: el schema Zod
// (ReviewVerdictEnvelopeSchema) valida en runtime dentro del proceso Node;
// el JSON Schema (REVIEW_VERDICT_ENVELOPE_JSON_SCHEMA, más abajo) es lo que
// se le muestra a un adapter/agente externo que no corre Zod. Un test
// (review-verdict.test.ts) es quien garantiza que ambos acepten/rechacen
// exactamente los mismos valores — cambiar uno sin el otro rompe esa
// garantía en silencio.
export const ReviewVerdictEnvelopeSchema = s.object({
  kind: s.literal(REVIEW_VERDICT_KIND),
  payload: s.object({
    candidateSha: s.nonEmptyString(),
    verdict: s.enu(REVIEW_VERDICT_VALUES),
    workDefinitionRef: s.object({
      id: s.nonEmptyString(),
      version: s.integer(),
      digest: s.nonEmptyString(),
    }),
    rationale: s.optional(s.nonEmptyString()),
  }),
});

const nonEmptyStringSchema = () => ({ type: JSON_SCHEMA_TYPE.STRING, minLength: 1 } as const);
const openObject = <T extends Readonly<Record<string, unknown>>>(properties: T) => ({
  type: JSON_SCHEMA_TYPE.OBJECT,
  required: Object.keys(properties),
  properties,
});

// rationale is OPTIONAL (HJ-002: the reason must be able to travel mechanically,
// but absence stays valid): it joins properties after required is computed.
const REVIEW_VERDICT_PAYLOAD_PROPERTIES = {
  candidateSha: nonEmptyStringSchema(),
  verdict: { enum: [...REVIEW_VERDICT_VALUES] },
  workDefinitionRef: openObject({
    id: nonEmptyStringSchema(),
    version: { type: JSON_SCHEMA_TYPE.INTEGER },
    digest: nonEmptyStringSchema(),
  }),
} as const;
const reviewVerdictPayloadBase = openObject(REVIEW_VERDICT_PAYLOAD_PROPERTIES);

// JSON Schema mirror of ReviewVerdictEnvelopeSchema, single-sourced from the same
// kind/verdict constants. Objects stay open (no additionalProperties: false) to
// match s.object semantics exactly; review-verdict.test.ts locks the equivalence.
export const REVIEW_VERDICT_PAYLOAD_JSON_SCHEMA = {
  ...reviewVerdictPayloadBase,
  properties: { ...reviewVerdictPayloadBase.properties, rationale: nonEmptyStringSchema() },
};

export const REVIEW_VERDICT_ENVELOPE_JSON_SCHEMA = {
  $schema: JSON_SCHEMA_DRAFT_2020_12,
  ...openObject({
    kind: { const: REVIEW_VERDICT_KIND },
    payload: REVIEW_VERDICT_PAYLOAD_JSON_SCHEMA,
  }),
};
