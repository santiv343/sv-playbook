export interface Io {
  out(line: string): void;
  err(line: string): void;
}

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
