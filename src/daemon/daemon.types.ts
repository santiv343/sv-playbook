export interface DaemonInstance {
  port: number;
  token: string;
  stop(): void;
}

export interface DaemonExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  daemonVersion: string;
}
