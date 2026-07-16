const REVIEW_CANDIDATE_NAME = 'review-candidate';
// v1 and v2 are frozen: immutable artifacts in live stores reference them, and
// ensureManagedArtifactContract refuses in-place schema drift once artifacts exist.
export const REVIEW_CANDIDATE_CONTRACT_REF = `${REVIEW_CANDIDATE_NAME}-v1`;
export const REVIEW_CANDIDATE_CONTRACT_REF_V2 = `${REVIEW_CANDIDATE_NAME}-v2`;
export const REVIEW_CANDIDATE_CONTRACT_REF_V3 = `${REVIEW_CANDIDATE_NAME}-v3`;
export const REVIEW_CANDIDATE_KIND = REVIEW_CANDIDATE_NAME;
export const REVIEW_CANDIDATE_SOURCE_KIND = REVIEW_CANDIDATE_NAME;
export const REVIEW_CANDIDATE_ID_PREFIX = 'RC-';
export const REVIEW_CANDIDATE_ARTIFACT_ID_PREFIX = 'ART-RC-';
export const REQUIRED_INPUT_POLICY_COUNT = 1;
// evidence.notes carries at most the packet's most recent durable notes.
export const REVIEW_CANDIDATE_NOTES_LIMIT = 20;

export const REVIEW_CANDIDATE_INTEGRATION = {
  PENDING: 'pending-integration',
  INTEGRATED: 'already-integrated',
} as const;

export const REVIEW_CANDIDATE_ERROR = {
  AMBIGUOUS_POLICY: 'AMBIGUOUS_MANUAL_INPUT_POLICY',
  CANDIDATE_MISSING: 'REVIEW_CANDIDATE_MISSING',
  CATALOG_MISSING: 'REVIEW_CANDIDATE_CATALOG_MISSING',
  CONTRACT_DRIFT: 'REVIEW_CANDIDATE_CONTRACT_DRIFT',
  EVIDENCE_FAILED: 'REVIEW_CANDIDATE_EVIDENCE_FAILED',
  INVALID_STATE: 'REVIEW_CANDIDATE_INVALID_STATE',
  PROJECTION_MISSING: 'REVIEW_CANDIDATE_PROJECTION_MISSING',
  SOURCE_UNSUPPORTED: 'MANUAL_INPUT_SOURCE_UNSUPPORTED',
} as const;

const stringValueSchema = () => ({ type: JSON_SCHEMA_TYPE.STRING, minLength: 1 } as const);
const versionSchema = () => ({ type: JSON_SCHEMA_TYPE.INTEGER, minimum: 1 } as const);
const dateTimeSchema = () => ({ type: JSON_SCHEMA_TYPE.STRING, format: 'date-time' } as const);
const closedObject = <T extends Readonly<Record<string, unknown>>>(properties: T) => ({
  type: JSON_SCHEMA_TYPE.OBJECT,
  required: Object.keys(properties),
  properties,
  additionalProperties: false,
});
const WORK_DEFINITION_PROPERTIES = {
  id: stringValueSchema(),
  version: versionSchema(),
  digest: stringValueSchema(),
} as const;
const CANDIDATE_PROPERTIES = {
  sha: stringValueSchema(),
  branch: stringValueSchema(),
  baseSha: stringValueSchema(),
  changedFiles: { type: JSON_SCHEMA_TYPE.ARRAY, minItems: 1, items: stringValueSchema() },
  diffDigest: stringValueSchema(),
  diff: stringValueSchema(),
} as const;
const CATALOG_PROPERTIES = { version: versionSchema(), digest: stringValueSchema() } as const;
const PROJECTION_PROPERTIES = {
  adapterId: stringValueSchema(),
  receiptId: stringValueSchema(),
  artifactDigest: stringValueSchema(),
} as const;
const EVIDENCE_PROPERTIES = {
  preflight: { type: JSON_SCHEMA_TYPE.OBJECT },
  catalog: closedObject(CATALOG_PROPERTIES),
  projections: {
    type: JSON_SCHEMA_TYPE.ARRAY,
    minItems: 1,
    items: closedObject(PROJECTION_PROPERTIES),
  },
} as const;
const REVIEW_CANDIDATE_PROPERTIES = {
  kind: { const: REVIEW_CANDIDATE_KIND },
  workDefinition: closedObject(WORK_DEFINITION_PROPERTIES),
  candidate: closedObject(CANDIDATE_PROPERTIES),
  producer: closedObject({ sessionId: stringValueSchema() }),
  evidence: closedObject(EVIDENCE_PROPERTIES),
  createdAt: dateTimeSchema(),
} as const;

export const REVIEW_CANDIDATE_SCHEMA = {
  $schema: JSON_SCHEMA_DRAFT_2020_12,
  ...closedObject(REVIEW_CANDIDATE_PROPERTIES),
} as const;

// v2: empty diffs are first-class (already-integrated close path). `changedFiles`
// may be empty, `diff` may be the empty string, and `integration` is an OPTIONAL
// enum so v1-shaped values (no field) still validate — absence means pending.
// The field name is also the promotion_receipts column name: keep the single literal here.
export const REVIEW_CANDIDATE_INTEGRATION_FIELD = 'integration';
const CANDIDATE_PROPERTIES_V2 = {
  sha: stringValueSchema(),
  branch: stringValueSchema(),
  baseSha: stringValueSchema(),
  changedFiles: { type: JSON_SCHEMA_TYPE.ARRAY, items: stringValueSchema() },
  diffDigest: stringValueSchema(),
  diff: { type: JSON_SCHEMA_TYPE.STRING },
  integration: { enum: Object.values(REVIEW_CANDIDATE_INTEGRATION) },
} as const;
const candidateSchemaV2 = () => {
  const base = closedObject(CANDIDATE_PROPERTIES_V2);
  return { ...base, required: base.required.filter((key) => key !== REVIEW_CANDIDATE_INTEGRATION_FIELD) };
};
const REVIEW_CANDIDATE_PROPERTIES_V2 = {
  ...REVIEW_CANDIDATE_PROPERTIES,
  candidate: candidateSchemaV2(),
} as const;
export const REVIEW_CANDIDATE_SCHEMA_V2 = {
  $schema: JSON_SCHEMA_DRAFT_2020_12,
  ...closedObject(REVIEW_CANDIDATE_PROPERTIES_V2),
} as const;

// v3: the reviewer needs the packet's durable notes as evidence (ENG-ENTRY-004:
// no claim without literal output). `evidence.notes` is an OPTIONAL array of
// closed note objects so v2-shaped values (no field) still validate — v2
// artifacts are immutable and stay validated against the frozen v2 schema.
const REVIEW_CANDIDATE_NOTES_FIELD = 'notes';
const NOTE_PROPERTIES = {
  at: dateTimeSchema(),
  detail: stringValueSchema(),
} as const;
const EVIDENCE_PROPERTIES_V3 = {
  ...EVIDENCE_PROPERTIES,
  notes: { type: JSON_SCHEMA_TYPE.ARRAY, items: closedObject(NOTE_PROPERTIES) },
} as const;
const evidenceSchemaV3 = () => {
  const base = closedObject(EVIDENCE_PROPERTIES_V3);
  return { ...base, required: base.required.filter((key) => key !== REVIEW_CANDIDATE_NOTES_FIELD) };
};
const REVIEW_CANDIDATE_PROPERTIES_V3 = {
  ...REVIEW_CANDIDATE_PROPERTIES_V2,
  evidence: evidenceSchemaV3(),
} as const;
export const REVIEW_CANDIDATE_SCHEMA_V3 = {
  $schema: JSON_SCHEMA_DRAFT_2020_12,
  ...closedObject(REVIEW_CANDIDATE_PROPERTIES_V3),
} as const;
import { JSON_SCHEMA_DRAFT_2020_12, JSON_SCHEMA_TYPE } from '../schema/json-schema.constants.js';
