export interface ExecutionContext {
  cwd: string;
  sessionId: string | null;
}

export interface CommandIo {
  out(line: string): void;
  err(line: string): void;
}

export interface CommandPort {
  execute(argv: string[], io: CommandIo): Promise<number>;
}

export interface SignalPort {
  subscribe(handler: (signal: string) => void): () => void;
}
