import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStore, worktreeRoot } from '../../db/store.js';
import { createStateBackup, latestStateBackupAgeHours } from '../../db/backup.js';
import { BACKUP_EVENT, BACKUP_REASON } from '../../db/backup.constants.js';
import type { Store } from '../../db/store.types.js';
import type { BackupEvent, BackupReason } from '../../db/backup.types.js';
import { loadConfig } from '../../config.js';
import { PacketFormatError } from '../../packets/document.errors.js';
import type { PacketDefinition } from '../../packets/document.types.js';
import {
  createPacket,
  briefPacket,
  ensureSession,
  leaseOf,
  listPackets,
  movePacket,
  notePacket,
  recoverPacket,
  releaseLease,
  startPacket,
  takeoverPacket,
  amendPacket,
} from '../../tasks/service.js';
import { DEFAULT_EVIDENCE, EVENT_NOTE, EVENT_TAKEOVER, PACKET_STATUSES, STATUS } from '../../tasks/service.constants.js';
import { LifecycleError } from '../../tasks/service.errors.js';
import type { PacketStatus, RecoveryReport } from '../../tasks/service.types.js';

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

function backupForEvent(repoRoot: string, event: BackupEvent, reason: BackupReason, allowFreshLeases?: boolean): void {
  const config = loadConfig(repoRoot);
  if (!config.backup.enabled) return;
  const age = latestStateBackupAgeHours(repoRoot);
  const ageDue = age === undefined || age >= config.backup.maxAgeHours;
  const eventDue = config.backup.onEvents.includes(event);
  if (!ageDue && !eventDue) return;
  const options = {
    reason,
    retention: config.backup.retention,
    ...(allowFreshLeases === undefined ? {} : { allowFreshLeases }),
  };
  createStateBackup(repoRoot, options);
}

function handleCreate(args: string[], io: Io): number {
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
  const docRoot = worktreeRoot(process.cwd());
  return withStore((store) => {
    createPacket(store, docRoot, def, body);
    io.out(`created ${def.id} (draft)`);
    return EXIT.OK;
  });
}

function handleAmend(args: string[], io: Io): number {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      title: { type: 'string' },
      write: { type: 'string', multiple: true },
      depends: { type: 'string', multiple: true },
      req: { type: 'string', multiple: true },
      evidence: { type: 'string', multiple: true },
      'body-file': { type: 'string' },
    },
  });
  const [packetId] = parsed.positionals;
  if (packetId === undefined || parsed.positionals.length !== 1) throw new UsageError('amend requires <ID>');
  const updates: { title?: string; body?: string; writeSet?: string[]; dependsOn?: string[]; requirements?: string[]; evidenceRequired?: string[]; } = {};
  if (parsed.values.write !== undefined) updates.writeSet = stringValues(parsed.values.write);
  if (parsed.values.title !== undefined) updates.title = parsed.values.title;
  if (parsed.values['body-file'] !== undefined) updates.body = readFileSync(stringValue(parsed.values['body-file'], 'body-file'), 'utf8');
  if (parsed.values.depends !== undefined) updates.dependsOn = stringValues(parsed.values.depends);
  if (parsed.values.req !== undefined) updates.requirements = stringValues(parsed.values.req);
  if (parsed.values.evidence !== undefined) updates.evidenceRequired = stringValues(parsed.values.evidence);
  if (Object.keys(updates).length === 0) throw new UsageError('amend requires at least one flag');
  const docRoot = worktreeRoot(process.cwd());
  return withStore((store) => {
    amendPacket(store, docRoot, packetId, updates);
    io.out(`amended ${packetId}`);
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

function handleStart(args: string[], io: Io): number {
  const [packetId] = args;
  if (args.length !== 1 || packetId === undefined) throw new UsageError('start requires <ID>');
  return withStore((store) => {
    const worktree = process.cwd();
    const sessionId = ensureSession(store, worktree);
    const existing = leaseOf(store, packetId);
    startPacket(store, sessionId, worktree, packetId);
    if (existing !== undefined && existing.sessionId === sessionId) {
      io.out(`started ${packetId}: already held by this session`);
    } else {
      io.out(`started ${packetId}: ready -> active, lease acquired`);
    }
    return EXIT.OK;
  });
}

function handleMove(args: string[], io: Io): number {
  const [packetId, status] = args;
  if (packetId === undefined || status === undefined || args.length !== 2) throw new UsageError('move requires <ID> <status>');
  if (!isPacketStatus(status)) throw new UsageError(`unknown status: ${status}`);
  return withStore((store, repoRoot) => {
    const sessionId = ensureSession(store, process.cwd());
    const from = movePacket(store, sessionId, packetId, status);
    if (status === STATUS.DONE) backupForEvent(repoRoot, BACKUP_EVENT.DONE, BACKUP_REASON.AUTO_DONE);
    io.out(`moved ${packetId}: ${from} -> ${status}`);
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
  io.out(`depends_on: ${report.dependsOn.length > 0 ? report.dependsOn.join(', ') : 'none'}`);
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
  return withStore((store, repoRoot) => {
    const worktree = process.cwd();
    const sessionId = ensureSession(store, worktree);
    const report = takeoverPacket(store, sessionId, worktree, packetId, parsed.values.force === true);
    if (parsed.values.force === true) backupForEvent(repoRoot, BACKUP_EVENT.FORCE_TAKEOVER, BACKUP_REASON.FORCE_TAKEOVER, true);
    io.out(`takeover ${packetId}: lease transferred`);
    renderReport(report, io);
    return EXIT.OK;
  });
}

function handleRelease(args: string[], io: Io): number {
  const [packetId] = args;
  if (args.length !== 1 || packetId === undefined) throw new UsageError('release requires <ID>');
  return withStore((store) => {
    const sessionId = ensureSession(store, process.cwd());
    releaseLease(store, sessionId, packetId);
    io.out(`released ${packetId}`);
    return EXIT.OK;
  });
}

function handleNote(args: string[], io: Io): number {
  const [packetId, ...parts] = args;
  if (packetId === undefined || parts.length === 0) throw new UsageError('note requires <ID> <text...>');
  return withStore((store) => {
    const sessionId = ensureSession(store, process.cwd());
    notePacket(store, sessionId, packetId, parts.join(' '));
    io.out(`noted ${packetId}`);
    return EXIT.OK;
  });
}

function checkGhAvailable(): void {
  try { execFileSync('gh', ['--version'], { encoding: 'utf8' }); } catch {
    throw new LifecycleError('gh CLI not found — close requires the GitHub CLI to verify PR merge status');
  }
}

function fetchPrState(pr: string): string {
  const raw: unknown = JSON.parse(execFileSync('gh', ['pr', 'view', pr, '--json', 'state'], { encoding: 'utf8' }).trim());
  if (raw !== null && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'state' && typeof value === 'string') return value;
    }
  }
  return '';
}

function prStateOrThrow(pr: string): string {
  try {
    checkGhAvailable();
    return fetchPrState(pr);
  } catch (error) {
    const msg = error instanceof Error ? error.message.split('\n')[0] ?? error.message : String(error);
    throw new LifecycleError(`failed to query PR #${pr}: ${msg}`);
  }
}

function handleClose(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: { pr: { type: 'string' } } });
  const [packetId] = parsed.positionals;
  if (packetId === undefined || parsed.positionals.length !== 1) throw new UsageError('close requires <ID> --pr <n>');
  const pr = stringValue(parsed.values.pr, 'pr');
  const prState = prStateOrThrow(pr);

  if (prState !== 'MERGED') {
    throw new LifecycleError(`PR #${pr} is not merged (state: ${prState || 'unknown'}) — close requires a merged PR`);
  }

  return withStore((store, repoRoot) => {
    const sessionId = ensureSession(store, process.cwd());
    store.db.prepare('UPDATE packets SET pr = ? WHERE id = ?').run(pr, packetId);
    const from = movePacket(store, sessionId, packetId, STATUS.DONE);
    backupForEvent(repoRoot, BACKUP_EVENT.DONE, BACKUP_REASON.AUTO_DONE);
    io.out(`closed ${packetId}: ${from} -> done (PR #${pr} verified merged)`);
    return EXIT.OK;
  });
}

function handleBrief(args: string[], io: Io): number {
  const [packetId] = args;
  if (args.length !== 1 || packetId === undefined) throw new UsageError('brief requires <ID>');
  return withStore((store) => {
    io.out(briefPacket(store, packetId));
    return EXIT.OK;
  });
}

const SUBCOMMANDS: ReadonlyMap<string, Subcommand> = new Map([
  ['create', { usage: 'sv-playbook task create --id <ID> --title <T> [--write <glob>]... [--depends <ID>]... [--req <REQ>]... [--evidence <E>]... --body-file <path>', run: (rest, io) => handleCreate(rest, io) }],
  ['amend', { usage: 'sv-playbook task amend <ID> [--title <T>] [--write <glob>]... [--body-file <path>] [--depends <ID>]... [--req <REQ>]... [--evidence <E>]...', run: (rest, io) => handleAmend(rest, io) }],
  ['list', { usage: 'sv-playbook task list [--json]', run: handleList }],
  ['start', { usage: 'sv-playbook task start <ID>', run: (rest, io) => handleStart(rest, io) }],
  ['move', { usage: 'sv-playbook task move <ID> <status>', run: (rest, io) => handleMove(rest, io) }],
  ['show', { usage: 'sv-playbook task show <ID> [--json]', run: handleShow }],
  ['recover', { usage: 'sv-playbook task recover <ID> [--json]', run: handleShow }],
  [EVENT_TAKEOVER, { usage: 'sv-playbook task takeover <ID> [--force]', run: handleTakeover }],
  ['release', { usage: 'sv-playbook task release <ID>', run: (rest, io) => handleRelease(rest, io) }],
  [EVENT_NOTE, { usage: 'sv-playbook task note <ID> <text...>', run: (rest, io) => handleNote(rest, io) }],
  ['brief', { usage: 'sv-playbook task brief <ID>', run: handleBrief }],
  ['close', { usage: 'sv-playbook task close <ID> --pr <n>', run: (rest, io) => handleClose(rest, io) }],
]);

const USAGE = [
  'Usage:',
  ...Array.from(SUBCOMMANDS.values()).map((subcommand) => `  ${subcommand.usage}`),
].join('\n');

function handleTaskError(error: unknown, io: Io): number {
  if (error instanceof LifecycleError || error instanceof PacketFormatError) {
    io.err(`error: ${error.message}`);
    if (error instanceof LifecycleError && error.hint !== undefined) io.err(`hint: ${error.hint}`);
    return EXIT.GATE_FAIL;
  }
  if (error instanceof UsageError || error instanceof TypeError) {
    io.err(USAGE);
    io.err(`error: ${error.message}`);
    return EXIT.USAGE;
  }
  throw error;
}

export function taskCommand(): Command {
  return {
    name: 'task',
    summary: 'Create, list, start, move, inspect, and recover execution packets',
    run(args, io) {
    try {
      const [sub, ...rest] = args;
      const command = sub === undefined ? undefined : SUBCOMMANDS.get(sub);
      if (command !== undefined) return Promise.resolve(command.run(rest, io));
      throw new UsageError(sub === undefined ? 'missing task subcommand' : `unknown task subcommand: ${sub}`);
    } catch (error) {
      return Promise.resolve(handleTaskError(error, io));
    }
    },
  };
}
