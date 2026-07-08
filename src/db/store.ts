import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
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

export function openStore(repoRoot: string, options?: OpenStoreOptions): Store {
  const dir = join(repoRoot, SVP_DIR);
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, DB_FILE);
  const isNew = !existsSync(dbPath);
  const db = new DatabaseSync(dbPath);
  applyPragmas(db);
  db.exec(SCHEMA);
  if (isNew) {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  } else if (!options?.skipVersionCheck) {
    const row = db.prepare('PRAGMA user_version').get();
    const currentVersion = numberColumn(row, 'user_version');
    if (currentVersion !== SCHEMA_VERSION) {
      db.close();
      throw new StoreVersionError(
        `store schema v${currentVersion} does not match v${SCHEMA_VERSION}: restore a compatible state backup or run a migration before mutating state`,
      );
    }
  }
  return { db, dir, close: () => { db.close(); } };
}
