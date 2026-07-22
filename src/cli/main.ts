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

// Sólo corre para comandos que se marcaron `command.destructive`. Saca el
// flag de confirmación de los args que verá el comando (el comando en sí
// nunca necesita saber que pasó por este gate) y le pregunta a
// destructive-gate.ts si hay suficiente estado en riesgo como para exigir
// --confirm-destructive. Devolver un número acá significa "frená, ese es el
// exit code"; devolver el array significa "seguí a command.run() con estos
// args (ya sin el flag)".
function gateCheckedArgs(command: Command, args: string[], io: Io): string[] | number {
  if (!command.destructive) return args;
  const { args: runArgs, hasConfirm } = extractConfirmDestructive(args);
  const repoRoot = commonRoot(getCwd());
  const gateResult = checkDestructiveGate(io, command.name, repoRoot, hasConfirm, queryDestructiveCounts(repoRoot));
  if (gateResult !== undefined) return gateResult;
  return runArgs;
}

// El único despachador para los ~45 comandos (ver src/cli/registry.ts). Toda
// invocación del CLI —un humano tipeando en una terminal, otro proceso que lo
// lanza, o el daemon reenviando un request que se originó en otro cwd—
// termina acá.
export async function main(argv: string[], io: Io = defaultIo, ctx?: ExecutionContext): Promise<number> {
  // `ctx` sólo lo pasa el daemon: reenvía comandos que se originaron en un
  // cwd distinto al del propio proceso del daemon, así que getCwd()
  // (src/runtime/context.ts) necesita un override explícito en vez de
  // confiar en process.cwd(). AsyncLocalStorage mantiene ese override
  // acotado a esta llamada.
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

  // Boundary de último nivel: cualquier excepción que un comando no manejó
  // por su cuenta cae acá como EXIT.SYSTEM. Es deliberadamente genérico — la
  // clasificación fina del fallo (rechazo de gate vs. uso vs. fallo de
  // infraestructura) es responsabilidad de cada comando; este catch sólo
  // existe para que el proceso nunca crashee con un rejection sin manejar.
  // Auditado 2026-07-19 (docs/superpowers/plans/2026-07-19-error-boundary-audit.md):
  // los catches degradados que se encontraron estaban dentro de comandos
  // puntuales, no acá.
  try {
    return await command.run(gateResult, io);
  } catch (error) {
    io.err(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.SYSTEM;
  }
}
