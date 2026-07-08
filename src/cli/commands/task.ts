import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { EXIT, type Command, type Io } from '../command.js';
import { commonRoot, openStore, type Store } from '../../db/store.js';
import { PacketFormatError, type PacketDefinition } from '../../packets/document.js';
import {
  createPacket,
  ensureSession,
  LifecycleError,
  listPackets,
  movePacket,
  startPacket,
  type PacketStatus,
} from '../../tasks/service.js';

const USAGE = [
  'Usage:',
  '  sv-playbook task create --id <ID> --title <T> [--write <glob>]... [--depends <ID>]... [--req <REQ>]... [--evidence <E>]... --body-file <path>',
  '  sv-playbook task list [--json]',
  '  sv-playbook task start <ID>',
  '  sv-playbook task move <ID> <status>',
].join('\n');

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
  return ['draft', 'ready', 'active', 'review', 'done', 'blocked', 'dropped'].includes(value);
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
  if (def.evidenceRequired.length === 0) def.evidenceRequired.push('final-sha');
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

export const taskCommand: Command = {
  name: 'task',
  summary: 'Create, list, start, and move execution packets',
  run(args, io) {
    try {
      const [sub, ...rest] = args;
      if (sub === 'create') return Promise.resolve(handleCreate(rest));
      if (sub === 'list') return Promise.resolve(handleList(rest, io));
      if (sub === 'start') return Promise.resolve(handleStart(rest));
      if (sub === 'move') return Promise.resolve(handleMove(rest));
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
