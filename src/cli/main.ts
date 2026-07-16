import { commonRoot } from '../db/store.js';
import { commands } from './registry.js';
import { EXIT } from './command.constants.js';
import { extractConfirmDestructive } from './command.js';
import { setContext, getCwd } from '../runtime/context.js';
import type { Command, Io } from './command.types.js';
import type { ExecutionContext } from '../runtime/context.types.js';
import { checkDestructiveGate, queryDestructiveCounts } from './destructive-gate.js';

const HELP_FLAG = { LONG: '--help', SHORT: '-h' } as const;

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
  const { args: runArgs, hasConfirm } = extractConfirmDestructive(args);
  const repoRoot = commonRoot(getCwd());
  const gateResult = checkDestructiveGate(io, command.name, repoRoot, hasConfirm, queryDestructiveCounts(repoRoot));
  if (gateResult !== undefined) return gateResult;
  return runArgs;
}

export async function main(argv: string[], io: Io = defaultIo, ctx?: ExecutionContext): Promise<number> {
  if (ctx !== undefined) {
    setContext(ctx);
  }

  const [name, ...args] = argv;
  if (name === undefined || name === HELP_FLAG.LONG || name === HELP_FLAG.SHORT) {
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
