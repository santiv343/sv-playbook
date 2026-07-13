export interface DaemonInstance {
  port: number;
  token: string;
  stop(): Promise<void>;
  state(): 'running' | 'stopping' | 'stopped';
  /** Resolves when the daemon fully terminates (after server close + cleanup). */
  readonly done: Promise<void>;
}

export interface DaemonExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  daemonVersion: string;
}
