import type { Store } from '../db/store.types.js';
import { ContextError } from '../context/context.errors.js';
import { resolvedArtifactSchema } from '../contracts/artifacts.js';
import type {
  AdapterProfileReceipt,
  AdapterSessionReceipt,
  AgentAdapter,
  GatewayCompletionReceipt,
  GatewayDispatchReceipt,
  GatewayRuntime,
  RunSpec,
} from './gateway.types.js';
import { ADAPTER_RUN_STATE } from './gateway.types.js';
import { renderRunPrompt } from './prompt.js';
import { GATEWAY_LIFECYCLE_ERROR, GATEWAY_OPERATION, GATEWAY_RUN_STATUS, GATEWAY_STATE_ERROR } from './gateway.constants.js';
import { observeTurnToCompletion } from './gateway-lifecycle.js';
import { loadRunSpec } from './run-spec.loader.js';
import {
  acceptSession,
  acceptTurn,
  blockIntent,
  commitIntent,
  isRunObserving,
  loadLatestTurn,
  loadRunSnapshot,
  loadSession,
  nextTurnSequence,
} from './gateway-repository.js';
import type { StoredTurn } from './gateway-repository.types.js';
import { requireActiveRoleCatalog } from '../roles/catalog-activation.js';
import { requireExecutionProfileModelEvidence } from '../roles/model-capability-evidence.js';

function assertAdapterReceipt(adapter: AgentAdapter, adapterId: string): void {
  if (adapterId !== adapter.id) throw new ContextError('ADAPTER_RECEIPT_MISMATCH', 'adapter receipt id mismatch');
}

// Idempotencia por identidad (dispatchRun/(runSpec.id)+adapter): si ya existe
// una sesión durable para este run+adapter, se reutiliza en vez de crear
// una nueva — volver a "preparar" el mismo run nunca duplica trabajo contra
// el adapter externo. Si el profileDigest cambió desde que se creó la
// sesión persistida, es una señal de que la config del rol cambió bajo los
// pies del run: se rechaza en vez de continuar con una sesión desalineada.
async function ensureSession(
  store: Store,
  runSpec: RunSpec,
  adapter: AgentAdapter,
  profile: AdapterProfileReceipt,
  directory: string,
): Promise<AdapterSessionReceipt> {
  const stored = loadSession(store, runSpec.id, adapter);
  if (stored !== undefined) {
    if (stored.profileDigest !== profile.profileDigest) {
      throw new ContextError('ADAPTER_PROFILE_CHANGED', 'durable session profile no longer matches verified profile');
    }
    return stored;
  }
  const intent = commitIntent(store, runSpec, GATEWAY_OPERATION.CREATE_SESSION);
  try {
    const receipt = await adapter.createSession({
      runSpec,
      intentId: intent.id,
      operationKey: intent.operationKey,
      directory,
    }, profile);
    assertAdapterReceipt(adapter, receipt.adapterId);
    if (receipt.profileDigest !== profile.profileDigest) {
      throw new ContextError('ADAPTER_RECEIPT_MISMATCH', 'session profile digest mismatch');
    }
    acceptSession(store, runSpec, intent.id, receipt);
    return receipt;
  } catch (error: unknown) {
    blockIntent(store, intent.id, error);
    throw error;
  }
}

async function ensureTurn(
  store: Store,
  runSpec: RunSpec,
  adapter: AgentAdapter,
  session: AdapterSessionReceipt,
  directory: string,
): Promise<StoredTurn> {
  const stored = loadLatestTurn(store, runSpec.id, adapter);
  if (stored !== undefined) {
    if (stored.receipt.sessionId !== session.sessionId) {
      throw new ContextError('ADAPTER_RECEIPT_MISMATCH', 'durable turn belongs to a different session');
    }
    return stored;
  }
  const sequence = nextTurnSequence(store, runSpec.id);
  const intent = commitIntent(store, runSpec, GATEWAY_OPERATION.SUBMIT_TURN, sequence);
  try {
    const receipt = await adapter.submitTurn({
      runSpec,
      intentId: intent.id,
      operationKey: intent.operationKey,
      directory,
      sessionId: session.sessionId,
      prompt: renderRunPrompt(store, runSpec),
      outputSchema: resolvedArtifactSchema(store, runSpec.outputContractRef),
    });
    assertAdapterReceipt(adapter, receipt.adapterId);
    if (receipt.sessionId !== session.sessionId) {
      throw new ContextError('ADAPTER_RECEIPT_MISMATCH', 'turn session id mismatch');
    }
    acceptTurn(store, runSpec, sequence, intent.id, receipt);
    return { sequence, intentId: intent.id, receipt };
  } catch (error: unknown) {
    blockIntent(store, intent.id, error);
    throw error;
  }
}

function durableCompletion(store: Store, runSpec: RunSpec, turn: StoredTurn): GatewayCompletionReceipt | undefined {
  const snapshot = loadRunSnapshot(store, runSpec.id);
  if (snapshot === undefined || snapshot.status === GATEWAY_RUN_STATUS.OBSERVING) return undefined;
  if (snapshot.status !== GATEWAY_RUN_STATUS.COMPLETED) {
    throw new ContextError(
      GATEWAY_LIFECYCLE_ERROR.TERMINAL_RUN,
      snapshot.detail ?? `gateway run is terminal: ${snapshot.status}`,
    );
  }
  if (snapshot.output === undefined || snapshot.outputDigest === null) {
    throw new ContextError(GATEWAY_STATE_ERROR.INVALID, 'completed gateway run has no durable output');
  }
  return {
    output: snapshot.output,
    outputDigest: snapshot.outputDigest,
    observation: {
      adapterId: turn.receipt.adapterId,
      sessionId: snapshot.sessionId,
      messageId: snapshot.messageId,
      state: ADAPTER_RUN_STATE.COMPLETED,
      progressToken: snapshot.progressToken,
      observedToolIds: snapshot.observedToolIds,
      output: JSON.stringify(snapshot.output),
      evidence: snapshot.evidence,
    },
  };
}

function terminalDispatchReceipt(
  store: Store,
  runSpec: RunSpec,
  adapter: AgentAdapter,
): GatewayDispatchReceipt {
  // A terminal run is decided from durable state alone: no profile verification,
  // no session resume, no turn submission — the adapter is never contacted.
  const session = loadSession(store, runSpec.id, adapter);
  const turn = loadLatestTurn(store, runSpec.id, adapter);
  if (session === undefined || turn === undefined) {
    throw new ContextError(GATEWAY_STATE_ERROR.INVALID, 'terminal gateway run is missing its durable session or turn');
  }
  const completion = durableCompletion(store, runSpec, turn);
  if (completion === undefined) {
    throw new ContextError(GATEWAY_STATE_ERROR.INVALID, 'terminal gateway run has no durable completion');
  }
  return { session, turn: turn.receipt, completion };
}

// Patrón "terminal-first" (ver glosario docs/codebase-guide/glossary.md):
// si el run ya tiene un snapshot durable que no está en OBSERVING, la
// decisión se toma enteramente desde ese estado persistido
// (terminalDispatchReceipt) — nunca se contacta al adapter de nuevo. Sólo
// cuando el run está genuinamente en curso se paga el costo de verificar
// perfil/sesión/turno y observar hasta que termine.
export async function dispatchRun(
  store: Store,
  runSpecId: string,
  adapters: ReadonlyMap<string, AgentAdapter>,
  directory: string,
  runtime?: GatewayRuntime,
): Promise<GatewayDispatchReceipt> {
  const runSpec = loadRunSpec(store, runSpecId);
  const snapshot = loadRunSnapshot(store, runSpec.id);
  if (snapshot !== undefined && !isRunObserving(snapshot)) {
    const adapter = adapters.get(runSpec.executionProfile.adapterId);
    if (adapter === undefined) {
      throw new ContextError(GATEWAY_STATE_ERROR.ADAPTER_UNAVAILABLE, `adapter is not registered: ${runSpec.executionProfile.adapterId}`);
    }
    return terminalDispatchReceipt(store, runSpec, adapter);
  }
  requireActiveRoleCatalog(store);
  requireExecutionProfileModelEvidence(store, runSpec.executionProfile);
  const adapter = adapters.get(runSpec.executionProfile.adapterId);
  if (adapter === undefined) {
    throw new ContextError(GATEWAY_STATE_ERROR.ADAPTER_UNAVAILABLE, `adapter is not registered: ${runSpec.executionProfile.adapterId}`);
  }
  const profile = await adapter.verifyProfile(runSpec, directory);
  assertAdapterReceipt(adapter, profile.adapterId);
  const session = await ensureSession(store, runSpec, adapter, profile, directory);
  const turn = await ensureTurn(store, runSpec, adapter, session, directory);
  const persisted = durableCompletion(store, runSpec, turn);
  const completion = persisted ?? await observeTurnToCompletion(
    store,
    runSpec,
    adapter,
    turn.receipt,
    turn.sequence,
    turn.intentId,
    directory,
    runtime,
  );
  return { session, turn: turn.receipt, completion };
}
