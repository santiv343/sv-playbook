import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { EXIT, type Command, type Io } from '../command.js';
import { commonRoot, openStore, type Store } from '../../db/store.js';
import { PacketFormatError, type PacketDefinition } from '../../packets/document.js';
import {
  createPacket,
  briefPacket,
  ensureSession,
  LifecycleError,
  listPackets,
  movePacket,
  notePacket,
  DEFAULT_EVIDENCE,
  PACKET_STATUSES,
  recoverPacket,
  startPacket,
  takeoverPacket,
  type PacketStatus,
  type RecoveryReport,
} from '../../tasks/service.js';

interface Subcommand {
  usage: string;
  run(rest: string[], io: Io): number;
}

class UsageError extends Error {}

function stringValue(value: string | boolean | string[] | undefined, name: string): string {
  if (typeof value !== 'string' || value === '') throw new UsageError(`missing --${name}`);
  return value;
}

function stringValues(value: string | boolean | string[] | undefined): string[] {
  if (value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  throw new UsageError('expected string value');
}

function isPacketStatus(value: string): value is PacketStatus {
  return PACKET_STATUSES.some((status) => status === value);
}

function withStore<T>(fn: (store: Store, repoRoot: string) => T): T {
  const repoRoot = commonRoot(process.cwd());
  const store = openStore(repoRoot);
  try {
    return fn(store, repoRoot);
  } finally {
    store.close();
  }
}

function handleCreate(args: string[]): number {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      id: { type: 'string' },
      title: { type: 'string' },
      write: { type: 'string', multiple: true },
      depends: { type: 'string', multiple: true },
      req: { type: 'string', multiple: true },
      evidence: { type: 'string', multiple: true },
      'body-file': { type: 'string' },
    },
  });
  if (parsed.positionals.length !== 0) throw new UsageError('create takes no positional arguments');
  const writeSet = stringValues(parsed.values.write);
  if (writeSet.length === 0) throw new UsageError('missing --write');
  const def: PacketDefinition = {
    id: stringValue(parsed.values.id, 'id'),
    title: stringValue(parsed.values.title, 'title'),
    dependsOn: stringValues(parsed.values.depends),
    writeSet,
    requirements: stringValues(parsed.values.req),
    evidenceRequired: stringValues(parsed.values.evidence),
  };
  if (def.evidenceRequired.length === 0) def.evidenceRequired.push(...DEFAULT_EVIDENCE);
  const body = readFileSync(stringValue(parsed.values['body-file'], 'body-file'), 'utf8');
  return withStore((store, repoRoot) => {
    createPacket(store, repoRoot, def, body);
    return EXIT.OK;
  });
}

function handleList(args: string[], io: Io): number {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: { json: { type: 'boolean' } },
  });
  if (parsed.positionals.length !== 0) throw new UsageError('list takes no positional arguments');
  return withStore((store) => {
    const rows = listPackets(store);
    if (parsed.values.json === true) io.out(JSON.stringify(rows));
    else for (const row of rows) io.out(`${row.id}\t${row.status}\t${row.title}`);
    return EXIT.OK;
  });
}

function handleStart(args: string[]): number {
  const [packetId] = args;
  if (args.length !== 1 || packetId === undefined) throw new UsageError('start requires <ID>');
  return withStore((store) => {
    const worktree = process.cwd();
    const sessionId = ensureSession(store, worktree);
    startPacket(store, sessionId, worktree, packetId);
    return EXIT.OK;
  });
}

function handleMove(args: string[]): number {
  const [packetId, status] = args;
  if (packetId === undefined || status === undefined || args.length !== 2) throw new UsageError('move requires <ID> <status>');
  if (!isPacketStatus(status)) throw new UsageError(`unknown status: ${status}`);
  return withStore((store) => {
    const sessionId = ensureSession(store, process.cwd());
    movePacket(store, sessionId, packetId, status);
    return EXIT.OK;
  });
}

function renderReport(report: RecoveryReport, io: Io): void {
  const lease = report.lease === undefined
    ? 'none'
    : `${report.lease.sessionId} ${report.lease.stale ? 'stale' : 'fresh'} ${report.lease.worktree}`;
  io.out(`id: ${report.packetId}`);
  io.out(`status: ${report.status}`);
  io.out(`lease: ${lease}`);
  io.out('transitions:');
  for (const transition of report.lastTransitions) io.out(`  ${transition}`);
  io.out('notes:');
  for (const note of report.lastNotes) io.out(`  ${note}`);
}

function handleShow(args: string[], io: Io): number {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: { json: { type: 'boolean' } },
  });
  const [packetId] = parsed.positionals;
  if (packetId === undefined || parsed.positionals.length !== 1) throw new UsageError('show requires <ID>');
  return withStore((store) => {
    const report = recoverPacket(store, packetId);
    if (parsed.values.json === true) io.out(JSON.stringify(report));
    else renderReport(report, io);
    return EXIT.OK;
  });
}

function handleTakeover(args: string[], io: Io): number {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: { force: { type: 'boolean' } },
  });
  const [packetId] = parsed.positionals;
  if (packetId === undefined || parsed.positionals.length !== 1) throw new UsageError('takeover requires <ID>');
  return withStore((store) => {
    const worktree = process.cwd();
    const sessionId = ensureSession(store, worktree);
    const report = takeoverPacket(store, sessionId, worktree, packetId, parsed.values.force === true);
    renderReport(report, io);
    return EXIT.OK;
  });
}

function handleNote(args: string[]): number {
  const [packetId, ...parts] = args;
  if (packetId === undefined || parts.length === 0) throw new UsageError('note requires <ID> <text...>');
  return withStore((store) => {
    const sessionId = ensureSession(store, process.cwd());
    notePacket(store, sessionId, packetId, parts.join(' '));
    return EXIT.OK;
  });
}

function handleBrief(args: string[], io: Io): number {
  const [packetId] = args;
  if (args.length !== 1 || packetId === undefined) throw new UsageError('brief requires <ID>');
  return withStore((store, repoRoot) => {
    io.out(briefPacket(store, repoRoot, packetId));
    return EXIT.OK;
  });
}

const SUBCOMMANDS: ReadonlyMap<string, Subcommand> = new Map([
  ['create', {
    usage: 'sv-playbook task create --id <ID> --title <T> [--write <glob>]... [--depends <ID>]... [--req <REQ>]... [--evidence <E>]... --body-file <path>',
    run: (rest) => handleCreate(rest),
  }],
  ['list', {
    usage: 'sv-playbook task list [--json]',
    run: handleList,
  }],
  ['start', {
    usage: 'sv-playbook task start <ID>',
    run: (rest) => handleStart(rest),
  }],
  ['move', {
    usage: 'sv-playbook task move <ID> <status>',
    run: (rest) => handleMove(rest),
  }],
  ['show', {
    usage: 'sv-playbook task show <ID> [--json]',
    run: handleShow,
  }],
  ['recover', {
    usage: 'sv-playbook task recover <ID> [--json]',
    run: handleShow,
  }],
  ['takeover', {
    usage: 'sv-playbook task takeover <ID> [--force]',
    run: handleTakeover,
  }],
  ['note', {
    usage: 'sv-playbook task note <ID> <text...>',
    run: (rest) => handleNote(rest),
  }],
  ['brief', {
    usage: 'sv-playbook task brief <ID>',
    run: handleBrief,
  }],
]);

const USAGE = [
  'Usage:',
  ...Array.from(SUBCOMMANDS.values()).map((subcommand) => `  ${subcommand.usage}`),
].join('\n');

export const taskCommand: Command = {
  name: 'task',
  summary: 'Create, list, start, move, inspect, and recover execution packets',
  run(args, io) {
    try {
      const [sub, ...rest] = args;
      const command = sub === undefined ? undefined : SUBCOMMANDS.get(sub);
      if (command !== undefined) return Promise.resolve(command.run(rest, io));
      throw new UsageError(sub === undefined ? 'missing task subcommand' : `unknown task subcommand: ${sub}`);
    } catch (error) {
      if (error instanceof LifecycleError || error instanceof PacketFormatError) {
        io.err(`error: ${error.message}`);
        if (error instanceof LifecycleError && error.hint !== undefined) io.err(`hint: ${error.hint}`);
        return Promise.resolve(EXIT.GATE_FAIL);
      }
      if (error instanceof UsageError || error instanceof TypeError) {
        io.err(USAGE);
        io.err(`error: ${error.message}`);
        return Promise.resolve(EXIT.USAGE);
      }
      throw error;
    }
  },
};
