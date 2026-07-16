import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonicalJson } from '../context/digest.js';
import { STRUCTURED_OUTPUT_NORMALIZATION } from '../contracts/structured-output.constants.js';
import { openStore } from '../db/store.js';
import type { Store } from '../db/store.types.js';
import { FakeAdapter } from '../gateway/gateway.test-support.js';
import { addExecutionProfile } from '../gateway/profiles.js';
import { checkModelCapabilityEvidence } from './model-capability-evidence.js';
import {
  MODEL_CAPABILITY_EVALUATION_CASE_ID,
  MODEL_CAPABILITY_EVALUATION_EXPECTED,
  MODEL_CAPABILITY_EVALUATION_OUTPUT_SCHEMA,
} from './model-capability-evaluation.constants.js';
import {
  evaluateConfiguredModels,
  listModelCapabilityEvaluations,
  scoreModelCapabilityOutput,
} from './model-capability-evaluation.js';
import { bootstrapBundledRoleCatalog } from './bundled-profile-bootstrap.js';

const TEST_PROFILE = {
  id: 'profile-1',
  roleId: 'human-interface',
  adapterId: 'fake',
  agentId: 'human-interface',
  providerId: 'provider',
  modelId: 'model',
} as const;
const TEST_ASSESSED_AT = new Date('2026-07-15T00:00:00.000Z');
const TEST_EVIDENCE_CHECKED_AT = new Date('2026-07-16T00:00:00.000Z');
const TEST_VALIDITY_DAYS = 30;

async function createEvaluationHarness(output: unknown, rawOutput = canonicalJson(output)): Promise<{
  root: string;
  store: Store;
  adapter: FakeAdapter;
}> {
  const root = await mkdtemp(join(tmpdir(), 'svp-model-evaluation-'));
  const store = openStore(root);
  bootstrapBundledRoleCatalog(store);
  addExecutionProfile(store, {
    ...TEST_PROFILE,
    adapterConfig: {},
    observationIntervalMs: 1,
    noProgressTimeoutMs: 100,
    cancellationGraceMs: 10,
    tools: { read: false },
    enabled: true,
  });
  const adapter = new FakeAdapter();
  adapter.observations.push({
    adapterId: adapter.id,
    sessionId: 'session-1',
    messageId: 'message-1',
    state: 'completed',
    progressToken: 'complete',
    observedToolIds: [],
    output: rawOutput,
    evidence: { source: 'fake' },
  });
  return { root, store, adapter };
}

test('general semantic reasoning evaluation is scored without another model', () => {
  assert.deepEqual(scoreModelCapabilityOutput(
    MODEL_CAPABILITY_EVALUATION_EXPECTED,
    [],
  ), { passed: true, violations: [] });

  const incorrect = {
    ...MODEL_CAPABILITY_EVALUATION_EXPECTED,
    decisions: MODEL_CAPABILITY_EVALUATION_EXPECTED.decisions.map((decision) =>
      decision.caseId === MODEL_CAPABILITY_EVALUATION_CASE_ID.DETERMINISTIC_EFFECT
        ? { ...decision, action: 'perform-effect' }
        : decision),
  };
  assert.deepEqual(scoreModelCapabilityOutput(incorrect, []), {
    passed: false,
    violations: ['output does not match the versioned answer key'],
  });
  assert.deepEqual(scoreModelCapabilityOutput(MODEL_CAPABILITY_EVALUATION_EXPECTED, ['bash']), {
    passed: false,
    violations: ['evaluation used tools: bash'],
  });
});

test('a passing adapter evaluation is stored durably and enables its exact model identity', async () => {
  const { root, store, adapter } = await createEvaluationHarness(
    MODEL_CAPABILITY_EVALUATION_EXPECTED,
    `\`\`\`json\n${canonicalJson(MODEL_CAPABILITY_EVALUATION_EXPECTED)}\n\`\`\``,
  );

  const receipts = await evaluateConfiguredModels(
    store,
    root,
    new Map([[adapter.id, adapter]]),
    { now: TEST_ASSESSED_AT, validityDays: TEST_VALIDITY_DAYS },
  );

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]?.passed, true);
  assert.equal(
    receipts[0].outputReceipt?.normalization,
    STRUCTURED_OUTPUT_NORMALIZATION.SINGLE_JSON_FENCE,
  );
  assert.deepEqual(checkModelCapabilityEvidence(store, TEST_EVIDENCE_CHECKED_AT),
    { valid: true, violations: [] });
  assert.deepEqual(listModelCapabilityEvaluations(store), receipts.map((receipt) => ({
    id: receipt.id,
    suiteId: receipt.suiteId,
    capabilityId: receipt.capabilityId,
    profileId: receipt.profileId,
    providerId: receipt.providerId,
    modelId: receipt.modelId,
    variant: receipt.variant,
    passed: receipt.passed,
    assessedAt: receipt.assessedAt,
    expiresAt: receipt.expiresAt,
    receiptDigest: receipt.receiptDigest,
  })));
  assert.deepEqual(adapter.turnRequest?.outputSchema, MODEL_CAPABILITY_EVALUATION_OUTPUT_SCHEMA);
  store.close();
});

test('a failed adapter evaluation is stored but cannot enable its model identity', async () => {
  const incorrectOutput = {
    ...MODEL_CAPABILITY_EVALUATION_EXPECTED,
    decisions: MODEL_CAPABILITY_EVALUATION_EXPECTED.decisions.map((decision) =>
      decision.caseId === MODEL_CAPABILITY_EVALUATION_CASE_ID.DETERMINISTIC_EFFECT
        ? { ...decision, action: 'perform-effect' }
        : decision),
  };
  const { root, store, adapter } = await createEvaluationHarness(incorrectOutput);

  const receipts = await evaluateConfiguredModels(
    store,
    root,
    new Map([[adapter.id, adapter]]),
    { now: TEST_ASSESSED_AT, validityDays: TEST_VALIDITY_DAYS },
  );

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]?.passed, false);
  assert.equal(listModelCapabilityEvaluations(store)[0]?.passed, false);
  const evidence = checkModelCapabilityEvidence(store, TEST_EVIDENCE_CHECKED_AT);
  assert.equal(evidence.valid, false);
  assert.equal(evidence.violations.length, 1);
  store.close();
});
