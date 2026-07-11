import { commonRoot } from '../db/store.js';
import { commands } from './registry.js';
import { EXIT } from './command.constants.js';
import type { Command, Io } from './command.types.js';
import { checkDestructiveGate, queryDestructiveCounts } from './destructive-gate.js';

const CONFIRM_FLAG = '--confirm-destructive';

const defaultIo: Io = {
  out: (l) => void process.stdout.write(`${l}\n`),
  err: (l) => void process.stderr.write(`${l}\n`),
};

function usage(io: Io): void {
  io.err('Usage: sv-playbook <command> [args]');
  io.err('');
  io.err('Commands:');
  for (const c of commands()) io.err(`  ${c.name.padEnd(12)} ${c.summary}`);
}

function gateCheckedArgs(command: Command, args: string[], io: Io): string[] | number {
  if (!command.destructive) return args;
  const hasConfirm = args.includes(CONFIRM_FLAG);
  const runArgs = hasConfirm ? args.filter((a) => a !== CONFIRM_FLAG) : args;
  const repoRoot = commonRoot(process.cwd());
  const gateResult = checkDestructiveGate(io, command.name, repoRoot, hasConfirm, queryDestructiveCounts(repoRoot));
  if (gateResult !== undefined) return gateResult;
  return runArgs;
}

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  const [name, ...args] = argv;
  if (name === undefined || name === '--help' || name === '-h') {
    usage(io);
    return EXIT.USAGE;
  }
  const command = commands().find((c) => c.name === name);
  if (command === undefined) {
    io.err(`Unknown command: ${name}`);
    usage(io);
    return EXIT.USAGE;
  }

  const gateResult = gateCheckedArgs(command, args, io);
  if (typeof gateResult === 'number') return gateResult;

  try {
    return await command.run(gateResult, io);
  } catch (error) {
    io.err(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.SYSTEM;
  }
}
