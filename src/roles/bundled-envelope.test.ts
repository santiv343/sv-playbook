import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { openStore } from '../db/store.js';
import { validateArtifact } from '../contracts/artifacts.js';
import { ARTIFACT_CONTRACT_ERROR } from '../contracts/artifact.constants.js';
import { ContextError } from '../context/context.errors.js';
import { digest } from '../context/digest.js';
import { artifactContracts, workflowArtifacts } from '../orchestration/schema.constants.js';
import { bootstrapBundledRoleCatalog } from './bundled-profile-bootstrap.js';
import { BUNDLED_ARTIFACT_SCHEMA, BUNDLED_ENVELOPE_ERROR } from './bundled-envelope.constants.js';
import { BUNDLED_ROLE_ARTIFACT_CONTRACT_REF } from './bundled-profile.constants.js';

const CANDIDATE_SHA = '47ea3a46ddd23715773758f17ccc62f5fae89e67';
const WORK_DEFINITION_REF = { id: 'BUG-002', version: 1, digest: 'sha256:abc' };

function verdictEnvelope(verdict: string): unknown {
  return {
    kind: 'review-verdict',
    payload: { verdict, candidateSha: CANDIDATE_SHA, workDefinitionRef: WORK_DEFINITION_REF },
  };
}

function envelopeSchemaDigest(store: ReturnType<typeof openStore>): string | undefined {
  return store.orm.select({ schemaDigest: artifactContracts.schemaDigest }).from(artifactContracts)
    .where(eq(artifactContracts.ref, BUNDLED_ROLE_ARTIFACT_CONTRACT_REF)).get()?.schemaDigest;
}

function staleEnvelopeSchema(store: ReturnType<typeof openStore>): void {
  store.orm.update(artifactContracts).set({ schemaJson: '{}', schemaDigest: 'sha256:stale' })
    .where(eq(artifactContracts.ref, BUNDLED_ROLE_ARTIFACT_CONTRACT_REF)).run();
}

test('bootstrap seeds the envelope with the strict review-verdict branch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-bundled-envelope-'));
  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);

  assert.equal(envelopeSchemaDigest(store), digest(BUNDLED_ARTIFACT_SCHEMA));
  validateArtifact(store, BUNDLED_ROLE_ARTIFACT_CONTRACT_REF, verdictEnvelope('APPROVED'));
  validateArtifact(store, BUNDLED_ROLE_ARTIFACT_CONTRACT_REF, verdictEnvelope('REQUEST_CHANGES'));
  assert.throws(
    () => { validateArtifact(store, BUNDLED_ROLE_ARTIFACT_CONTRACT_REF, verdictEnvelope('approved')); },
    (error: unknown) => error instanceof ContextError && error.code === ARTIFACT_CONTRACT_ERROR.CONTRACT_VIOLATION,
  );
  assert.throws(
    () => {
      validateArtifact(store, BUNDLED_ROLE_ARTIFACT_CONTRACT_REF, {
        kind: 'review-verdict',
        payload: { verdict: 'APPROVED', candidateSha: CANDIDATE_SHA },
      });
    },
    (error: unknown) => error instanceof ContextError && error.code === ARTIFACT_CONTRACT_ERROR.CONTRACT_VIOLATION,
  );
  // Other kinds keep the open envelope until their own strict branch exists.
  validateArtifact(store, BUNDLED_ROLE_ARTIFACT_CONTRACT_REF, {
    kind: 'implementation-report',
    payload: { free: 'form' },
  });
  store.close();
});

test('bootstrap reconciles a stale envelope schema without touching the catalog receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-bundled-envelope-reconcile-'));
  const store = openStore(root);
  const first = bootstrapBundledRoleCatalog(store);
  staleEnvelopeSchema(store);

  const second = bootstrapBundledRoleCatalog(store);

  assert.deepEqual(second, first);
  assert.equal(envelopeSchemaDigest(store), digest(BUNDLED_ARTIFACT_SCHEMA));
  store.close();
});

test('bootstrap refuses to rewrite an envelope schema that already produced artifacts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-bundled-envelope-drift-'));
  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);
  staleEnvelopeSchema(store);
  store.orm.insert(workflowArtifacts).values({
    id: 'ART-STALE-1',
    contractRef: BUNDLED_ROLE_ARTIFACT_CONTRACT_REF,
    valueJson: '{"kind":"review-verdict","payload":{}}',
    valueDigest: 'sha256:stale-artifact',
    producerKind: 'agent',
    producerRef: 'RUN-STALE',
    createdAt: new Date().toISOString(),
  }).run();

  assert.throws(
    () => bootstrapBundledRoleCatalog(store),
    (error: unknown) => error instanceof ContextError && error.code === BUNDLED_ENVELOPE_ERROR.CONTRACT_DRIFT,
  );
  store.close();
});
