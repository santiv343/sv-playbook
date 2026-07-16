import { unlinkSync } from 'node:fs';
import { setDaemonStore } from '../db/store.js';
import type { TerminationReceipt, TerminationState } from './daemon.types.js';

export function createTerminationState(lockPath: string, tokenPath: string): TerminationState {
  let drainResolve: (() => void) | null = null;
  const drainLatch = new Promise<void>((resolve) => { drainResolve = resolve; });
  let receiptResolve: (receipt: TerminationReceipt) => void = () => {};
  const receiptLatch = new Promise<TerminationReceipt>((resolve) => { receiptResolve = resolve; });
  return {
    stopping: false,
    drained: false,
    server: null,
    store: null,
    lockPath,
    tokenPath,
    unsubSignal: null,
    activeHandlers: new Set(),
    drainResolve,
    drainLatch,
    causalError: null,
    finalized: false,
    receipt: null,
    receiptResolve,
    receiptLatch,
  };
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

// Cleanup failures must never hang termination: every step still runs, the
// first failure is collected, and it surfaces on the receipt when no earlier
// causal failure exists.
function collectCleanupError(state: TerminationState): Error | undefined {
  let first: Error | undefined;
  const record = (step: () => void): void => {
    try { step(); } catch (error: unknown) { first = first ?? asError(error); }
  };
  const unsub = state.unsubSignal;
  state.unsubSignal = null;
  if (unsub !== null) record(() => { unsub(); });
  setDaemonStore(null);
  const store = state.store;
  state.store = null;
  if (store !== null) record(() => { store.close(); });
  record(() => { unlinkSync(state.lockPath); });
  record(() => { unlinkSync(state.tokenPath); });
  return first;
}

export function finalizeOnce(state: TerminationState, cause: string, causal?: Error): TerminationReceipt {
  if (state.finalized && state.receipt !== null) return state.receipt;
  if (state.finalized) return { cause, causal, clean: false };
  state.finalized = true;
  const cleanupError = collectCleanupError(state);
  const finalCausal = causal ?? state.causalError ?? cleanupError;
  state.receipt = { cause, causal: finalCausal, clean: finalCausal === undefined };
  state.receiptResolve(state.receipt);
  return state.receipt;
}

function resolveDrainIfReady(state: TerminationState): void {
  if (!state.stopping || state.activeHandlers.size !== 0 || state.drainResolve === null) return;
  state.drained = true;
  state.drainResolve();
}

export function trackHandler(state: TerminationState, handler: Promise<unknown>): void {
  state.activeHandlers.add(handler);
  void handler.finally(() => {
    state.activeHandlers.delete(handler);
    resolveDrainIfReady(state);
  }).catch(() => { /* handler owns its error mapping */ });
}

export function startDrain(state: TerminationState): void {
  state.stopping = true;
  resolveDrainIfReady(state);
}
