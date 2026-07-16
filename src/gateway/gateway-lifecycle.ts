import type { Store } from '../db/store.types.js';
import { digest } from '../context/digest.js';
import { ContextError } from '../context/context.errors.js';
import { parseAgentJsonOutput } from '../contracts/structured-output.js';
import { validateArtifact } from '../contracts/artifacts.js';
import { hasReviewVerdictKind, parseReviewVerdict } from '../contracts/review-verdict.js';
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
  DEFAULT_MAX_RUN_DURATION_MS,
  GATEWAY_LIFECYCLE_ERROR,
  GATEWAY_OPERATION,
  GATEWAY_RUN_STATUS,
  type GatewayRunStatus,
} from './gateway.constants.js';
import { isRunObserving, loadRunSnapshot, loadTurnStartedMs } from './gateway-repository.js';
import {
  createObservingGatewayRun,
  failGatewayRun,
  finishGatewayRun,
  recordGatewayObservation,
} from './gateway-run-repository.js';

const SYSTEM_RUNTIME: GatewayRuntime = {
  now: () => Date.now(),
  sleep: (delayMs) => new Promise((resolve) => { setTimeout(resolve, delayMs); }),
};
const MISSING_OUTPUT_DETAIL = 'completed run has no output';
const CANDIDATE_COMPLETION_DETAIL = 'completed from in-flight candidate output; provider session still busy';
const OUTPUT_INVALID_STATUS: TerminalStatus = GATEWAY_RUN_STATUS.OUTPUT_INVALID;

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
  turnStartedMs: number;
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
  createObservingGatewayRun(store, {
    runSpecId: runSpec.id,
    sessionId: turn.sessionId,
    messageId: turn.messageId,
  }, progressToken, at);
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
  recordGatewayObservation(store, {
    runSpecId: runSpec.id,
    sessionId: observation.sessionId,
    messageId: observation.messageId,
    progressToken: observation.progressToken,
    observedToolIds: toolIds,
    observedAt: at,
    lastProgressAt: iso(next.lastProgressMs),
    evidence: observation.evidence,
    progressChanged: changed,
  });
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
  const toolIds = sortedToolIds(observation);
  finishGatewayRun(store, {
    runSpecId: runSpec.id,
    sessionId: observation.sessionId,
    messageId: observation.messageId,
    status,
    progressToken: observation.progressToken,
    observedToolIds: toolIds,
    observedAt: at,
    lastProgressAt: at,
    evidence: observation.evidence,
    progressChanged: false,
    ...(detail === undefined ? {} : { detail }),
    ...(cancellation === undefined ? {} : { cancellationEvidence: cancellation.evidence }),
    ...(output === undefined ? {} : { output }),
  });
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

function adapterFailureDetail(observation: AdapterRunObservation): string {
  return observation.failure === undefined
    ? `adapter reported terminal state: ${observation.state}`
    : `${observation.failure.code}: ${observation.failure.message}`;
}

function adapterFailure(observation: AdapterRunObservation): ContextError {
  return new ContextError(GATEWAY_LIFECYCLE_ERROR.AGENT_RUN_FAILED, adapterFailureDetail(observation));
}

function failObservingRun(store: Store, runSpec: RunSpec, error: unknown, nowMs: number): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  failGatewayRun(store, { runSpecId: runSpec.id, failedAt: iso(nowMs), detail });
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
    // Fail fast on the strict envelope kinds before the generic contract check:
    // a malformed review verdict must fail the run here, not at promotion time.
    if (hasReviewVerdictKind(parsed.value)) parseReviewVerdict(parsed.value);
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

function tryParseContractOutput(context: LifecycleContext, candidateOutput: string): unknown {
  try {
    const parsed = parseAgentJsonOutput(candidateOutput);
    // The same strict envelope kinds as terminal completion: a malformed review
    // verdict candidate is not a completion, it just keeps the run observing.
    if (hasReviewVerdictKind(parsed.value)) parseReviewVerdict(parsed.value);
    validateArtifact(context.store, context.runSpec.outputContractRef, parsed.value);
    return parsed.value;
  } catch {
    return undefined;
  }
}

async function completeFromCandidate(
  context: LifecycleContext,
  observation: AdapterRunObservation,
  nowMs: number,
): Promise<GatewayCompletionReceipt | undefined> {
  if (observation.state !== ADAPTER_RUN_STATE.RUNNING || observation.candidateOutput === undefined) return undefined;
  const output = tryParseContractOutput(context, observation.candidateOutput);
  if (output === undefined) return undefined;
  finishRun(context.store, context.runSpec, GATEWAY_RUN_STATUS.COMPLETED, observation, nowMs,
    CANDIDATE_COMPLETION_DETAIL, undefined, output);
  try {
    await context.adapter.cancelRun(context.request);
  } catch {
    // Best-effort provider hygiene: the durable completion is already committed.
  }
  return { output, outputDigest: digest(output), observation };
}

function handleTerminal(
  context: LifecycleContext,
  observation: AdapterRunObservation,
  nowMs: number,
): GatewayCompletionReceipt | undefined {
  if (observation.state === ADAPTER_RUN_STATE.RUNNING) return undefined;
  if (observation.state === ADAPTER_RUN_STATE.COMPLETED) return validateCompletion(context, observation, nowMs);
  const gatewayStatus = observation.state === ADAPTER_RUN_STATE.UNKNOWN
    ? GATEWAY_RUN_STATUS.FAILED
    : observation.state;
  const detail = adapterFailureDetail(observation);
  finishRun(context.store, context.runSpec, gatewayStatus, observation, nowMs, detail);
  throw adapterFailure(observation);
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

async function enforceRunDurationCeiling(context: LifecycleContext, nowMs: number): Promise<void> {
  const ceilingMs = context.runSpec.maxRunDurationMs ?? DEFAULT_MAX_RUN_DURATION_MS;
  if (nowMs - context.turnStartedMs < ceilingMs) return;
  const stopped = await cancelAndAwait(context.adapter, context.request, context.runSpec, context.runtime);
  const detail = stopped.confirmed
    ? 'run cancelled after exceeding max run duration'
    : 'run exceeded max run duration and cancellation was not confirmed';
  finishRun(context.store, context.runSpec,
    stopped.confirmed ? GATEWAY_RUN_STATUS.TIMED_OUT : GATEWAY_RUN_STATUS.FAILED, stopped.observation,
    context.runtime.now(), detail, stopped.cancellation);
  throw new ContextError(
    stopped.confirmed ? GATEWAY_LIFECYCLE_ERROR.RUN_DURATION_EXCEEDED : GATEWAY_LIFECYCLE_ERROR.CANCELLATION_UNCONFIRMED,
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
    const candidateCompletion = await completeFromCandidate(context, observation, nowMs);
    if (candidateCompletion !== undefined) return candidateCompletion;
    await enforceProgressTimeout(context, state, nowMs);
    await enforceRunDurationCeiling(context, nowMs);
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
  // The durable turn row anchors the run-duration ceiling so it survives
  // resumes; the runtime clock is only a fallback for a turn never persisted.
  const turnStartedMs = loadTurnStartedMs(store, runSpec.id, turnSequence) ?? runtime.now();
  const context: LifecycleContext = { store, runSpec, adapter, request, runtime, turnStartedMs };
  const initialState = beginOrResumeObservation(store, runSpec, turn, runtime.now());
  try {
    return await runObservationLoop(context, initialState);
  } catch (error: unknown) {
    failObservingRun(store, runSpec, error, runtime.now());
    throw error;
  }
}
