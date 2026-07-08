import { commands } from './registry.js';
import { EXIT, type Io } from './command.js';

const defaultIo: Io = {
  out: (l) => void process.stdout.write(`${l}\n`),
  err: (l) => void process.stderr.write(`${l}\n`),
};

function usage(io: Io): void {
  io.err('Usage: sv-playbook <command> [args]');
  io.err('');
  io.err('Commands:');
  for (const c of commands) io.err(`  ${c.name.padEnd(12)} ${c.summary}`);
}

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  const [name, ...args] = argv;
  if (name === undefined || name === '--help' || name === '-h') {
    usage(io);
    return EXIT.USAGE;
  }
  const command = commands.find((c) => c.name === name);
  if (command === undefined) {
    io.err(`Unknown command: ${name}`);
    usage(io);
    return EXIT.USAGE;
  }
  try {
    return await command.run(args, io);
  } catch (error) {
    io.err(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.SYSTEM;
  }
}
