import type { Store } from '../db/store.types.js';
import {
  REVIEW_CANDIDATE_CONTRACT_REF,
  REVIEW_CANDIDATE_CONTRACT_REF_V2,
  REVIEW_CANDIDATE_CONTRACT_REF_V3,
  REVIEW_CANDIDATE_SCHEMA,
  REVIEW_CANDIDATE_SCHEMA_V2,
  REVIEW_CANDIDATE_SCHEMA_V3,
  REVIEW_CANDIDATE_SOURCE_KIND,
  REVIEW_CANDIDATE_ERROR,
} from '../review/review-candidate.constants.js';
import { responsibilityInputPolicies } from '../review/schema.constants.js';
import { STATUS } from '../tasks/service.constants.js';
import { BUNDLED_REVIEW_RESPONSIBILITY_ID } from './bundled-profile.constants.js';
import { ensureManagedArtifactContract } from './managed-contracts.js';

export function ensureBundledInputPolicies(store: Store): void {
  // v1 and v2 stay ensured for the immutable historical artifacts that reference
  // them; new candidates are written and validated against v3 (evidence notes).
  ensureManagedArtifactContract(
    store,
    REVIEW_CANDIDATE_CONTRACT_REF,
    REVIEW_CANDIDATE_SCHEMA,
    REVIEW_CANDIDATE_ERROR.CONTRACT_DRIFT,
  );
  ensureManagedArtifactContract(
    store,
    REVIEW_CANDIDATE_CONTRACT_REF_V2,
    REVIEW_CANDIDATE_SCHEMA_V2,
    REVIEW_CANDIDATE_ERROR.CONTRACT_DRIFT,
  );
  ensureManagedArtifactContract(
    store,
    REVIEW_CANDIDATE_CONTRACT_REF_V3,
    REVIEW_CANDIDATE_SCHEMA_V3,
    REVIEW_CANDIDATE_ERROR.CONTRACT_DRIFT,
  );
  store.orm.insert(responsibilityInputPolicies).values({
    responsibilityId: BUNDLED_REVIEW_RESPONSIBILITY_ID,
    phase: STATUS.REVIEW,
    requiredStatus: STATUS.REVIEW,
    contractRef: REVIEW_CANDIDATE_CONTRACT_REF_V3,
    sourceKind: REVIEW_CANDIDATE_SOURCE_KIND,
  }).onConflictDoUpdate({
    target: responsibilityInputPolicies.responsibilityId,
    set: {
      phase: STATUS.REVIEW,
      requiredStatus: STATUS.REVIEW,
      contractRef: REVIEW_CANDIDATE_CONTRACT_REF_V3,
      sourceKind: REVIEW_CANDIDATE_SOURCE_KIND,
    },
  }).run();
}
