import type { Store } from '../db/store.types.js';
import { canonicalJson, digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import { parseAgentJsonOutput } from '../contracts/structured-output.js';
import { validateArtifact } from '../contracts/artifacts.js';
import { stringColumn } from '../db/rows.js';
import type {
  AdapterCancellationReceipt,
  AdapterObservationRequest,
  AdapterRunObservation,
  AdapterTurnReceipt,
  AgentAdapter,
  GatewayCompletionReceipt,
  GatewayRuntime,
  RunSpec,
} from './gateway.types.js';
import { ADAPTER_RUN_STATE } from './gateway.types.js';
import {
  GATEWAY_LIFECYCLE_ERROR,
  GATEWAY_OPERATION,
  GATEWAY_RUN_STATUS,
  type GatewayRunStatus,
} from './gateway.constants.js';
import { isRunObserving, loadRunSnapshot } from './gateway-repository.js';

const SYSTEM_RUNTIME: GatewayRuntime = {
  now: () => Date.now(),
  sleep: (delayMs) => new Promise((resolve) => { setTimeout(resolve, delayMs); }),
};
const MISSING_OUTPUT_DETAIL = 'completed run has no output';
const OUTPUT_INVALID_STATUS: TerminalStatus = GATEWAY_RUN_STATUS.OUTPUT_INVALID;
const BEGIN_IMMEDIATE = 'BEGIN IMMEDIATE';

type TerminalStatus = Exclude<GatewayRunStatus, typeof GATEWAY_RUN_STATUS.OBSERVING>;

interface ObservationState {
  progressToken: string;
  lastProgressMs: number;
}

interface LifecycleContext {
  store: Store;
  runSpec: RunSpec;
  adapter: AgentAdapter;
  request: AdapterObservationRequest;
  runtime: GatewayRuntime;
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function assertObservation(adapter: AgentAdapter, request: AdapterObservationRequest, value: AdapterRunObservation): void {
  if (value.adapterId !== adapter.id || value.sessionId !== request.sessionId || value.messageId !== request.messageId) {
    throw new ContextError('ADAPTER_RECEIPT_MISMATCH', 'observation identity does not match the dispatched turn');
  }
  if (value.progressToken.trim().length === 0) {
    throw new ContextError('INVALID_ADAPTER_RESPONSE', 'observation progress token must not be empty');
  }
}

function assertCancellation(adapter: AgentAdapter, request: AdapterObservationRequest, value: AdapterCancellationReceipt): void {
  if (value.adapterId !== adapter.id || value.sessionId !== request.sessionId || value.messageId !== request.messageId) {
    throw new ContextError('ADAPTER_RECEIPT_MISMATCH', 'cancellation identity does not match the dispatched turn');
  }
}

function beginOrResumeObservation(store: Store, runSpec: RunSpec, turn: AdapterTurnReceipt, nowMs: number): ObservationState {
  const snapshot = loadRunSnapshot(store, runSpec.id);
  if (snapshot !== undefined) {
    if (!isRunObserving(snapshot)) {
      throw new ContextError(GATEWAY_LIFECYCLE_ERROR.TERMINAL_RUN, `gateway run is terminal: ${snapshot.status}`);
    }
    if (snapshot.sessionId !== turn.sessionId || snapshot.messageId !== turn.messageId) {
      throw new ContextError('INVALID_GATEWAY_STATE', 'durable observation belongs to a different turn');
    }
    const lastProgressMs = Date.parse(snapshot.lastProgressAt);
    if (!Number.isFinite(lastProgressMs)) {
      throw new ContextError('INVALID_GATEWAY_STATE', 'durable progress timestamp is invalid');
    }
    return { progressToken: snapshot.progressToken, lastProgressMs };
  }
  const progressToken = `submitted:${turn.messageId}`;
  const at = iso(nowMs);
  store.db.prepare(`INSERT INTO gateway_run_state
    (run_spec_id, adapter_session_id, message_id, status, progress_token, observed_tool_ids_json,
     last_observed_at, last_progress_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?)`)
    .run(runSpec.id, turn.sessionId, turn.messageId, GATEWAY_RUN_STATUS.OBSERVING, progressToken, at, at, at);
  return { progressToken, lastProgressMs: nowMs };
}

function sortedToolIds(observation: AdapterRunObservation): readonly string[] {
  return [...new Set(observation.observedToolIds)].sort();
}

function recordObservation(
  store: Store,
  runSpec: RunSpec,
  observation: AdapterRunObservation,
  previous: ObservationState,
  nowMs: number,
): ObservationState {
  const toolIds = sortedToolIds(observation);
  const changed = observation.progressToken !== previous.progressToken;
  const next = changed ? { progressToken: observation.progressToken, lastProgressMs: nowMs } : previous;
  const at = iso(nowMs);
  store.db.prepare(`UPDATE gateway_run_state SET progress_token = ?, observed_tool_ids_json = ?,
    last_observed_at = ?, last_progress_at = ?, observation_receipt_json = ?, updated_at = ?
    WHERE run_spec_id = ? AND status = ?`)
    .run(observation.progressToken, canonicalJson(toolIds), at, iso(next.lastProgressMs),
      canonicalJson(observation.evidence), at, runSpec.id, GATEWAY_RUN_STATUS.OBSERVING);
  if (changed) {
    store.db.prepare(`INSERT INTO gateway_run_events
      (run_spec_id, status, progress_token, observed_tool_ids_json, receipt_json, observed_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(runSpec.id, GATEWAY_RUN_STATUS.OBSERVING, observation.progressToken,
        canonicalJson(toolIds), canonicalJson(observation.evidence), at);
  }
  return next;
}

function finishRun(
  store: Store,
  runSpec: RunSpec,
  status: TerminalStatus,
  observation: AdapterRunObservation,
  nowMs: number,
  detail?: string,
  cancellation?: AdapterCancellationReceipt,
  output?: unknown,
): void {
  const at = iso(nowMs);
  const outputJson = output === undefined ? null : canonicalJson(output);
  const outputDigest = output === undefined ? null : digest(output);
  const toolIds = sortedToolIds(observation);
  store.db.exec(BEGIN_IMMEDIATE);
  try {
    store.db.prepare(`UPDATE gateway_run_state SET status = ?, progress_token = ?, observed_tool_ids_json = ?,
      last_observed_at = ?, terminal_at = ?, output_json = ?, output_digest = ?, observation_receipt_json = ?,
      cancellation_receipt_json = ?, detail = ?, updated_at = ? WHERE run_spec_id = ? AND status = ?`)
      .run(status, observation.progressToken, canonicalJson(toolIds), at, at, outputJson, outputDigest,
        canonicalJson(observation.evidence), cancellation === undefined ? null : canonicalJson(cancellation.evidence),
        detail ?? null, at, runSpec.id, GATEWAY_RUN_STATUS.OBSERVING);
    store.db.prepare(`INSERT INTO gateway_run_events
      (run_spec_id, status, progress_token, observed_tool_ids_json, receipt_json, observed_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(runSpec.id, status, observation.progressToken, canonicalJson(toolIds), canonicalJson(observation.evidence), at);
    store.db.exec('COMMIT');
  } catch (error: unknown) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}

function prohibitedTools(runSpec: RunSpec, observation: AdapterRunObservation): readonly string[] {
  return sortedToolIds(observation).filter((toolId) => runSpec.executionProfile.tools[toolId] !== true);
}

async function cancelAndAwait(
  adapter: AgentAdapter,
  request: AdapterObservationRequest,
  runSpec: RunSpec,
  runtime: GatewayRuntime,
): Promise<{ cancellation: AdapterCancellationReceipt; observation: AdapterRunObservation; confirmed: boolean }> {
  const cancellation = await adapter.cancelRun(request);
  assertCancellation(adapter, request, cancellation);
  const deadline = runtime.now() + runSpec.cancellationGraceMs;
  let observation = await adapter.observeRun(request);
  assertObservation(adapter, request, observation);
  while (observation.state === ADAPTER_RUN_STATE.RUNNING && runtime.now() < deadline) {
    const remaining = deadline - runtime.now();
    await runtime.sleep(Math.min(runSpec.executionProfile.observationIntervalMs, remaining));
    observation = await adapter.observeRun(request);
    assertObservation(adapter, request, observation);
  }
  return { cancellation, observation, confirmed: observation.state !== ADAPTER_RUN_STATE.RUNNING };
}

function adapterFailure(state: AdapterRunObservation['state']): ContextError {
  return new ContextError('AGENT_RUN_FAILED', `adapter reported terminal state: ${state}`);
}

function failObservingRun(store: Store, runSpec: RunSpec, error: unknown, nowMs: number): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const row = store.db.prepare(`SELECT progress_token, observed_tool_ids_json FROM gateway_run_state
    WHERE run_spec_id = ? AND status = ?`).get(runSpec.id, GATEWAY_RUN_STATUS.OBSERVING);
  if (typeof row !== 'object' || row === null) return;
  const progressToken = stringColumn(row, 'progress_token');
  const toolIdsJson = stringColumn(row, 'observed_tool_ids_json');
  const at = iso(nowMs);
  store.db.exec(BEGIN_IMMEDIATE);
  try {
    store.db.prepare(`UPDATE gateway_run_state SET status = ?, terminal_at = ?, detail = ?, updated_at = ?
      WHERE run_spec_id = ? AND status = ?`).run(
      GATEWAY_RUN_STATUS.FAILED, at, detail, at, runSpec.id, GATEWAY_RUN_STATUS.OBSERVING,
    );
    store.db.prepare(`INSERT INTO gateway_run_events
      (run_spec_id, status, progress_token, observed_tool_ids_json, receipt_json, observed_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(runSpec.id, GATEWAY_RUN_STATUS.FAILED, progressToken, toolIdsJson, canonicalJson({ error: detail }), at);
    store.db.exec('COMMIT');
  } catch (persistError: unknown) {
    store.db.exec('ROLLBACK');
    throw persistError;
  }
}

async function enforceToolPolicy(context: LifecycleContext, observation: AdapterRunObservation): Promise<void> {
  const denied = prohibitedTools(context.runSpec, observation);
  if (denied.length === 0) return;
  const stopped = await cancelAndAwait(context.adapter, context.request, context.runSpec, context.runtime);
  const detail = `prohibited tool use observed: ${denied.join(', ')}`;
  finishRun(context.store, context.runSpec,
    stopped.confirmed ? GATEWAY_RUN_STATUS.POLICY_BLOCKED : GATEWAY_RUN_STATUS.FAILED, stopped.observation,
    context.runtime.now(), stopped.confirmed ? detail : `${detail}; cancellation was not confirmed`, stopped.cancellation);
  throw new ContextError(GATEWAY_LIFECYCLE_ERROR.PROHIBITED_TOOL_USE, detail);
}

function validateCompletion(
  context: LifecycleContext,
  observation: AdapterRunObservation,
  nowMs: number,
): GatewayCompletionReceipt {
  if (observation.output === undefined) {
    finishRun(context.store, context.runSpec, OUTPUT_INVALID_STATUS, observation, nowMs, MISSING_OUTPUT_DETAIL);
    throw new ContextError('INVALID_AGENT_OUTPUT', MISSING_OUTPUT_DETAIL);
  }
  try {
    const parsed = parseAgentJsonOutput(observation.output);
    validateArtifact(context.store, context.runSpec.outputContractRef, parsed.value);
    finishRun(context.store, context.runSpec, GATEWAY_RUN_STATUS.COMPLETED,
      observation, nowMs, undefined, undefined, parsed.value);
    return { output: parsed.value, outputDigest: digest(parsed.value), observation };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    finishRun(context.store, context.runSpec, OUTPUT_INVALID_STATUS, observation, nowMs, detail);
    throw error;
  }
}

function handleTerminal(
  context: LifecycleContext,
  observation: AdapterRunObservation,
  nowMs: number,
): GatewayCompletionReceipt | undefined {
  if (observation.state === ADAPTER_RUN_STATE.RUNNING) return undefined;
  if (observation.state === ADAPTER_RUN_STATE.COMPLETED) return validateCompletion(context, observation, nowMs);
  finishRun(context.store, context.runSpec, observation.state, observation, nowMs);
  throw adapterFailure(observation.state);
}

async function enforceProgressTimeout(context: LifecycleContext, state: ObservationState, nowMs: number): Promise<void> {
  if (nowMs - state.lastProgressMs < context.runSpec.noProgressTimeoutMs) return;
  const stopped = await cancelAndAwait(context.adapter, context.request, context.runSpec, context.runtime);
  const detail = stopped.confirmed ? 'run cancelled after no observable progress' : 'run timed out and cancellation was not confirmed';
  finishRun(context.store, context.runSpec,
    stopped.confirmed ? GATEWAY_RUN_STATUS.TIMED_OUT : GATEWAY_RUN_STATUS.FAILED, stopped.observation,
    context.runtime.now(), detail, stopped.cancellation);
  throw new ContextError(
    stopped.confirmed ? GATEWAY_LIFECYCLE_ERROR.NO_PROGRESS_TIMEOUT : GATEWAY_LIFECYCLE_ERROR.CANCELLATION_UNCONFIRMED,
    detail,
  );
}

async function runObservationLoop(context: LifecycleContext, initialState: ObservationState): Promise<GatewayCompletionReceipt> {
  let state = initialState;
  for (;;) {
    const observation = await context.adapter.observeRun(context.request);
    assertObservation(context.adapter, context.request, observation);
    const nowMs = context.runtime.now();
    state = recordObservation(context.store, context.runSpec, observation, state, nowMs);
    await enforceToolPolicy(context, observation);
    const completion = handleTerminal(context, observation, nowMs);
    if (completion !== undefined) return completion;
    await enforceProgressTimeout(context, state, nowMs);
    await context.runtime.sleep(context.runSpec.executionProfile.observationIntervalMs);
  }
}

export async function observeTurnToCompletion(
  store: Store,
  runSpec: RunSpec,
  adapter: AgentAdapter,
  turn: AdapterTurnReceipt,
  turnSequence: number,
  intentId: string,
  directory: string,
  runtime: GatewayRuntime = SYSTEM_RUNTIME,
): Promise<GatewayCompletionReceipt> {
  const request: AdapterObservationRequest = {
    runSpec,
    intentId,
    operationKey: `${GATEWAY_OPERATION.OBSERVE_TURN}:${runSpec.id}:${turnSequence}`,
    directory,
    sessionId: turn.sessionId,
    messageId: turn.messageId,
  };
  const context: LifecycleContext = { store, runSpec, adapter, request, runtime };
  const initialState = beginOrResumeObservation(store, runSpec, turn, runtime.now());
  try {
    return await runObservationLoop(context, initialState);
  } catch (error: unknown) {
    failObservingRun(store, runSpec, error, runtime.now());
    throw error;
  }
}
