// ExecutionContext (cwd + sessionId, ver AsyncLocalStorage en runtime/context.ts)
// es lo que viaja entre un comando ejecutado localmente y uno reenviado al
// daemon (daemon/client.ts parseExecContext) — necesario porque el daemon
// corre en un proceso separado y no tiene su propio cwd/sessión real,
// depende de que el cliente se lo mande. CommandPort/SignalPort son los
// puertos que desacoplan al daemon del entorno real de proceso — ver
// daemon.production.ts (implementación real) vs los fakes de test.
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
