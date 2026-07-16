import {
  REVIEW_VERDICT_KIND,
  REVIEW_VERDICT_PAYLOAD_JSON_SCHEMA,
} from '../contracts/review-verdict.constants.js';
import { JSON_SCHEMA_DRAFT_2020_12, JSON_SCHEMA_TYPE } from '../schema/json-schema.constants.js';

export const BUNDLED_ENVELOPE_ERROR = {
  CONTRACT_DRIFT: 'BUNDLED_ENVELOPE_CONTRACT_DRIFT',
} as const;

const ENVELOPE_PROPERTIES = {
  kind: { type: JSON_SCHEMA_TYPE.STRING, minLength: 1 },
  payload: { type: JSON_SCHEMA_TYPE.OBJECT },
} as const;

const REVIEW_VERDICT_BRANCH_CONDITION_PROPERTIES = {
  kind: { const: REVIEW_VERDICT_KIND },
} as const;

// The shared semantic-work envelope stays generic at the top level so every role
// keeps routing through one contract, and gains a strict branch per known kind:
// when kind pins the envelope to a typed verdict, the payload must match the
// single-sourced strict shape the gateway and promotion parsers enforce.
export const BUNDLED_ARTIFACT_SCHEMA = {
  $schema: JSON_SCHEMA_DRAFT_2020_12,
  type: JSON_SCHEMA_TYPE.OBJECT,
  required: Object.keys(ENVELOPE_PROPERTIES),
  properties: ENVELOPE_PROPERTIES,
  additionalProperties: false,
  allOf: [
    {
      if: {
        properties: REVIEW_VERDICT_BRANCH_CONDITION_PROPERTIES,
        required: Object.keys(REVIEW_VERDICT_BRANCH_CONDITION_PROPERTIES),
      },
      then: {
        properties: { payload: REVIEW_VERDICT_PAYLOAD_JSON_SCHEMA },
      },
    },
  ],
} as const;
