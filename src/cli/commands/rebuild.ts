import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { SCHEMA, SCHEMA_VERSION, DB_FILE, SVP_DIR } from '../../db/store.constants.js';
import { parsePacketDocument } from '../../packets/document.js';
import { INSERT_PACKET_SQL, LEASE_TTL_MS, PACKETS_DOCS_DIR, PACKETS_DIR, STATUS } from '../../tasks/service.constants.js';
import { stringColumn } from '../../db/rows.js';
import { createStateBackup } from '../../db/backup.js';
import { BACKUP_REASON } from '../../db/backup.constants.js';
import { commonRoot } from '../../db/store.js';

const now = (): string => new Date().toISOString();

function freshLeases(svpDir: string): number {
  const dbPath = join(svpDir, DB_FILE);
  if (!existsSync(dbPath)) return 0;
  let db: DatabaseSync;
  try { db = new DatabaseSync(dbPath); } catch { return 0; }
  try {
    const rows = db.prepare('SELECT heartbeat_at FROM leases').all();
    let count = 0;
    for (const row of rows) {
      if (Date.now() - Date.parse(stringColumn(row, 'heartbeat_at')) <= LEASE_TTL_MS) count++;
    }
    return count;
  } catch { return 0; } finally { db.close(); }
}

function applyPragmas(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
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

function recreateDb(dbPath: string, svpDir: string): DatabaseSync {
  if (existsSync(dbPath)) rmSync(dbPath);
  mkdirSync(svpDir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  applyPragmas(db);
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

function importPacketsFromDocs(repoRoot: string, db: DatabaseSync): number {
  const packetsDir = join(repoRoot, PACKETS_DOCS_DIR, PACKETS_DIR);
  if (!existsSync(packetsDir)) return 0;

  const files = readdirSync(packetsDir).filter((f) => f.endsWith('.md'));
  const ts = now();
  const insertPkt = db.prepare(INSERT_PACKET_SQL);
  const insertTrans = db.prepare(
    'INSERT INTO transitions (packet_id, from_status, to_status, session_id, at) VALUES (?,?,?,?,?)',
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const file of files) {
      const text = readFileSync(join(packetsDir, file), 'utf8');
      const { definition: def, body } = parsePacketDocument(text);
      const terminalStatus = parseTerminalStatus(body);
      const status = terminalStatus ?? STATUS.DRAFT;
      const path = join(packetsDir, file);
      const writeSet = JSON.stringify(def.writeSet);
      insertPkt.run(def.id, def.title, path, status, writeSet, ts, ts);
      insertTrans.run(def.id, 'none', status, null, ts);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return files.length;
}

export function rebuildCommand(): Command {
  return {
    name: 'rebuild',
    summary: 'Reconstruct operational DB from git packet exports',
    run(args, io): Promise<number> {
      const parsed = parseArgs({ args, allowPositionals: true, options: { force: { type: 'boolean' } } });
      if (parsed.positionals.length > 0) {
        io.err('Usage: sv-playbook rebuild [--force]');
        return Promise.resolve(EXIT.USAGE);
      }
      try {
        const repoRoot = commonRoot(process.cwd());
        const svpDir = join(repoRoot, SVP_DIR);
        const dbPath = join(svpDir, DB_FILE);

        const liveLeases = freshLeases(svpDir);
        if (liveLeases > 0 && !parsed.values.force) {
          io.err(`rebuild refused: ${liveLeases} live lease(s) — use --force to proceed`);
          return Promise.resolve(EXIT.GATE_FAIL);
        }

        takePreRebuildBackup(repoRoot, dbPath, io);

        const db = recreateDb(dbPath, svpDir);
        const count = importPacketsFromDocs(repoRoot, db);
        db.close();

        io.out(`rebuild: ${count} packets reconstructed from docs/packets/*.md`);
        return Promise.resolve(EXIT.OK);
      } catch (error) {
        io.err(`error: ${error instanceof Error ? error.message : String(error)}`);
        return Promise.resolve(EXIT.GATE_FAIL);
      }
    },
  };
}
