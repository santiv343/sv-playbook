import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { numberColumn } from './rows.js';
import { DB_FILE, SCHEMA, SCHEMA_VERSION, SVP_DIR } from './store.constants.js';
import { StoreVersionError } from './store.errors.js';
import type { Store } from './store.types.js';

export function commonRoot(startDir: string): string {
  const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: startDir,
    encoding: 'utf8',
  }).trim();
  return dirname(resolve(startDir, out));
}

function applyPragmas(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
}

interface OpenStoreOptions {
  skipVersionCheck?: boolean;
}

function trimBackups(backupDir: string): void {
  const current = readdirSync(backupDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({ name: f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (current.length <= 10) return;
  for (let i = 10; i < current.length; i++) {
    const entry = current[i];
    if (entry !== undefined) rmSync(join(backupDir, entry.name));
  }
}

function rotateBackups(dir: string, dbPath: string): void {
  const backupDir = join(dir, 'backups');
  mkdirSync(backupDir, { recursive: true });
  if (!existsSync(dbPath)) return;
  const files = readdirSync(backupDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({ name: f, mtime: statSync(join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length > 0) {
    const newest = files[0];
    if (newest !== undefined && Date.now() - newest.mtime < 10 * 60 * 1000) return;
  }
  const stamp = new Date().toISOString().replace(/[:\-T.Z]/g, '').slice(0, 14);
  copyFileSync(dbPath, join(backupDir, `playbook-${stamp}.sqlite`));
  trimBackups(backupDir);
}

export function openStore(repoRoot: string, options?: OpenStoreOptions): Store {
  const dir = join(repoRoot, SVP_DIR);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, DB_FILE);
  const isNew = !existsSync(dbPath);
  rotateBackups(dir, dbPath);
  const db = new DatabaseSync(dbPath);
  applyPragmas(db);
  db.exec(SCHEMA);
  if (isNew) {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    rotateBackups(dir, dbPath);
  } else if (!options?.skipVersionCheck) {
    const row = db.prepare('PRAGMA user_version').get();
    const currentVersion = numberColumn(row, 'user_version');
    if (currentVersion !== SCHEMA_VERSION) {
      db.close();
      throw new StoreVersionError(
        `store schema v${currentVersion} does not match v${SCHEMA_VERSION}: run sv-playbook rebuild from the main repo with no other sv-playbook processes running`,
      );
    }
  }
  return { db, dir, close: () => { db.close(); } };
}
