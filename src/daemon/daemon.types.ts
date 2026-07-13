export type DaemonOutcome = { kind: 'stopped' } | { kind: 'failed'; error: Error };

export interface ControlCommandRequest {
  readonly argv: readonly string[];
  readonly cwd: string;
}

export interface ControlCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CommandExecutionPort {
  execute(req: ControlCommandRequest): Promise<ControlCommandResult>;
}

export interface HttpServerPort {
  listen(port: number, host: string): Promise<void>;
  close(): Promise<void>;
  onError(handler: (err: Error) => void): void;
}

export interface HttpServerFactoryPort {
  create(handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void): HttpServerPort;
}

export interface DaemonOptions {
  readonly workspaceIdentity: import('../runtime/workspace.types.js').WorkspacePort;
  readonly commandExecution: CommandExecutionPort;
  readonly httpServerFactory: HttpServerFactoryPort;
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
