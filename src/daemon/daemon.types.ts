export type DaemonOutcome = { kind: 'stopped' } | { kind: 'failed'; error: Error };

export interface DaemonExecIo {
  out(line: string): void;
  err(line: string): void;
  readonly outLines: string[];
  readonly errLines: string[];
}

export interface DaemonOptions {
  readonly workspaceIdentity: import('../runtime/workspace.types.js').WorkspacePort;
  executeCommand(argv: string[], io: DaemonExecIo): Promise<number>;
  onFinalize?: () => void;
}

export interface DaemonInstance {
  port: number;
  token: string;
  stop(): Promise<DaemonOutcome>;
  state(): 'running' | 'stopping' | 'stopped';
  /** Resolves when the daemon fully terminates (after server close + cleanup). */
  readonly done: Promise<DaemonOutcome>;
}

export interface DaemonExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  daemonVersion: string;
}
