import { eq } from 'drizzle-orm';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { artifactContracts, workflowArtifacts } from '../orchestration/schema.constants.js';
import { BUNDLED_ARTIFACT_SCHEMA, BUNDLED_ENVELOPE_ERROR } from './bundled-envelope.constants.js';
import { BUNDLED_ROLE_ARTIFACT_CONTRACT_REF } from './bundled-profile.constants.js';

// Managed contracts are authored in code and reconciled into the store: a digest
// mismatch repairs the schema in place, unless immutable artifacts already
// reference the contract — changing it there would rewrite history.
export function ensureManagedArtifactContract(
  store: Store,
  ref: string,
  schema: Readonly<Record<string, unknown>>,
  driftErrorCode: string,
): void {
  const schemaJson = canonicalJson(schema);
  const schemaDigest = digest(schema);
  const existing = store.orm.select({ schemaDigest: artifactContracts.schemaDigest })
    .from(artifactContracts).where(eq(artifactContracts.ref, ref)).get();
  if (existing === undefined) {
    store.orm.insert(artifactContracts).values({
      ref,
      schemaJson,
      schemaDigest,
      status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
      createdAt: new Date().toISOString(),
    }).run();
    return;
  }
  if (existing.schemaDigest === schemaDigest) return;
  const used = store.orm.select({ id: workflowArtifacts.id }).from(workflowArtifacts)
    .where(eq(workflowArtifacts.contractRef, ref)).get();
  if (used !== undefined) {
    throw new ContextError(driftErrorCode, `${ref} already produced immutable artifacts`);
  }
  store.orm.update(artifactContracts).set({ schemaJson, schemaDigest })
    .where(eq(artifactContracts.ref, ref)).run();
}

export function ensureBundledEnvelopeContract(store: Store): void {
  ensureManagedArtifactContract(
    store,
    BUNDLED_ROLE_ARTIFACT_CONTRACT_REF,
    BUNDLED_ARTIFACT_SCHEMA,
    BUNDLED_ENVELOPE_ERROR.CONTRACT_DRIFT,
  );
}
