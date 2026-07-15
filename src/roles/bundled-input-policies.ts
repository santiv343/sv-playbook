import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { canonicalJson, digest } from '../context/digest.js';
import type { Store } from '../db/store.types.js';
import { artifactContracts } from '../orchestration/schema.constants.js';
import { workflowArtifacts } from '../orchestration/schema.constants.js';
import { eq } from 'drizzle-orm';
import { ContextError } from '../context/context.errors.js';
import {
  REVIEW_CANDIDATE_CONTRACT_REF,
  REVIEW_CANDIDATE_SCHEMA,
  REVIEW_CANDIDATE_SOURCE_KIND,
  REVIEW_CANDIDATE_ERROR,
} from '../review/review-candidate.constants.js';
import { responsibilityInputPolicies } from '../review/schema.constants.js';
import { STATUS } from '../tasks/service.constants.js';
import { BUNDLED_REVIEW_RESPONSIBILITY_ID } from './bundled-profile.constants.js';

export function ensureBundledInputPolicies(store: Store): void {
  const schemaJson = canonicalJson(REVIEW_CANDIDATE_SCHEMA);
  const schemaDigest = digest(REVIEW_CANDIDATE_SCHEMA);
  const existing = store.orm.select({ schemaDigest: artifactContracts.schemaDigest })
    .from(artifactContracts).where(eq(artifactContracts.ref, REVIEW_CANDIDATE_CONTRACT_REF)).get();
  if (existing !== undefined && existing.schemaDigest !== schemaDigest) {
    const used = store.orm.select({ id: workflowArtifacts.id }).from(workflowArtifacts)
      .where(eq(workflowArtifacts.contractRef, REVIEW_CANDIDATE_CONTRACT_REF)).get();
    if (used !== undefined) {
      throw new ContextError(
        REVIEW_CANDIDATE_ERROR.CONTRACT_DRIFT,
        `${REVIEW_CANDIDATE_CONTRACT_REF} already produced immutable artifacts`,
      );
    }
    store.orm.update(artifactContracts).set({ schemaJson, schemaDigest })
      .where(eq(artifactContracts.ref, REVIEW_CANDIDATE_CONTRACT_REF)).run();
  } else if (existing === undefined) store.orm.insert(artifactContracts).values({
    ref: REVIEW_CANDIDATE_CONTRACT_REF,
    schemaJson,
    schemaDigest,
    status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    createdAt: new Date().toISOString(),
  }).run();
  store.orm.insert(responsibilityInputPolicies).values({
    responsibilityId: BUNDLED_REVIEW_RESPONSIBILITY_ID,
    phase: STATUS.REVIEW,
    requiredStatus: STATUS.REVIEW,
    contractRef: REVIEW_CANDIDATE_CONTRACT_REF,
    sourceKind: REVIEW_CANDIDATE_SOURCE_KIND,
  }).onConflictDoUpdate({
    target: responsibilityInputPolicies.responsibilityId,
    set: {
      phase: STATUS.REVIEW,
      requiredStatus: STATUS.REVIEW,
      contractRef: REVIEW_CANDIDATE_CONTRACT_REF,
      sourceKind: REVIEW_CANDIDATE_SOURCE_KIND,
    },
  }).run();
}
