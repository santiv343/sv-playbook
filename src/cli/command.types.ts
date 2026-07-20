export interface Io {
  out(line: string): void;
  err(line: string): void;
}

// El contrato que TODO comando registrado implementa — destructive/
// destructiveSubcommands es lo que engancha destructive-gate.ts sin que
// cada comando individual tenga que implementar su propio chequeo de
// confirmación.
export interface Command {
  name: string;
  summary: string;
  usage: string;
  destructive?: boolean;
  destructiveSubcommands?: readonly string[];
  run(args: string[], io: Io): Promise<number>;
}

export interface DestructiveCounts {
  done: number;
  events: number;
}
