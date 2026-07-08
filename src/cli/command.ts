export interface Io {
  out(line: string): void;
  err(line: string): void;
}
export interface Command {
  name: string;
  summary: string;           // one line, shown in usage and (later) describe --json
  run(args: string[], io: Io): Promise<number>;
}
export const EXIT: Readonly<{ OK: 0; GATE_FAIL: 1; USAGE: 2; SYSTEM: 3 }> = Object.freeze({
  OK: 0,
  GATE_FAIL: 1,
  USAGE: 2,
  SYSTEM: 3,
});
