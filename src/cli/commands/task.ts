import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { TEXT_ENCODING } from '../../platform.constants.js';
import { CLI_FORCE_FLAG, ERROR_PREFIX, EXIT, USAGE_HEADER } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { extractConfirmDestructive } from '../command.js';
import { commonRoot, worktreeRoot } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { createStateBackup, latestStateBackupAgeHours } from '../../db/backup.js';
import { BACKUP_EVENT, BACKUP_REASON } from '../../db/backup.constants.js';
import type { Store } from '../../db/store.types.js';
import type { BackupEvent, BackupReason } from '../../db/backup.types.js';
import { loadConfig } from '../../config.js';
import { PacketFormatError } from '../../packets/document.errors.js';
import type { PacketDefinition } from '../../packets/document.types.js';
import { numberColumn, stringColumn } from '../../db/rows.js';
import {
  createPacket,
  briefPacket,
  ensureSession,
  generateIdFromType,
  importPacketFile,
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
import { loadWorkDefinition } from '../../tasks/work-definitions.js';
import { movePacketToReview } from '../../tasks/review-transition.js';
import { DEFAULT_EVIDENCE, EVENT_NOTE, EVENT_TAKEOVER, PACKET_STATUSES, STATUS } from '../../tasks/service.constants.js';
import { LifecycleError } from '../../tasks/service.errors.js';
import type { PacketStatus, RecoveryReport } from '../../tasks/service.types.js';
import { checkDestructiveGate, queryDestructiveCounts } from '../destructive-gate.js';
import { withStore, withStoreAsync } from '../store.js';
import { STRING_OPTION } from './options.constants.js';

interface Subcommand {
  usage: string;
  run(rest: string[], io: Io): number | Promise<number>;
}

class UsageError extends Error {}

const STRING_LIST_OPTION = { type: STRING_OPTION.type, multiple: true } as const;
const BODY_FILE_OPTION = 'body-file';

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

function backupForEvent(repoRoot: string, event: BackupEvent, reason: BackupReason, allowFreshLeases?: boolean): void {
  const config = loadConfig(repoRoot);
  if (!config.backup.enabled) return;
  const age = latestStateBackupAgeHours(repoRoot);
  const ageDue = age === undefined || age >= config.backup.maxAgeHours;
  const eventDue = config.backup.onEvents.includes(event);
  if (!ageDue && !eventDue) return;
  const options = { reason, retention: config.backup.retention, ...(allowFreshLeases === undefined ? {} : { allowFreshLeases }) };
  createStateBackup(repoRoot, options);
}

function handleCreate(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    type: STRING_OPTION, id: STRING_OPTION, title: STRING_OPTION,
    write: STRING_LIST_OPTION, depends: STRING_LIST_OPTION,
    req: STRING_LIST_OPTION, evidence: STRING_LIST_OPTION,
    [BODY_FILE_OPTION]: STRING_OPTION,
  } });
  if (parsed.positionals.length !== 0) throw new UsageError('create takes no positional arguments');
  const writeSet = stringValues(parsed.values.write);
  if (writeSet.length === 0) throw new UsageError('missing --write');
  const title = stringValue(parsed.values.title, 'title');
  const body = readFileSync(stringValue(parsed.values[BODY_FILE_OPTION], BODY_FILE_OPTION), TEXT_ENCODING.UTF8);
  const dependsOn = stringValues(parsed.values.depends);
  const requirements = stringValues(parsed.values.req);
  const evidenceRequired = stringValues(parsed.values.evidence);
  if (evidenceRequired.length === 0) evidenceRequired.push(...DEFAULT_EVIDENCE);
  const docRoot = worktreeRoot(getCwd());
  const type = parsed.values.type; const explicitId = parsed.values.id;
  if (type !== undefined && explicitId !== undefined) throw new UsageError('--id is not allowed with --type; use --id only for import/rebuild paths');
  return withStore((store) => {
    const id = type !== undefined ? generateIdFromType(store, type) : stringValue(explicitId, 'id');
    const def: PacketDefinition = { id, title, dependsOn, writeSet, requirements, evidenceRequired };
    createPacket(store, docRoot, def, body, type);
    io.out(`created ${def.id} (draft)`);
    return EXIT.OK;
  });
}

function handleAmend(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    title: STRING_OPTION, write: STRING_LIST_OPTION,
    depends: STRING_LIST_OPTION, req: STRING_LIST_OPTION,
    evidence: STRING_LIST_OPTION, [BODY_FILE_OPTION]: STRING_OPTION,
  } });
  const [packetId] = parsed.positionals;
  if (packetId === undefined || parsed.positionals.length !== 1) throw new UsageError('amend requires <ID>');
  const updates: { title?: string; body?: string; writeSet?: string[]; dependsOn?: string[]; requirements?: string[]; evidenceRequired?: string[] } = {};
  if (parsed.values.write !== undefined) updates.writeSet = stringValues(parsed.values.write);
  if (parsed.values.title !== undefined) updates.title = parsed.values.title;
  if (parsed.values[BODY_FILE_OPTION] !== undefined) updates.body = readFileSync(stringValue(parsed.values[BODY_FILE_OPTION], BODY_FILE_OPTION), TEXT_ENCODING.UTF8);
  if (parsed.values.depends !== undefined) updates.dependsOn = stringValues(parsed.values.depends);
  if (parsed.values.req !== undefined) updates.requirements = stringValues(parsed.values.req);
  if (parsed.values.evidence !== undefined) updates.evidenceRequired = stringValues(parsed.values.evidence);
  if (Object.keys(updates).length === 0) throw new UsageError('amend requires at least one flag');
  return withStore((store) => {
    amendPacket(store, worktreeRoot(getCwd()), packetId, updates);
    io.out(`amended ${packetId}`);
    return EXIT.OK;
  });
}

function jsonListRows(store: Store): unknown {
  const rows = store.db.prepare('SELECT id, title, status, priority, type, write_set FROM packets ORDER BY priority, id').all();
  const depsByPacket = new Map<string, string[]>();
  for (const dr of store.db.prepare('SELECT packet_id, depends_on_id FROM packet_deps ORDER BY packet_id, depends_on_id').all()) {
    const pid = stringColumn(dr, 'packet_id');
    const arr = depsByPacket.get(pid);
    if (arr !== undefined) arr.push(stringColumn(dr, 'depends_on_id'));
    else depsByPacket.set(pid, [stringColumn(dr, 'depends_on_id')]);
  }
  return rows.map((row) => {
    const id = stringColumn(row, 'id');
    const ws: unknown = JSON.parse(stringColumn(row, 'write_set'));
    return {
      id, type: stringColumn(row, 'type'), title: stringColumn(row, 'title'),
      status: stringColumn(row, 'status'), priority: numberColumn(row, 'priority'),
      write_set: ws, depends_on: depsByPacket.get(id) ?? [],
    };
  });
}

function handleList(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: { json: { type: 'boolean' } } });
  if (parsed.positionals.length !== 0) throw new UsageError('list takes no positional arguments');
  return withStore((store) => {
    if (parsed.values.json === true) io.out(JSON.stringify(jsonListRows(store)));
    else for (const row of listPackets(store)) io.out(`${row.id}\t${row.status}\t${row.title}`);
    return EXIT.OK;
  });
}

function jsonShowPayload(store: Store, packetId: string, report: RecoveryReport): unknown {
  const row = store.db.prepare('SELECT title, type, priority, body, write_set FROM packets WHERE id = ?').get(packetId);
  if (row === undefined) return { packetId: report.packetId, status: report.status, lease: report.lease, depends_on: report.dependsOn, transitions: report.lastTransitions, notes: report.lastNotes };
  const workDef = loadWorkDefinition(store, packetId).value;
  const ws: unknown = JSON.parse(stringColumn(row, 'write_set'));
  return {
    packetId: report.packetId, status: report.status, lease: report.lease,
    depends_on: report.dependsOn, transitions: report.lastTransitions, notes: report.lastNotes,
    title: stringColumn(row, 'title'), type: stringColumn(row, 'type'), priority: numberColumn(row, 'priority'),
    write_set: ws, body: stringColumn(row, 'body'),
    requirements: workDef.requirements, evidence_required: workDef.evidenceRequired,
  };
}

function handleStart(args: string[], io: Io): number {
  const [packetId] = args;
  if (args.length !== 1 || packetId === undefined) throw new UsageError('start requires <ID>');
  return withStore((store) => {
    const sessionId = ensureSession(store, worktreeRoot(getCwd()));
    const existing = leaseOf(store, packetId);
    startPacket(store, sessionId, getCwd(), packetId);
    io.out(existing !== undefined && existing.sessionId === sessionId
      ? `started ${packetId}: already held by this session`
      : `started ${packetId}: ready -> active, lease acquired`);
    return EXIT.OK;
  });
}

async function handleMove(args: string[], io: Io): Promise<number> {
  const [packetId, status] = args;
  if (packetId === undefined || status === undefined || args.length !== 2) throw new UsageError('move requires <ID> <status>');
  if (!isPacketStatus(status)) throw new UsageError(`unknown status: ${status}`);
  if (status === STATUS.DONE) throw new UsageError('use `sv-playbook promotion run --candidate <ID> --review-run <RUN-ID>` to set a task as done');
  return withStoreAsync(async (store) => {
    const sessionId = ensureSession(store, worktreeRoot(getCwd()));
    if (status !== STATUS.REVIEW) {
      const from = movePacket(store, sessionId, packetId, status);
      io.out(`moved ${packetId}: ${from} -> ${status}`);
      return EXIT.OK;
    }
    const review = await movePacketToReview(store, sessionId, packetId);
    const integration = review.integration === undefined ? '' : ` (${review.integration})`;
    io.out(`moved ${packetId}: ${review.from} -> ${status}${integration}`);
    return EXIT.OK;
  });
}

function renderReport(report: RecoveryReport, io: Io): void {
  const lease = report.lease === undefined ? 'none'
    : `${report.lease.sessionId} ${report.lease.stale ? 'stale' : 'fresh'} ${report.lease.worktree}`;
  io.out(`id: ${report.packetId}`);
  io.out(`status: ${report.status}`);
  io.out(`lease: ${lease}`);
  io.out(`depends_on: ${report.dependsOn.length > 0 ? report.dependsOn.join(', ') : 'none'}`);
  io.out('transitions:');
  for (const t of report.lastTransitions) io.out(`  ${t}`);
  io.out('notes:');
  for (const n of report.lastNotes) io.out(`  ${n}`);
}

function handleShow(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: { json: { type: 'boolean' } } });
  const [packetId] = parsed.positionals;
  if (packetId === undefined || parsed.positionals.length !== 1) throw new UsageError('show requires <ID>');
  return withStore((store) => {
    const report = recoverPacket(store, packetId);
    if (parsed.values.json === true) io.out(JSON.stringify(jsonShowPayload(store, packetId, report)));
    else renderReport(report, io);
    return EXIT.OK;
  });
}

function handleTakeover(args: string[], io: Io): number {
  const { args: runArgs, hasConfirm } = extractConfirmDestructive(args);

  const hasForce = runArgs.includes(CLI_FORCE_FLAG);

  const parsed = parseArgs({ args: runArgs, allowPositionals: true, options: { force: { type: 'boolean' } } });
  const [packetId] = parsed.positionals;
  if (packetId === undefined || parsed.positionals.length !== 1) throw new UsageError('takeover requires <ID>');

  if (hasForce) {
    const repoRoot = commonRoot(getCwd());
    const gateResult = checkDestructiveGate(io, 'task takeover --force', repoRoot, hasConfirm, queryDestructiveCounts(repoRoot));
    if (gateResult !== undefined) return gateResult;
  }

  return withStore((store, repoRoot) => {
    const sessionId = ensureSession(store, worktreeRoot(getCwd()));
    const report = takeoverPacket(store, sessionId, getCwd(), packetId, parsed.values.force === true);
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
    releaseLease(store, ensureSession(store, worktreeRoot(getCwd())), packetId);
    io.out(`released ${packetId}`);
    io.out(`warning: ${packetId} stays active without a lease; the next owner must run task takeover ${packetId}`);
    return EXIT.OK;
  });
}

function handleNote(args: string[], io: Io): number {
  const [packetId, ...parts] = args;
  if (packetId === undefined || parts.length === 0) throw new UsageError('note requires <ID> <text...>');
  return withStore((store) => {
    notePacket(store, ensureSession(store, worktreeRoot(getCwd())), packetId, parts.join(' '));
    io.out(`noted ${packetId}`);
    return EXIT.OK;
  });
}

function handleBrief(args: string[], io: Io): number {
  const [packetId] = args;
  if (args.length !== 1 || packetId === undefined) throw new UsageError('brief requires <ID>');
  return withStore((store) => { io.out(briefPacket(store, packetId)); return EXIT.OK; });
}

function handleImport(args: string[], io: Io): number {
  const [pathOrId] = args;
  if (args.length !== 1 || pathOrId === undefined) throw new UsageError('import requires <path|ID>');
  return withStore((store) => {
    const docRoot = worktreeRoot(getCwd());
    const packetId = importPacketFile(store, docRoot, pathOrId);
    io.out(`imported ${packetId}`);
    return EXIT.OK;
  });
}

const SUBCOMMANDS: ReadonlyMap<string, Subcommand> = new Map([
  ['create', { usage: 'sv-playbook task create --type <TYPE> --title <T> [--write <glob>]... [--depends <ID>]... [--req <REQ>]... [--evidence <E>]... --body-file <path>', run: (rest, io) => handleCreate(rest, io) }],
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
  ['import', { usage: 'sv-playbook task import <path|ID>', run: (rest, io) => handleImport(rest, io) }],
]);

const USAGE = [USAGE_HEADER, ...Array.from(SUBCOMMANDS.values()).map((s) => `  ${s.usage}`)].join('\n');

function handleTaskError(error: unknown, io: Io): number {
  if (error instanceof LifecycleError || error instanceof PacketFormatError) {
    io.err(`${ERROR_PREFIX}${error.message}`);
    if (error instanceof LifecycleError && error.hint !== undefined) io.err(`hint: ${error.hint}`);
    return EXIT.GATE_FAIL;
  }
  if (error instanceof UsageError || error instanceof TypeError) {
    io.err(USAGE); io.err(`${ERROR_PREFIX}${error.message}`);
    return EXIT.USAGE;
  }
  throw error;
}

export const command: Command = {
  name: 'task',
  summary: 'Create, list, start, move, inspect, and recover execution packets',
  destructiveSubcommands: [EVENT_TAKEOVER],
  async run(args, io) {
    try {
      const [sub, ...rest] = args;
      const c = sub === undefined ? undefined : SUBCOMMANDS.get(sub);
      if (c !== undefined) return await c.run(rest, io);
      throw new UsageError(sub === undefined ? 'missing task subcommand' : `unknown task subcommand: ${sub}`);
    } catch (error) {
      return handleTaskError(error, io);
    }
  },
};
