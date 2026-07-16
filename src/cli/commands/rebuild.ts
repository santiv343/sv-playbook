import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { BACKUP_REASON } from '../../db/backup.constants.js';
import { createStateBackup } from '../../db/backup.js';
import { assertSqliteIntegrity, terminalPacketCountAt } from '../../db/inspection.js';
import { stringColumn } from '../../db/rows.js';
import { commonRoot, openStore } from '../../db/store.js';
import { DB_FILE, SVP_DIR } from '../../db/store.constants.js';
import type { Store } from '../../db/store.types.js';
import { getCwd } from '../../runtime/context.js';
import { parsePacketDocument } from '../../packets/document.js';
import type { PacketDefinition } from '../../packets/document.types.js';
import { FILE_EXTENSION } from '../../platform.constants.js';
import { EVENT_TRANSITION, EXISTS_SQL, INSERT_EVENT_SQL, INSERT_PACKET_SQL, PACKETS_DOCS_DIR, PACKETS_DIR, STATUS, TASK_ID_SEPARATOR, TASK_TYPE_PREFIX } from '../../tasks/service.constants.js';
import { loadConfig } from '../../config.js';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';

const now = (): string => new Date().toISOString();

interface RebuildCounts {
  total: number;
  terminal: number;
}

function freshLeases(repoRoot: string): number {
  let store: Store;
  try {
    store = openStore(repoRoot);
  } catch {
    return 0;
  }

  try {
    const rows = store.db.prepare('SELECT heartbeat_at FROM leases').all();
    let count = 0;
    for (const row of rows) {
      if (Date.now() - Date.parse(stringColumn(row, 'heartbeat_at')) <= loadConfig(repoRoot).tasks.leaseTtlMs) count++;
    }
    return count;
  } catch {
    return 0;
  } finally {
    store.close();
  }
}

function typeFromId(id: string): string {
  const prefix = id.slice(0, id.indexOf(TASK_ID_SEPARATOR));
  for (const [type, p] of Object.entries(TASK_TYPE_PREFIX)) {
    if (p === prefix) return type;
  }
  return '';
}

function parseTerminalStatus(body: string): string | undefined {
  const m = /^closed:\s+(done|dropped)\b/m.exec(body);
  return m?.[1];
}

function takePreRebuildBackup(repoRoot: string, dbPath: string, io: { out(line: string): void }): void {
  if (!existsSync(dbPath)) return;

  try {
    const report = createStateBackup(repoRoot, { reason: BACKUP_REASON.MANUAL, allowFreshLeases: true });
    io.out(`pre-rebuild backup: ${report.sqlitePath}`);
  } catch (err) {
    io.out(`pre-rebuild backup skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function insertDeps(store: Store, definitions: PacketDefinition[]): void {
  const depExists = store.db.prepare(EXISTS_SQL);
  const insertDep = store.db.prepare('INSERT OR IGNORE INTO packet_deps (packet_id, depends_on_id) VALUES (?,?)');

  for (const def of definitions) {
    for (const depId of def.dependsOn) {
      if (depExists.get(depId) !== undefined) insertDep.run(def.id, depId);
    }
  }
}

function importPacketsFromDocs(repoRoot: string, store: Store): RebuildCounts {
  const db = store.db;
  const packetsDir = join(repoRoot, PACKETS_DOCS_DIR, PACKETS_DIR);
  if (!existsSync(packetsDir)) return { total: 0, terminal: 0 };

  const files = readdirSync(packetsDir).filter((f) => f.endsWith(FILE_EXTENSION.MARKDOWN));
  const ts = now();
  const insertPkt = db.prepare(INSERT_PACKET_SQL);
  const insertTrans = db.prepare(
    'INSERT INTO transitions (packet_id, from_status, to_status, session_id, at) VALUES (?,?,?,?,?)',
  );
  const insertEvent = db.prepare(INSERT_EVENT_SQL);
  const definitions: PacketDefinition[] = [];
  let terminal = 0;

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const file of files) {
      const text = readFileSync(join(packetsDir, file), 'utf8');
      const { definition: def, body } = parsePacketDocument(text);
      const terminalStatus = parseTerminalStatus(body);
      const status = terminalStatus ?? STATUS.DRAFT;
      const path = join(packetsDir, file);
      const writeSet = JSON.stringify(def.writeSet);

      insertPkt.run(def.id, def.title, path, status, body, writeSet, typeFromId(def.id), ts, ts);
      insertTrans.run(def.id, 'none', status, null, ts);
      insertEvent.run(null, def.id, EVENT_TRANSITION, `none->${status}`, ts);
      definitions.push(def);
      if (status === STATUS.DONE || status === STATUS.DROPPED) terminal++;
    }
    insertDeps(store, definitions);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { total: files.length, terminal };
}

function buildCandidate(repoRoot: string, svpDir: string): { tempRoot: string; dbPath: string; counts: RebuildCounts } {
  const tempRoot = mkdtempSync(join(svpDir, 'rebuild-'));
  const store = openStore(tempRoot);

  try {
    const counts = importPacketsFromDocs(repoRoot, store);
    store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return { tempRoot, dbPath: join(tempRoot, SVP_DIR, DB_FILE), counts };
  } finally {
    store.close();
  }
}

function removeLiveDbFiles(dbPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = `${dbPath}${suffix}`;
    if (existsSync(p)) rmSync(p);
  }
}

function replaceLiveDb(candidatePath: string, livePath: string): void {
  const swapPath = `${livePath}.rebuild-swap`;
  if (existsSync(swapPath)) rmSync(swapPath);
  copyFileSync(candidatePath, swapPath);
  removeLiveDbFiles(livePath);
  renameSync(swapPath, livePath);
}

export const command: Command = {
  name: 'rebuild',
  summary: 'Reconstruct operational DB from git packet exports',
  destructive: true,
  run(args, io): Promise<number> {
    const repoRoot = commonRoot(getCwd());
    const parsed = parseArgs({ args, allowPositionals: true, options: { force: { type: 'boolean' } } });
    if (parsed.positionals.length > 0) {
      io.err('Usage: sv-playbook rebuild [--force]');
      return Promise.resolve(EXIT.USAGE);
    }

    try {
      const svpDir = join(repoRoot, SVP_DIR);
      const dbPath = join(svpDir, DB_FILE);

      const liveLeases = freshLeases(repoRoot);
      if (liveLeases > 0 && !parsed.values.force) {
        io.err(`rebuild refused: ${liveLeases} live lease(s) - use --force to proceed`);
        return Promise.resolve(EXIT.GATE_FAIL);
      }

      takePreRebuildBackup(repoRoot, dbPath, io);

      const liveTerminal = terminalPacketCountAt(dbPath);
      const candidate = buildCandidate(repoRoot, svpDir);
      try {
        assertSqliteIntegrity(candidate.dbPath);
        if (liveTerminal !== undefined && liveTerminal > candidate.counts.terminal) {
          io.err(
            `rebuild refused: reconstructed DB has ${candidate.counts.terminal} terminal packet(s), live DB has ${liveTerminal}; restore a backup instead`,
          );
          return Promise.resolve(EXIT.GATE_FAIL);
        }

        replaceLiveDb(candidate.dbPath, dbPath);
      } finally {
        rmSync(candidate.tempRoot, { recursive: true, force: true });
      }

      io.out(`rebuild: ${candidate.counts.total} packets reconstructed from docs/packets/*.md`);
      return Promise.resolve(EXIT.OK);
    } catch (error) {
      io.err(`error: ${error instanceof Error ? error.message : String(error)}`);
      return Promise.resolve(EXIT.GATE_FAIL);
    }
  },
};
