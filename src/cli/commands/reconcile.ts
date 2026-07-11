import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { ensureSession, movePacket } from '../../tasks/service.js';
import { EVENT_NOTE, STATUS } from '../../tasks/service.constants.js';
import { createStateBackup } from '../../db/backup.js';
import { BACKUP_REASON } from '../../db/backup.constants.js';
import { reconcile } from '../../reconcile/reconcile.js';
import type { GhReader, PrInfo, ReconcilerExecutor, ReconcilerEvent, ReconcilerResult } from '../../reconcile/reconcile.types.js';
import { RECONCILE_USAGE } from './reconcile.constants.js';

function strEntry(raw: object, key: string): string | undefined {
  for (const [k, v] of Object.entries(raw)) {
    if (k === key && typeof v === 'string') return v;
  }
  return undefined;
}

function boolEntry(raw: object, key: string): boolean | undefined {
  for (const [k, v] of Object.entries(raw)) {
    if (k === key && typeof v === 'boolean') return v;
  }
  return undefined;
}

function matchMergeStatus(v: unknown): PrInfo['mergeStateStatus'] {
  if (v === 'BEHIND') return 'BEHIND';
  if (v === 'CLEAN') return 'CLEAN';
  if (v === 'DIRTY') return 'DIRTY';
  if (v === 'BLOCKED') return 'BLOCKED';
  if (v === 'UNKNOWN') return 'UNKNOWN';
  return null;
}

function mergeStatus(raw: object): PrInfo['mergeStateStatus'] {
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'mergeStateStatus') return matchMergeStatus(v);
  }
  return null;
}

function parsePrInfo(raw: unknown): PrInfo {
  const result: PrInfo = { number: '', state: 'OPEN', mergeStateStatus: null, headRefName: '', baseRefName: '', isDraft: false };
  if (typeof raw !== 'object' || raw === null) return result;

  const num = strEntry(raw, 'number');
  if (num !== undefined) result.number = num;

  const st = strEntry(raw, 'state');
  if (st === 'MERGED' || st === 'CLOSED') result.state = st;

  const ms = mergeStatus(raw);
  if (ms !== null) result.mergeStateStatus = ms;

  const head = strEntry(raw, 'headRefName');
  if (head !== undefined) result.headRefName = head;

  const base = strEntry(raw, 'baseRefName');
  if (base !== undefined) result.baseRefName = base;

  const draft = boolEntry(raw, 'isDraft');
  if (draft !== undefined) result.isDraft = draft;

  return result;
}

function matchPrStateValue(v: unknown): 'OPEN' | 'MERGED' | 'CLOSED' {
  if (v === 'MERGED') return 'MERGED';
  if (v === 'CLOSED') return 'CLOSED';
  return 'OPEN';
}

function parsePrState(raw: unknown): 'OPEN' | 'MERGED' | 'CLOSED' {
  if (typeof raw !== 'object' || raw === null) return 'OPEN';
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'state') return matchPrStateValue(v);
  }
  return 'OPEN';
}

function defaultGhReader(): GhReader {
  return {
    listOpenPrs() {
      try {
        const raw = execFileSync('gh', ['pr', 'list', '--json', 'number,state,mergeStateStatus,headRefName,baseRefName,isDraft', '--limit', '100'], { encoding: 'utf8' }).trim();
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(parsePrInfo);
        return [];
      } catch { return []; }
    },
    prState(pr: string) {
      try {
        const raw: unknown = JSON.parse(execFileSync('gh', ['pr', 'view', pr, '--json', 'state'], { encoding: 'utf8' }).trim());
        return parsePrState(raw);
      } catch { return 'OPEN'; }
    },
  };
}

function createExecutor(repoRoot: string, io: Io): ReconcilerExecutor {
  return {
    updateBranch(pr: string) {
      execFileSync('gh', ['pr', 'update-branch', pr], { cwd: repoRoot, encoding: 'utf8' });
      io.out(`reconciler: updated branch for PR #${pr}`);
    },
    taskClose(packetId: string, pr: string) {
      const store = openStore(repoRoot);
      try {
        const sessionId = ensureSession(store, process.cwd());
        store.db.prepare('UPDATE packets SET pr = ? WHERE id = ?').run(pr, packetId);
        movePacket(store, sessionId, packetId, STATUS.DONE);
        io.out(`reconciler: closed ${packetId} -> done (PR #${pr})`);
      } finally { store.close(); }
    },
    createBackup() {
      createStateBackup(repoRoot, { reason: BACKUP_REASON.AUTO_DONE });
      io.out('reconciler: created backup');
    },
    recordEvent(event: ReconcilerEvent) {
      const store = openStore(repoRoot);
      try {
        store.db.prepare('INSERT INTO events (command, detail, at) VALUES (?, ?, ?)').run(EVENT_NOTE, `reconciler: ${event.what} (before: ${event.before}, after: ${event.after})`, event.at);
      } finally { store.close(); }
    },
  };
}

function rowTag(row: ReconcilerResult['rows'][number]): string {
  if (row.executed) return '[EXECUTED]';
  if (row.safety === 'safe') return '[SAFE]';
  return '[UNSAFE]';
}

function renderRows(rows: ReconcilerResult['rows'], io: Io): void {
  for (const row of rows) {
    io.out(`${rowTag(row)} ${row.action}`);
    io.out(`  divergence: ${row.divergence}`);
    io.out(`  command:   ${row.command}`);
    io.out(`  detail:    ${row.detail}`);
  }
}

function renderResult(result: ReconcilerResult, io: Io): void {
  if (result.rows.length === 0) {
    io.out('No divergences found - board is converged with the world');
    return;
  }
  renderRows(result.rows, io);
  const safe = result.rows.filter((r) => r.safety === 'safe');
  const unsafeRows = result.rows.filter((r) => r.safety === 'unsafe');
  const executed = result.rows.filter((r) => r.executed);
  io.out('---');
  io.out(`${result.rows.length} divergence(s): ${safe.length} safe, ${unsafeRows.length} unsafe, ${executed.length} executed`);
}

export const command: Command = {
  name: 'reconcile',
  summary: 'Compute and apply convergence actions between the board and the world',
  run(args, io): Promise<number> {
    try {
      const parsed = parseArgs({
        args,
        allowPositionals: true,
        options: {
          apply: { type: 'boolean' },
          json: { type: 'boolean' },
        },
      });

      if (parsed.positionals.length > 0) {
        io.err(RECONCILE_USAGE);
        return Promise.resolve(EXIT.USAGE);
      }

      const repoRoot = commonRoot(process.cwd());
      const store = openStore(repoRoot);
      try {
        const gh = defaultGhReader();
        const exec = createExecutor(repoRoot, io);
        const result = reconcile(store, repoRoot, gh, exec, { dryRun: !parsed.values.apply });

        if (parsed.values.json) {
          io.out(JSON.stringify(result));
        } else {
          renderResult(result, io);
        }

        return Promise.resolve(EXIT.OK);
      } finally {
        store.close();
      }
    } catch (error) {
      io.err(`reconcile failed: ${error instanceof Error ? error.message : String(error)}`);
      return Promise.resolve(EXIT.SYSTEM);
    }
  },
};
