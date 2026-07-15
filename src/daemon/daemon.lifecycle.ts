import { unlinkSync } from 'node:fs';
import { setDaemonStore } from '../db/store.js';
import type { TerminationReceipt, TerminationState } from './daemon.types.js';

export function createTerminationState(lockPath: string, tokenPath: string): TerminationState {
  let drainResolve: (() => void) | null = null;
  const drainLatch = new Promise<void>((resolve) => { drainResolve = resolve; });
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
  };
}

function unsubscribe(state: TerminationState): void {
  if (state.unsubSignal === null) return;
  try { state.unsubSignal(); } catch { /* cleanup continues */ }
  state.unsubSignal = null;
}

function closeStore(state: TerminationState): void {
  setDaemonStore(null);
  if (state.store === null) return;
  try { state.store.close(); } catch { /* cleanup continues */ }
  state.store = null;
}

function removeRuntimeFiles(state: TerminationState): void {
  try { unlinkSync(state.lockPath); } catch { /* cleanup continues */ }
  try { unlinkSync(state.tokenPath); } catch { /* cleanup continues */ }
}

export function finalizeOnce(state: TerminationState, cause: string, causal?: Error): TerminationReceipt {
  if (state.finalized && state.receipt !== null) return state.receipt;
  if (state.finalized) return { cause, causal, clean: false };
  state.finalized = true;
  unsubscribe(state);
  closeStore(state);
  removeRuntimeFiles(state);
  const finalCausal = causal ?? state.causalError ?? undefined;
  state.receipt = { cause, causal: finalCausal, clean: finalCausal === undefined };
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
