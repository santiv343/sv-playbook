import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { numberColumn, stringColumn } from '../db/rows.js';
import { ARTIFACT_CONTRACT_STATUS } from '../contracts/artifact.constants.js';
import { addArtifactContract, resolvedArtifactSchema } from '../contracts/artifacts.js';
import { ContextError } from '../context/context.errors.js';
import { digest } from '../context/digest.js';
import { CONTEXT_ERROR, CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from '../context/context.constants.js';
import { addContextItem } from '../context/repository.js';
import { readWorkflowDashboard } from '../orchestration/observability.js';
import { roleContracts } from '../orchestration/schema.constants.js';
import { dispatchRun } from './gateway.js';
import { EXECUTION_PROFILE_ERROR, GATEWAY_LIFECYCLE_ERROR, GATEWAY_OPERATION, GATEWAY_RUN_STATUS, RUN_PROMPT_FIELD, RUN_SPEC_ERROR } from './gateway.constants.js';
import type { GatewayRuntime, WorkRunSpecRequest } from './gateway.types.js';
import { addExecutionProfile, loadExecutionProfile, selectExecutionProfile, setExecutionProfile,
  setExecutionProfilePreference } from './profiles.js';
import { renderRunPrompt } from './prompt.js';
import { loadRunSpec, prepareRunSpec, prepareWorkflowRunSpec } from './run-spec.js';
import { acceptSession, acceptTurn, commitIntent } from './gateway-repository.js';
import { gatewayRunState } from './schema.constants.js';
import { claimedAgentEffect, FakeAdapter, gatewayFixture as fixture } from './gateway.test-support.js';
import { REFERENCE_KIND } from '../platform.constants.js';
import { WORK_DEFINITION_INITIAL_VERSION } from '../tasks/work-definition.constants.js';
import { ROLE_CATALOG_ERROR } from '../roles/catalog.constants.js';

const WORK_DEFINITION_REF = {
  kind: REFERENCE_KIND.WORK_DEFINITION,
  id: 'TASK-1',
  version: WORK_DEFINITION_INITIAL_VERSION,
} as const;
const ROLE_CONTEXT_REFERENCE = {
  kind: REFERENCE_KIND.CONTEXT_ITEM,
  id: 'ROLE-IMPL',
  version: WORK_DEFINITION_INITIAL_VERSION,
} as const;
const TEST_TIMEOUT_MS = 2;
const TEST_OBSERVATION_INTERVAL_MS = 1;
const UNKNOWN_RUN_SPEC_ID = 'RUN-UNKNOWN';

function workRequest(): WorkRunSpecRequest {
  return { roleId: 'implementer', phase: 'delivery', workDefinitionRef: WORK_DEFINITION_REF, executionProfileId: 'fake-impl' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  assert.ok(isRecord(value), `${field} must be an object`);
  return value;
}

test('RunSpec compilation is mandatory before intent-first adapter dispatch', async () => {
  const { root, store } = await fixture();
  const request = workRequest();
  const runSpec = prepareRunSpec(store, request);
  const adapter = new FakeAdapter();
  const receipt = await dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root);

  assert.equal(receipt.session.sessionId, 'session-1');
  assert.equal(receipt.turn.messageId, 'message-1');
  assert.equal(receipt.completion.outputDigest.length > 0, true);
  const prompt = adapter.turnRequest?.prompt;
  assert.ok(prompt);
  assert.match(prompt, /"kind":"work-definition"/);
  assert.match(prompt, new RegExp(runSpec.contextPackId));
  assert.ok(runSpec.workDefinitionRef);
  assert.deepEqual(runSpec.workDefinitionRef, { ...WORK_DEFINITION_REF, digest: runSpec.workDefinitionRef.digest });
  assert.deepEqual(runSpec.contextReferences, [ROLE_CONTEXT_REFERENCE]);
  const rendered: unknown = JSON.parse(prompt);
  const workDefinition = requiredRecord(requiredRecord(rendered, 'prompt')[RUN_PROMPT_FIELD.WORK_DEFINITION], 'work definition');
  const renderedReference = requiredRecord(workDefinition.reference, 'work definition reference');
  assert.equal(renderedReference.id, 'TASK-1');
  assert.equal(renderedReference.digest, runSpec.workDefinitionRef.digest);
  assert.equal(numberColumn(store.db.prepare("SELECT count(*) AS count FROM dispatch_intents WHERE status = 'consumed'").get(), 'count'), 2);
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM gateway_sessions').get(), 'count'), 1);
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM gateway_turns').get(), 'count'), 1);
  assert.equal(numberColumn(store.db.prepare("SELECT count(*) AS count FROM gateway_run_state WHERE status = 'completed'").get(), 'count'), 1);
  const agentRun = readWorkflowDashboard(store).agentRuns[0];
  assert.ok(agentRun);
  assert.equal(agentRun.runSpecId, runSpec.id);
  assert.equal(agentRun.workflowId, null);
  assert.equal(agentRun.status, GATEWAY_RUN_STATUS.COMPLETED);
  assert.deepEqual(agentRun.observedToolIds, []);
  store.close();
});

test('dispatch rejects a RunSpec id that has no durable snapshot', async () => {
  const { root, store } = await fixture();
  const adapter = new FakeAdapter();

  await assert.rejects(
    dispatchRun(store, UNKNOWN_RUN_SPEC_ID, new Map([[adapter.id, adapter]]), root),
    (error: unknown) => error instanceof ContextError && error.code === RUN_SPEC_ERROR.UNKNOWN,
  );
  assert.equal(adapter.sessionCreateCount, 0);
  assert.equal(adapter.turnSubmitCount, 0);
  store.close();
});

test('dispatch rejects a durable RunSpec when the role catalog was not activated', async () => {
  const { root, store } = await fixture({ activateCatalog: false });
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();

  await assert.rejects(
    dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root),
    (error: unknown) => error instanceof ContextError
      && error.code === ROLE_CATALOG_ERROR.ACTIVE_CATALOG_MISSING,
  );
  assert.equal(adapter.sessionCreateCount, 0);
  assert.equal(adapter.turnSubmitCount, 0);
  store.close();
});

test('RunSpec deterministically selects the configured execution profile when no override is provided', async () => {
  const { store } = await fixture();
  const runSpec = prepareRunSpec(store, { roleId: 'implementer', phase: 'delivery', workDefinitionRef: WORK_DEFINITION_REF });

  assert.equal(runSpec.executionProfile.id, 'fake-impl');
  assert.deepEqual(runSpec.contextTags, ['frontend']);
  store.close();
});

test('RunSpec preparation fails closed when the role contract context is no longer active', async () => {
  const { store } = await fixture();
  addContextItem(store, {
    id: 'ROLE-IMPL', version: 2, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.charter', body: 'Updated role.',
    provenance: 'test', selectors: { role: ['implementer'] }, supersedes: ['ROLE-IMPL@1'],
  });

  assert.throws(
    () => prepareRunSpec(store, workRequest()),
    (error: unknown) => error instanceof ContextError && error.code === CONTEXT_ERROR.INACTIVE_REFERENCE,
  );
  store.close();
});

test('RunSpec preparation is idempotent and snapshots the selected profile', async () => {
  const { store } = await fixture();
  const request = workRequest();
  const first = prepareRunSpec(store, request);
  const repeated = prepareRunSpec(store, request);
  assert.equal(repeated.id, first.id);
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM run_specs').get(), 'count'), 1);
  setExecutionProfile(store, { ...loadExecutionProfile(store, 'fake-impl'), tools: { read: false } });
  assert.deepEqual([loadRunSpec(store, first.id).executionProfile.tools, prepareRunSpec(store, request).id], [{ read: true }, first.id]);
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM run_specs').get(), 'count'), 1);
  store.close();
});

test('RunSpec preparation fails closed when its durable dispatch identity is missing', async () => {
  const { store } = await fixture();
  const request = workRequest();
  const runSpec = prepareRunSpec(store, request);
  store.db.prepare('DELETE FROM run_dispatches WHERE run_spec_id = ?').run(runSpec.id);

  assert.throws(
    () => prepareRunSpec(store, request),
    (error: unknown) => error instanceof ContextError && error.code === RUN_SPEC_ERROR.INVALID,
  );
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM run_specs').get(), 'count'), 1);
  store.close();
});

test('a turn failure leaves the confirmed session durable and blocks only the turn intent', async () => {
  const { root, store } = await fixture();
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  adapter.turnError = new ContextError('AMBIGUOUS_DELIVERY', 'not observable yet');

  await assert.rejects(dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root));
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM gateway_sessions').get(), 'count'), 1);
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM gateway_turns').get(), 'count'), 0);
  assert.equal(numberColumn(store.db.prepare("SELECT count(*) AS count FROM dispatch_intents WHERE status = 'consumed'").get(), 'count'), 1);
  assert.equal(numberColumn(store.db.prepare("SELECT count(*) AS count FROM dispatch_intents WHERE status = 'blocked'").get(), 'count'), 1);
  adapter.turnError = undefined;
  const recovered = await dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root);
  assert.equal(recovered.completion.outputDigest.length > 0, true);
  assert.equal(adapter.sessionCreateCount, 1);
  assert.equal(adapter.turnSubmitCount, 2);
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM gateway_sessions').get(), 'count'), 1);
  assert.equal(numberColumn(store.db.prepare('SELECT turn_sequence FROM gateway_turns').get(), 'turn_sequence'), 2);
  store.close();
});

test('dispatch resumes a durable observing turn without recreating or resubmitting it', async () => {
  const { root, store } = await fixture();
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  const createIntent = commitIntent(store, runSpec, GATEWAY_OPERATION.CREATE_SESSION);
  acceptSession(store, runSpec, createIntent.id, {
    adapterId: adapter.id,
    sessionId: 'session-1',
    profileDigest: 'sha256:profile',
    sessionReceipt: { status: 'confirmed' },
  });
  const turnIntent = commitIntent(store, runSpec, GATEWAY_OPERATION.SUBMIT_TURN, 1);
  acceptTurn(store, runSpec, 1, turnIntent.id, {
    adapterId: adapter.id,
    sessionId: 'session-1',
    messageId: 'message-1',
    submissionReceipt: { deliveryStatus: 'observed' },
  });
  const now = new Date().toISOString();
  store.orm.insert(gatewayRunState).values({
    runSpecId: runSpec.id,
    adapterSessionId: 'session-1',
    messageId: 'message-1',
    status: GATEWAY_RUN_STATUS.OBSERVING,
    progressToken: 'working',
    observedToolIdsJson: '[]',
    lastObservedAt: now,
    lastProgressAt: now,
    updatedAt: now,
  }).run();

  const first = await dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root);
  const replayed = await dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root);
  assert.equal(first.completion.outputDigest, replayed.completion.outputDigest);
  assert.equal(adapter.sessionCreateCount, 0);
  assert.equal(adapter.turnSubmitCount, 0);
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM gateway_turns').get(), 'count'), 1);
  store.close();
});

test('an actually observed undeclared tool is cancelled and mechanically rejected', async () => {
  const { root, store } = await fixture();
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  adapter.observations.push({
    adapterId: adapter.id, sessionId: 'session-1', messageId: 'message-1', state: 'completed',
    progressToken: 'tool-used', observedToolIds: ['write'], output: '{"ok":true}', evidence: { source: 'fake' },
  });

  await assert.rejects(
    dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root),
    (error: unknown) => error instanceof ContextError && error.code === GATEWAY_LIFECYCLE_ERROR.PROHIBITED_TOOL_USE,
  );
  assert.equal(adapter.cancelled, true);
  assert.equal(stringColumn(store.db.prepare('SELECT status FROM gateway_run_state').get(), 'status'), 'policy-blocked');
  store.close();
});

test('no-progress timeout is driven by the runtime clock and confirms cancellation', async () => {
  const { root, store } = await fixture({
    observationIntervalMs: TEST_OBSERVATION_INTERVAL_MS,
    noProgressTimeoutMs: TEST_TIMEOUT_MS,
    cancellationGraceMs: TEST_TIMEOUT_MS,
  });
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  for (let index = 0; index < 3; index += 1) {
    adapter.observations.push({
      adapterId: adapter.id, sessionId: 'session-1', messageId: 'message-1', state: 'running',
      progressToken: 'same-progress', observedToolIds: [], evidence: { source: 'fake' },
    });
  }
  let now = 0;
  const runtime: GatewayRuntime = {
    now: () => now,
    sleep: (delayMs) => { now += delayMs; return Promise.resolve(); },
  };

  await assert.rejects(
    dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root, runtime),
    (error: unknown) => error instanceof ContextError && error.code === GATEWAY_LIFECYCLE_ERROR.NO_PROGRESS_TIMEOUT,
  );
  assert.equal(adapter.cancelled, true);
  assert.equal(stringColumn(store.db.prepare('SELECT status FROM gateway_run_state').get(), 'status'), 'timed-out');
  store.close();
});

test('adapter observation failure cannot leave a run stuck in observing', async () => {
  const { root, store } = await fixture();
  const runSpec = prepareRunSpec(store, workRequest());
  const adapter = new FakeAdapter();
  adapter.observeRun = () => Promise.reject(new ContextError('ADAPTER_HTTP_ERROR', 'unavailable'));

  await assert.rejects(dispatchRun(store, runSpec.id, new Map([[adapter.id, adapter]]), root));
  assert.equal(stringColumn(store.db.prepare('SELECT status FROM gateway_run_state').get(), 'status'), 'failed');
  store.close();
});

test('RunSpec preparation fails before persistence when a runtime capability is not authorized', async () => {
  const { store } = await fixture();
  const effect = claimedAgentEffect(store, { requestedCapabilities: ['promotion.execute'] });
  assert.throws(
    () => { prepareWorkflowRunSpec(store, effect); },
    (error: unknown) => error instanceof ContextError && error.code === RUN_SPEC_ERROR.CAPABILITY_DENIED,
  );
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM run_specs').get(), 'count'), 0);
  store.close();
});

test('RunSpec preparation rejects a role whose output contract is not active', async () => {
  const { store } = await fixture();
  store.db.prepare("UPDATE artifact_contracts SET status = 'retired' WHERE ref = 'report-v1'").run();
  assert.throws(
    () => { prepareRunSpec(store, {
      ...workRequest(),
    }); },
    (error: unknown) => error instanceof ContextError && error.code === RUN_SPEC_ERROR.UNRESOLVED_OUTPUT_CONTRACT,
  );
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM run_specs').get(), 'count'), 0);
  store.close();
});

test('execution profile selection is deterministic and requires an explicit preference when ambiguous', async () => {
  const { store } = await fixture();
  assert.equal(selectExecutionProfile(store, 'implementer').id, 'fake-impl');
  addExecutionProfile(store, {
    id: 'alternate-impl', roleId: 'implementer', adapterId: 'alternate', agentId: 'implementer', providerId: 'other-provider',
    modelId: 'other-model', adapterConfig: { endpoint: 'alternate' }, observationIntervalMs: 1, noProgressTimeoutMs: 600_000,
    cancellationGraceMs: 10_000, tools: { read: true }, enabled: true,
  });
  assert.throws(
    () => selectExecutionProfile(store, 'implementer'),
    (error: unknown) => error instanceof ContextError && error.code === EXECUTION_PROFILE_ERROR.AMBIGUOUS_FOR_ROLE,
  );
  setExecutionProfilePreference(store, 'implementer', 'alternate-impl', 0);
  assert.equal(selectExecutionProfile(store, 'implementer').id, 'alternate-impl');
  const updated = { ...loadExecutionProfile(store, 'alternate-impl'), tools: { read: false } };
  setExecutionProfile(store, updated);
  assert.deepEqual(loadExecutionProfile(store, 'alternate-impl').tools, { read: false });
  store.close();
});

test('RunSpec prompt receives the typed workflow artifact without redundant task context', async () => {
  const { store } = await fixture();
  const input = { task: 'Implement the bounded change' };
  const effect = claimedAgentEffect(store, { input });
  const runSpec = prepareWorkflowRunSpec(store, effect);
  assert.deepEqual(runSpec.contextReferences, [ROLE_CONTEXT_REFERENCE]);
  assert.equal(runSpec.workDefinitionRef, null);
  assert.deepEqual(runSpec.workflowEffectRef, {
    kind: REFERENCE_KIND.WORKFLOW_EFFECT, id: effect.id, workflowId: effect.workflowId,
    stepKey: effect.stepKey, attempt: effect.attempt,
  });
  const prompt: unknown = JSON.parse(renderRunPrompt(store, runSpec));
  assert.equal(isRecord(prompt), true);
  const inputArtifact = isRecord(prompt) ? prompt[RUN_PROMPT_FIELD.INPUT_ARTIFACT] : undefined;
  assert.deepEqual(inputArtifact, {
    id: effect.inputArtifactId, contractRef: 'task-v1', value: input, digest: digest(input),
  });
  const outputContract = isRecord(prompt) ? prompt[RUN_PROMPT_FIELD.OUTPUT_CONTRACT] : undefined;
  const resolvedSchema = resolvedArtifactSchema(store, runSpec.outputContractRef);
  assert.deepEqual(outputContract, {
    ref: runSpec.outputContractRef,
    schemaDigest: digest(resolvedSchema),
    schema: resolvedSchema,
  });
  store.close();
});

test('workflow RunSpec compilation preserves the immutable step contracts after the role catalog advances', async () => {
  const { store } = await fixture();
  addArtifactContract(store, {
    ref: 'task-v2',
    status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' },
  });
  addArtifactContract(store, {
    ref: 'report-v2',
    status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
    schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' },
  });
  const input = { task: 'Continue the workflow registered under v1 contracts' };
  const effect = claimedAgentEffect(store, { input, inputContractRef: 'task-v1', outputContractRef: 'report-v1' });
  store.orm.update(roleContracts).set({ inputContractRef: 'task-v2', outputContractRef: 'report-v2' })
    .where(eq(roleContracts.roleId, 'implementer')).run();

  const runSpec = prepareWorkflowRunSpec(store, effect);

  assert.equal(runSpec.outputContractRef, 'report-v1');
  assert.throws(
    () => prepareWorkflowRunSpec(store, { ...effect, outputContractRef: 'report-v2' }),
    (error: unknown) => error instanceof ContextError && error.code === RUN_SPEC_ERROR.INVALID,
  );
  store.close();
});
