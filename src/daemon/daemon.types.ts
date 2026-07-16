import type { CommandPort, SignalPort } from '../runtime/context.types.js';
import type { Server } from 'node:http';
import type { Store } from '../db/store.types.js';

export interface DaemonBackgroundWorker {
  start(): void;
  stop(): Promise<void>;
}

export interface TerminationReceipt {
  cause: string;
  causal: Error | undefined;
  clean: boolean;
}

export interface DaemonDeps {
  commandPort: CommandPort;
  signalPort: SignalPort;
  backgroundWorkerFactory?: (store: Store, repoRoot: string) => DaemonBackgroundWorker;
}

export interface DaemonInstance {
  port: number;
  token: string;
  store: Store;
  /** Resolves with the single terminal receipt once termination completes,
   *  regardless of how it was initiated (stop, shutdown route, signal, error). */
  done: Promise<TerminationReceipt>;
  stop(): Promise<TerminationReceipt>;
}

export interface DaemonExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  daemonVersion: string;
}

export interface TerminationState {
  stopping: boolean;
  drained: boolean;
  server: Server | null;
  store: Store | null;
  lockPath: string;
  tokenPath: string;
  unsubSignal: (() => void) | null;
  activeHandlers: Set<Promise<unknown>>;
  drainResolve: (() => void) | null;
  drainLatch: Promise<void>;
  causalError: Error | null;
  finalized: boolean;
  receipt: TerminationReceipt | null;
  receiptResolve: (receipt: TerminationReceipt) => void;
  receiptLatch: Promise<TerminationReceipt>;
}
