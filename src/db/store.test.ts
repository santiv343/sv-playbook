import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { openStore, migrateStore, readDaemonPort, worktreeRoot } from './store.js';
import { DAEMON_DEFAULT_PORT } from '../daemon/daemon.constants.js';
import { EVENT_SCHEMA_MIGRATED, SCHEMA_VERSION } from './store.constants.js';
import { numberColumn, stringColumn } from './rows.js';
import { randomUUID } from 'node:crypto';

test('openStore creates .svp/playbook.sqlite and the schema tables', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-store-'));
  const store = openStore(root);
  assert.ok(existsSync(join(root, '.svp', 'playbook.sqlite')));
  const tables = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((row) => stringColumn(row, 'name'));
  for (const t of ['events', 'leases', 'packets', 'sessions', 'transitions']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
  store.close();
});

test('openStore is idempotent (schema re-apply is safe)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-store2-'));
  openStore(root).close();
  const again = openStore(root);
  again.close();
});

test('worktreeRoot resolves the git working tree top-level', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wt-'));
  execFileSync('git', ['init'], { cwd: root });
  await writeFile(join(root, 'marker.txt'), 'x');
  assert.ok(existsSync(join(worktreeRoot(root), 'marker.txt')));
});

test('schema version mismatch refuses with the restore recovery message', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-ver-'));
  openStore(root).close();
  const db = new DatabaseSync(join(root, '.svp', 'playbook.sqlite'));
  db.exec('PRAGMA user_version = 1');
  db.close();
  assert.throws(() => openStore(root), /store unusable.*restore state.*rebuild/s);
  const store = openStore(root, { skipVersionCheck: true });
  store.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  store.close();
  const reopened = openStore(root);
  assert.equal(numberColumn(reopened.db.prepare('PRAGMA user_version').get(), 'user_version'), SCHEMA_VERSION);
  reopened.close();
});

test('a version mismatch refuses with a named non-destructive recovery and never deletes .svp', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rec-'));
  openStore(root).close();
  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA user_version = 99');
  db.close();
  assert.throws(() => openStore(root), /restore state.*rebuild/s);
  assert.ok(existsSync(dbPath), '.svp/playbook.sqlite must still exist after mismatch');
});

test('packets store has a body column, a type column, and a packet_deps table at the bumped schema version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-body-'));
  const store = openStore(root);
  const cols = store.db
    .prepare('PRAGMA table_info(packets)')
    .all()
    .map((row) => stringColumn(row, 'name'));
  assert.ok(cols.includes('body'), 'packets table must have a body column');
  assert.ok(cols.includes('type'), 'packets table must have a type column');
  const deps = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='packet_deps'").all();
  assert.equal(deps.length, 1, 'packet_deps table must exist');
  const ver = numberColumn(store.db.prepare('PRAGMA user_version').get(), 'user_version');
  assert.equal(ver, SCHEMA_VERSION, `schema version must be ${SCHEMA_VERSION}`);
  store.close();
});

test('doctor flags a review packet whose PR is already merged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-rev-merge-'));
  execFileSync('git', ['init'], { cwd: root });
  const store = openStore(root);

  store.db.prepare("INSERT INTO packets (id, title, path, status, body, write_set, pr, created_at, updated_at) VALUES ('P1', 'Test', '/tmp/test', 'review', '', '[]', '123', datetime('now'), datetime('now'))").run();

  const { reviewMergedCheckFromStore } = await import('../cli/commands/doctor.js');
  const result: { status: string; detail: string } = reviewMergedCheckFromStore(store);

  assert.notEqual(result.status, 'ok');
  assert.ok(result.detail.includes('already merged'), result.detail);

  store.close();
});

test('the store runs in WAL mode with EXCLUSIVE locking (single-writer enforcement)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-wal-'));
  execFileSync('git', ['init'], { cwd: root });
  const store = openStore(root);

  const modeRow = store.db.prepare('PRAGMA journal_mode').get();
  assert.equal(stringColumn(modeRow, 'journal_mode'), 'wal');

  const lockRow = store.db.prepare('PRAGMA locking_mode').get();
  assert.equal(stringColumn(lockRow, 'locking_mode'), 'exclusive');

  // EXCLUSIVE mode holds the write lock after the first write; a second
  // connection attempting to write receives SQLITE_BUSY.
  store.db.exec(`INSERT INTO sessions (id, worktree, started_at) VALUES ('${randomUUID()}', '/tmp/wt1', datetime('now'))`);

  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db2 = new DatabaseSync(dbPath);
  assert.throws(
    () => { db2.exec(`INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('pk1', 'T1', '/tmp', 'draft', '[]', datetime('now'), datetime('now'))`); },
    /database is locked/,
  );

  db2.close();
  store.close();
});

test('red team: a cross-process writer is rejected when the store holds the exclusive lock (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-xp-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  const store = openStore(root);

  const dbPath = join(root, '.svp', 'playbook.sqlite');
  try {
    const result = spawnSync(process.execPath, ['-e', `
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(${JSON.stringify(dbPath)});
      db.exec('BEGIN IMMEDIATE');
    `], { encoding: 'utf8', timeout: 5000 });
    assert.notEqual(result.status, 0, `child must fail with SQLITE_BUSY, got exit ${result.status}: ${result.stderr}`);
    const msg = result.stderr + result.stdout;
    assert.ok(
      /locked/i.test(msg) || /busy/i.test(msg) || /exclusive/i.test(msg),
      `stderr must mention locked/busy: ${result.stderr}`,
    );
  } finally {
    store.close();
  }
});

test('schema v6 includes constitution_sections and constitution_principles tables', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-const-'));
  const store = openStore(root);
  const tables = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((row) => stringColumn(row, 'name'));
  assert.ok(tables.includes('constitution_sections'), 'missing constitution_sections table');
  assert.ok(tables.includes('constitution_principles'), 'missing constitution_principles table');
  const ver = numberColumn(store.db.prepare('PRAGMA user_version').get(), 'user_version');
  assert.equal(ver, SCHEMA_VERSION);
  store.close();
});

test('schema migration from v5 creates constitution tables', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-mig5-'));
  openStore(root).close();
  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA user_version = 5');
  db.exec('DROP TABLE IF EXISTS constitution_sections');
  db.exec('DROP TABLE IF EXISTS constitution_principles');
  const tablesBefore = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => stringColumn(row, 'name'));
  assert.ok(!tablesBefore.includes('constitution_sections'), 'should not exist at v5');
  db.close();
  const store = openStore(root);
  const tablesAfter = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((row) => stringColumn(row, 'name'));
  assert.ok(tablesAfter.includes('constitution_sections'), 'should exist after v5 migration');
  assert.ok(tablesAfter.includes('constitution_principles'), 'should exist after v5 migration');
  const ver = numberColumn(store.db.prepare('PRAGMA user_version').get(), 'user_version');
  assert.equal(ver, SCHEMA_VERSION);
  store.close();
});

test('schema migration from v7 to v8 rebuilds events table with extended CHECK including imported', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-mig7-'));
  openStore(root).close();
  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA user_version = 7');
  db.exec('DROP TABLE IF EXISTS events');
  db.exec(`CREATE TABLE events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    packet_id TEXT,
    command TEXT NOT NULL CHECK (command IN ('transition', 'note', 'takeover', 'evidence')),
    detail TEXT,
    at TEXT NOT NULL
  )`);
  db.exec("INSERT INTO events (command, at) VALUES ('transition', datetime('now'))");
  db.exec("INSERT INTO events (command, at) VALUES ('note', datetime('now'))");
  db.exec("INSERT INTO events (command, at) VALUES ('takeover', datetime('now'))");
  db.exec("INSERT INTO events (command, at) VALUES ('evidence', datetime('now'))");
  assert.throws(
    () => { db.exec("INSERT INTO events (command, at) VALUES ('imported', datetime('now'))"); },
    /CHECK constraint failed/,
  );
  const oldCount = numberColumn(db.prepare('SELECT COUNT(*) as c FROM events').get(), 'c');
  assert.equal(oldCount, 4);
  db.close();

  const store = openStore(root);
  const ver = numberColumn(store.db.prepare('PRAGMA user_version').get(), 'user_version');
  assert.equal(ver, 8);
  const count = numberColumn(store.db.prepare('SELECT COUNT(*) as c FROM events').get(), 'c');
  assert.equal(count, 5, '4 old events + schema-migrated event must survive migration');
  store.db.exec("INSERT INTO events (command, at) VALUES ('imported', datetime('now'))");
  const countAfter = numberColumn(store.db.prepare('SELECT COUNT(*) as c FROM events').get(), 'c');
  assert.equal(countAfter, 6);
  store.close();
});

test('schema migration refuses while a foreign live lease exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-mig-'));
  execFileSync('git', ['init'], { cwd: root });

  openStore(root).close();
  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA user_version = 1');
  db.exec("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('p1', 'test', '/tmp/test', 'ready', '[]', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')");
  db.exec("INSERT INTO sessions (id, worktree, started_at) VALUES ('my-session', '/tmp/mine', '2025-01-01T00:00:00.000Z')");
  db.exec("INSERT INTO sessions (id, worktree, started_at) VALUES ('foreign-session', '/tmp/foreign', '2025-01-01T00:00:00.000Z')");
  db.exec("INSERT INTO leases (packet_id, session_id, worktree, acquired_at, heartbeat_at) VALUES ('p1', 'foreign-session', '/tmp/foreign', datetime('now'), datetime('now'))");
  db.close();

  assert.throws(
    () => { migrateStore(root, { currentSessionId: 'my-session' }); },
    /migration blocked:/,
  );
  const after = new DatabaseSync(dbPath);
  assert.equal(numberColumn(after.prepare('PRAGMA user_version').get(), 'user_version'), 1);
  after.close();
});

test('auto-migration of an older live store is refused off the default branch without the explicit flag', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-branch-gate-'));
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
  execFileSync('git', ['checkout', '-b', 'feature/test-mig'], { cwd: root });

  openStore(root).close();
  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA user_version = 7');
  db.close();

  assert.throws(
    () => { openStore(root); },
    /migration refused/,
  );

  execFileSync('git', ['checkout', 'main'], { cwd: root });
  const db2 = new DatabaseSync(dbPath);
  db2.exec('PRAGMA user_version = 7');
  db2.close();
  assert.doesNotThrow(() => {
    const s = openStore(root);
    assert.equal(numberColumn(s.db.prepare('PRAGMA user_version').get(), 'user_version'), SCHEMA_VERSION);
    s.close();
  });

  execFileSync('git', ['checkout', 'feature/test-mig'], { cwd: root });
  const db3 = new DatabaseSync(dbPath);
  db3.exec('PRAGMA user_version = 7');
  db3.close();
  assert.doesNotThrow(() => {
    const s = openStore(root, { migrateLive: true });
    assert.equal(numberColumn(s.db.prepare('PRAGMA user_version').get(), 'user_version'), SCHEMA_VERSION);
    s.close();
  });
});

test('bypass via migrateLive is evented (writes a schema-migrated event)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-bypass-event-'));
  execFileSync('git', ['-c', 'init.defaultBranch=main', 'init'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
  execFileSync('git', ['checkout', '-b', 'feature/bypass-test'], { cwd: root });

  openStore(root).close();
  const dbPath = join(root, '.svp', 'playbook.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA user_version = 7');
  db.close();

  const store = openStore(root, { migrateLive: true });
  assert.equal(numberColumn(store.db.prepare('PRAGMA user_version').get(), 'user_version'), SCHEMA_VERSION);

  const eventCount = numberColumn(
    store.db.prepare('SELECT COUNT(*) AS c FROM events WHERE command = ?').get(EVENT_SCHEMA_MIGRATED),
    'c',
  );
  assert.equal(eventCount, 1, 'bypass via migrateLive must write a schema-migrated event');
  store.close();
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => {
      const addr = s.address();
      let port = 0;
      if (typeof addr === 'object' && addr !== null && 'port' in addr) {
        port = addr.port;
      }
      s.close(() => { resolve(port); });
    });
  });
}

test('openStore from a worktree without daemon refuses with daemon guidance (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-store-wt-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });

  const wtDir = join(root, 'wt');
  execFileSync('git', ['branch', 'wt-branch'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wtDir, 'wt-branch'], { cwd: root });

  const previousCwd = process.cwd();
  const previousTestCtx = process.env.NODE_TEST_CONTEXT;
  process.chdir(wtDir);
  process.env.NODE_TEST_CONTEXT = '';
  try {
    assert.throws(
      () => { openStore(root); },
      /daemon/,
    );
  } finally {
    process.env.NODE_TEST_CONTEXT = previousTestCtx;
    process.chdir(previousCwd);
  }
});

test('sync forward handles daemon dying mid-response without hanging (STORE-003)', async () => {
  const port = await freePort();

  const server = createNetServer((socket) => {
    socket.once('data', () => {
      socket.write('HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"exi');
      socket.destroySoon();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => { resolve(); });
    server.on('error', reject);
  });

  try {
    // Exercises the exact shipped transport (client.js forwardToDaemonSync),
    // run from a child process so this test's fake server stays responsive.
    const clientUrl = new URL('../daemon/client.js', import.meta.url).href;
    const script = `const { forwardToDaemonSync } = await import(${JSON.stringify(clientUrl)});process.exit(forwardToDaemonSync(['status'], 't', ${port}));`;
    const code = await new Promise<number>((resolve) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'inherit', 'inherit'] });
      child.on('exit', (c) => { resolve(c ?? 1); });
    });
    assert.notEqual(code, 0, `sync forward must fail when daemon dies mid-response, got exit ${code}`);
  } finally {
    server.close();
  }
});

test('tryAutoForward targets the port recorded in the daemon lock file, not the default (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-lock-port-'));
  const svpDir = join(root, '.svp');
  await mkdir(svpDir, { recursive: true });

  // No lock file → default port
  assert.equal(readDaemonPort(root), DAEMON_DEFAULT_PORT);

  // Lock file records pid\nport\nstarted_at → the recorded port wins
  await writeFile(join(svpDir, '.svp-daemon.lock'), `${process.pid}\n5252\n${new Date().toISOString()}\n`);
  assert.equal(readDaemonPort(root), 5252);

  // Malformed port line → fall back to default
  await writeFile(join(svpDir, '.svp-daemon.lock'), `${process.pid}\nnot-a-port\n`);
  assert.equal(readDaemonPort(root), DAEMON_DEFAULT_PORT);

  // Missing port line (legacy single-line lock) → fall back to default
  await writeFile(join(svpDir, '.svp-daemon.lock'), `${process.pid}\n`);
  assert.equal(readDaemonPort(root), DAEMON_DEFAULT_PORT);
});
