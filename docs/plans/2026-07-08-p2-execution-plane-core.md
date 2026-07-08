# Plan 2: Execution Plane Core (store, packets, task lifecycle)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The task tracker's vertical core: `sv-playbook task create|list|start|move` backed by SQLite (`node:sqlite`), with packets as CLI-authored markdown + DB dual projections (spec D21), sessions, leases and the start/takeover refusal matrix (spec §10).

**Architecture:** Three layers, one file each concern: `src/db/store.ts` (SQLite bootstrap, schema, worktree-shared location), `src/packets/document.ts` (canonical packet markdown codec), `src/tasks/service.ts` (lifecycle rules), thin CLI commands on top reusing P1's `Command`/`Io`/`EXIT` from `src/cli/command.ts`. The DB lives under the git COMMON dir root so all worktrees share one coordination plane; it is never committed. **(Durability model SUPERSEDED by spec §8/D6, 2026-07-08: SQLite is operational truth, rebuilt only via `backup state`/`restore state`, NOT from packet files.)**

**Tech Stack:** Node >= 22.13 (`node:sqlite` `DatabaseSync`, `node:util` `parseArgs`), TypeScript strict, node:test. Still zero runtime dependencies.

## Global Constraints

- Everything from Plan 1's Global Constraints applies verbatim (exit codes 0/1/2/3, Windows first-class, strict TS, no suppressions, English).
- **Autonomy level: `standard` (spec D19).** You may self-resolve a plan deviation ONLY when ALL hold: inside the write-set, verifiable green by `npm run verify`, reversible, and recorded as a `DEVIATION:` bullet in the PR description with rationale. Anything else: stop and report as before.
- Branch: `feature/P2-execution-plane`. PR to `main`. Human review before merge.
- All timestamps: ISO-8601 UTC strings (`new Date().toISOString()`).
- SQLite: WAL mode, `busy_timeout = 5000`. The DB file is `.svp/playbook.sqlite` under the repo's git common root.

---

### Task 1: Store bootstrap — shared SQLite under the git common root

**Files:**
- Create: `src/db/store.ts`
- Test: `src/db/store.test.ts`

**Interfaces (produced, used by every later task):**

```ts
// src/db/store.ts
import { DatabaseSync } from 'node:sqlite';
export interface Store { readonly db: DatabaseSync; readonly dir: string; close(): void; }
export function commonRoot(startDir: string): string; // resolves worktree -> main repo root (git common dir's parent)
export function openStore(repoRoot: string): Store;   // creates <root>/.svp/, opens playbook.sqlite, WAL, applies schema
```

- [ ] **Step 1: Write the failing test** — `src/db/store.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from './store.js';

test('openStore creates .svp/playbook.sqlite and the schema tables', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-store-'));
  const store = openStore(root);
  assert.ok(existsSync(join(root, '.svp', 'playbook.sqlite')));
  const tables = store.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
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
```

- [ ] **Step 2: Run `npm test` — expect FAIL: cannot find `./store.js`.**

- [ ] **Step 3: Implement `src/db/store.ts`:**

```ts
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface Store { readonly db: DatabaseSync; readonly dir: string; close(): void; }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS packets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transitions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  packet_id TEXT NOT NULL REFERENCES packets(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  session_id TEXT,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  worktree TEXT NOT NULL,
  harness TEXT,
  model TEXT,
  started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leases (
  packet_id TEXT PRIMARY KEY REFERENCES packets(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  worktree TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  packet_id TEXT,
  command TEXT NOT NULL,
  detail TEXT,
  at TEXT NOT NULL
);
`;

export function commonRoot(startDir: string): string {
  const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: startDir,
    encoding: 'utf8',
  }).trim();
  return dirname(resolve(startDir, out));
}

export function openStore(repoRoot: string): Store {
  const dir = join(repoRoot, '.svp');
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'playbook.sqlite'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return { db, dir, close: () => { db.close(); } };
}
```

- [ ] **Step 4: `npm run verify` — expect PASS.**
- [ ] **Step 5: Commit** — `feat(db): sqlite store with schema, WAL, worktree-shared location`

---

### Task 2: Packet document codec (canonical markdown, D21)

**Files:**
- Create: `src/packets/document.ts`
- Test: `src/packets/document.test.ts`

**Interfaces (produced):**

```ts
export interface PacketDefinition {
  id: string;                 // ^PACKET-[A-Z0-9-]+$ or ^[A-Z]+-\d+$ style: /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/
  title: string;
  dependsOn: string[];
  writeSet: string[];         // non-empty
  requirements: string[];
  evidenceRequired: string[];
}
export class PacketFormatError extends Error {}
export function generatePacketDocument(def: PacketDefinition, body: string): string;
export function parsePacketDocument(text: string): { definition: PacketDefinition; body: string };
```

Canonical format (the CLI is the only writer, so the parser accepts exactly what the generator emits — no lenient YAML):

```markdown
---
id: PACKET-001
title: <title>
depends_on: ["A-1","B-2"]
write_set: ["src/x/**"]
requirements: ["REQ-001"]
evidence_required: ["red-test-output","verify-root","final-sha"]
---

<body>
```

Array values are JSON arrays of strings on one line; `id`/`title` are raw strings. Round-trip must be lossless.

- [ ] **Step 1: Write the failing test** — `src/packets/document.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePacketDocument, parsePacketDocument, PacketFormatError } from './document.js';

const def = {
  id: 'PACKET-001',
  title: 'Example packet',
  dependsOn: [],
  writeSet: ['src/x/**'],
  requirements: ['REQ-001'],
  evidenceRequired: ['red-test-output', 'verify-root', 'final-sha'],
};

test('generate/parse round-trip is lossless', () => {
  const text = generatePacketDocument(def, 'Do the thing.\n');
  const back = parsePacketDocument(text);
  assert.deepEqual(back.definition, def);
  assert.equal(back.body, 'Do the thing.\n');
});

test('parse rejects missing required keys', () => {
  assert.throws(() => parsePacketDocument('---\nid: X-1\n---\nbody'), PacketFormatError);
});

test('generate rejects invalid id and empty write_set', () => {
  assert.throws(() => generatePacketDocument({ ...def, id: 'lower-case' }, 'b'), PacketFormatError);
  assert.throws(() => generatePacketDocument({ ...def, writeSet: [] }, 'b'), PacketFormatError);
});
```

- [ ] **Step 2: Run `npm test` — expect FAIL (module missing).**

- [ ] **Step 3: Implement `src/packets/document.ts`:**

```ts
export interface PacketDefinition {
  id: string;
  title: string;
  dependsOn: string[];
  writeSet: string[];
  requirements: string[];
  evidenceRequired: string[];
}

export class PacketFormatError extends Error {}

const ID_RE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+$/;

function assertValid(def: PacketDefinition): void {
  if (!ID_RE.test(def.id)) throw new PacketFormatError(`invalid packet id: ${def.id}`);
  if (def.title.trim() === '') throw new PacketFormatError('title must not be empty');
  if (def.writeSet.length === 0) throw new PacketFormatError('write_set must not be empty');
}

function jsonArray(values: string[]): string {
  return JSON.stringify(values);
}

export function generatePacketDocument(def: PacketDefinition, body: string): string {
  assertValid(def);
  return [
    '---',
    `id: ${def.id}`,
    `title: ${def.title}`,
    `depends_on: ${jsonArray(def.dependsOn)}`,
    `write_set: ${jsonArray(def.writeSet)}`,
    `requirements: ${jsonArray(def.requirements)}`,
    `evidence_required: ${jsonArray(def.evidenceRequired)}`,
    '---',
    '',
    body,
  ].join('\n');
}

function parseStringArray(raw: string, key: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PacketFormatError(`${key} is not a JSON array`);
  }
  if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) {
    throw new PacketFormatError(`${key} must be an array of strings`);
  }
  return parsed;
}

export function parsePacketDocument(text: string): { definition: PacketDefinition; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n\r?\n?([\s\S]*)$/.exec(text);
  if (m === null || m[1] === undefined || m[2] === undefined) {
    throw new PacketFormatError('missing frontmatter fences');
  }
  const fields = new Map<string, string>();
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(': ');
    if (idx === -1) throw new PacketFormatError(`malformed frontmatter line: ${line}`);
    fields.set(line.slice(0, idx), line.slice(idx + 2));
  }
  const get = (key: string): string => {
    const v = fields.get(key);
    if (v === undefined) throw new PacketFormatError(`missing key: ${key}`);
    return v;
  };
  const definition: PacketDefinition = {
    id: get('id'),
    title: get('title'),
    dependsOn: parseStringArray(get('depends_on'), 'depends_on'),
    writeSet: parseStringArray(get('write_set'), 'write_set'),
    requirements: parseStringArray(get('requirements'), 'requirements'),
    evidenceRequired: parseStringArray(get('evidence_required'), 'evidence_required'),
  };
  assertValid(definition);
  return { definition, body: m[2] };
}
```

- [ ] **Step 4: `npm run verify` — expect PASS.**
- [ ] **Step 5: Commit** — `feat(packets): canonical packet document codec with strict validation`

---

### Task 3: Lifecycle service — create, transitions, sessions, leases

**Files:**
- Create: `src/tasks/service.ts`
- Test: `src/tasks/service.test.ts`

**Interfaces (produced):**

```ts
export type PacketStatus = 'draft' | 'ready' | 'active' | 'review' | 'done' | 'blocked' | 'dropped';
export class LifecycleError extends Error { constructor(message: string, readonly hint?: string) { super(message); } }
export function createPacket(store: Store, repoRoot: string, def: PacketDefinition, body: string): void;
export function listPackets(store: Store): Array<{ id: string; title: string; status: string; priority: number; updatedAt: string }>;
export function ensureSession(store: Store, worktree: string): string; // stable per worktree via .svp-session file
export function startPacket(store: Store, sessionId: string, worktree: string, packetId: string): void;
export function movePacket(store: Store, sessionId: string | undefined, packetId: string, to: PacketStatus): void;
```

Rules (spec §10, implement exactly):
- `createPacket`: id unique (else LifecycleError); writes `docs/packets/<id>.md` via `generatePacketDocument`; inserts row status `draft`; records transition `('none'→'draft')` and event.
- Allowed transitions: `draft→ready`, `ready→active` (only via `startPacket`), `active→review`, `active→blocked`, `blocked→ready`, `review→active`, `review→done`, and `draft|ready|blocked→dropped`. Everything else: LifecycleError naming the statuses.
- `ensureSession`: reads `<worktree>/.svp-session` (single line, session id) if present and existing in DB; else creates session row with `randomUUID()` and writes the file.
- `startPacket` refusal matrix: not `ready` → LifecycleError `wrong state <s>` with hint (`review/done/dropped` → "reopening goes through the change bridge"); lease held by ANOTHER session → LifecycleError `held by session <id>` hint "use takeover (P3)"; lease held by SAME session → return silently (idempotent); else insert lease + transition `ready→active`.
- `movePacket`: transitions out of `active` require the lease-holding session (LifecycleError `lease required` / `lease held by another session`); reaching `done` or `dropped` deletes the lease; every move updates `packets.status/updated_at`, inserts transition + event.

- [ ] **Step 1: Write the failing tests** — `src/tasks/service.test.ts` (each helper builds a temp git-less root; pass the dir directly, no git needed at this layer):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import { createPacket, ensureSession, startPacket, movePacket, listPackets, LifecycleError } from './service.js';

const def = (id: string) => ({
  id, title: `Packet ${id}`, dependsOn: [], writeSet: ['src/**'],
  requirements: [], evidenceRequired: ['final-sha'],
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'svp-life-'));
  return { root, store: openStore(root) };
}

test('createPacket writes markdown projection and DB row in draft', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'Body.\n');
  const text = await readFile(join(root, 'docs', 'packets', 'P2-001.md'), 'utf8');
  assert.ok(text.includes('id: P2-001'));
  const rows = listPackets(store);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, 'draft');
});

test('duplicate id is refused', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  assert.throws(() => createPacket(store, root, def('P2-001'), 'b'), LifecycleError);
});

test('start requires ready; wrong state names the state', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  const s = ensureSession(store, root);
  assert.throws(() => startPacket(store, s, root, 'P2-001'), /wrong state draft/);
});

test('start matrix: same-session idempotent, other-session refused', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'P2-001', 'ready');
  startPacket(store, s1, root, 'P2-001');
  startPacket(store, s1, root, 'P2-001'); // idempotent, no throw
  const wt2 = await mkdtemp(join(tmpdir(), 'svp-wt2-'));
  const s2 = ensureSession(store, wt2);
  assert.throws(() => startPacket(store, s2, wt2, 'P2-001'), /held by session/);
});

test('active exits require the lease holder; done clears the lease', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'P2-001', 'ready');
  startPacket(store, s1, root, 'P2-001');
  assert.throws(() => movePacket(store, undefined, 'P2-001', 'review'), /lease/);
  movePacket(store, s1, 'P2-001', 'review');
  movePacket(store, s1, 'P2-001', 'done');
  assert.equal(listPackets(store)[0]?.status, 'done');
});

test('illegal transition is refused with both statuses named', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P2-001'), 'a');
  assert.throws(() => movePacket(store, undefined, 'P2-001', 'done'), /draft.*done/);
});

test('ensureSession is stable per worktree (reads .svp-session back)', async () => {
  const { root, store } = await setup();
  const a = ensureSession(store, root);
  const b = ensureSession(store, root);
  assert.equal(a, b);
  const onDisk = (await readFile(join(root, '.svp-session'), 'utf8')).trim();
  assert.equal(onDisk, a);
});
```

- [ ] **Step 2: Run `npm test` — expect FAIL (module missing).**

- [ ] **Step 3: Implement `src/tasks/service.ts`** (structure; keep functions under ~40 lines each):

```ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Store } from '../db/store.js';
import { generatePacketDocument, type PacketDefinition } from '../packets/document.js';

export type PacketStatus = 'draft' | 'ready' | 'active' | 'review' | 'done' | 'blocked' | 'dropped';

export class LifecycleError extends Error {
  constructor(message: string, readonly hint?: string) { super(message); }
}

const ALLOWED: ReadonlyMap<string, readonly PacketStatus[]> = new Map([
  ['draft', ['ready', 'dropped']],
  ['ready', ['active', 'dropped']],
  ['active', ['review', 'blocked']],
  ['blocked', ['ready', 'dropped']],
  ['review', ['active', 'done']],
]);

const now = (): string => new Date().toISOString();

function recordTransition(store: Store, packetId: string, from: string, to: string, sessionId?: string): void {
  store.db.prepare('INSERT INTO transitions (packet_id, from_status, to_status, session_id, at) VALUES (?,?,?,?,?)')
    .run(packetId, from, to, sessionId ?? null, now());
  store.db.prepare('UPDATE packets SET status = ?, updated_at = ? WHERE id = ?').run(to, now(), packetId);
  store.db.prepare('INSERT INTO events (session_id, packet_id, command, detail, at) VALUES (?,?,?,?,?)')
    .run(sessionId ?? null, packetId, 'transition', `${from}->${to}`, now());
}

export function createPacket(store: Store, repoRoot: string, def: PacketDefinition, body: string): void {
  const exists = store.db.prepare('SELECT 1 FROM packets WHERE id = ?').get(def.id);
  if (exists !== undefined) throw new LifecycleError(`packet already exists: ${def.id}`);
  const dir = join(repoRoot, 'docs', 'packets');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${def.id}.md`);
  writeFileSync(path, generatePacketDocument(def, body), 'utf8');
  store.db.prepare('INSERT INTO packets (id, title, path, status, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(def.id, def.title, path, 'draft', now(), now());
  recordTransition(store, def.id, 'none', 'draft');
}

export function listPackets(store: Store): Array<{ id: string; title: string; status: string; priority: number; updatedAt: string }> {
  const rows = store.db.prepare('SELECT id, title, status, priority, updated_at FROM packets ORDER BY priority, id').all();
  return rows.map((r) => {
    const row = r as { id: string; title: string; status: string; priority: number; updated_at: string };
    return { id: row.id, title: row.title, status: row.status, priority: row.priority, updatedAt: row.updated_at };
  });
}

export function ensureSession(store: Store, worktree: string): string {
  const file = join(worktree, '.svp-session');
  if (existsSync(file)) {
    const id = readFileSync(file, 'utf8').trim();
    const known = store.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id);
    if (known !== undefined) return id;
  }
  const id = randomUUID();
  store.db.prepare('INSERT INTO sessions (id, worktree, started_at) VALUES (?,?,?)').run(id, worktree, now());
  writeFileSync(file, `${id}\n`, 'utf8');
  return id;
}

function currentStatus(store: Store, packetId: string): string {
  const row = store.db.prepare('SELECT status FROM packets WHERE id = ?').get(packetId);
  if (row === undefined) throw new LifecycleError(`unknown packet: ${packetId}`);
  return (row as { status: string }).status;
}

export function startPacket(store: Store, sessionId: string, worktree: string, packetId: string): void {
  const status = currentStatus(store, packetId);
  const lease = store.db.prepare('SELECT session_id FROM leases WHERE packet_id = ?').get(packetId) as
    | { session_id: string } | undefined;
  if (lease !== undefined) {
    if (lease.session_id === sessionId) return; // idempotent retry
    throw new LifecycleError(`held by session ${lease.session_id}`, 'use takeover (arrives in P3)');
  }
  if (status !== 'ready') {
    const hint = ['review', 'done', 'dropped'].includes(status) ? 'reopening goes through the change bridge' : undefined;
    throw new LifecycleError(`wrong state ${status}`, hint);
  }
  store.db.prepare('INSERT INTO leases (packet_id, session_id, worktree, acquired_at, heartbeat_at) VALUES (?,?,?,?,?)')
    .run(packetId, sessionId, worktree, now(), now());
  recordTransition(store, packetId, 'ready', 'active', sessionId);
}

export function movePacket(store: Store, sessionId: string | undefined, packetId: string, to: PacketStatus): void {
  const from = currentStatus(store, packetId);
  if (to === 'active') throw new LifecycleError('use task start to activate a packet');
  const allowed = ALLOWED.get(from) ?? [];
  if (!allowed.includes(to)) throw new LifecycleError(`illegal transition ${from} -> ${to}`);
  if (from === 'active') {
    const lease = store.db.prepare('SELECT session_id FROM leases WHERE packet_id = ?').get(packetId) as
      | { session_id: string } | undefined;
    if (lease === undefined || sessionId === undefined) throw new LifecycleError('lease required to leave active');
    if (lease.session_id !== sessionId) throw new LifecycleError(`lease held by another session ${lease.session_id}`);
  }
  if (to === 'done' || to === 'dropped') {
    store.db.prepare('DELETE FROM leases WHERE packet_id = ?').run(packetId);
  }
  recordTransition(store, packetId, from, to, sessionId);
}
```

- [ ] **Step 4: `npm run verify` — expect PASS. Add `.svp-session` to `.gitignore` (new line).**
- [ ] **Step 5: Commit** — `feat(tasks): lifecycle service with sessions, leases and the start refusal matrix`

---

### Task 4: CLI commands `task create|list|start|move`

**Files:**
- Create: `src/cli/commands/task.ts`
- Modify: `src/cli/registry.ts` (add `taskCommand`)
- Test: `src/cli/commands/task.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3 plus `Command`/`Io`/`EXIT` (P1).
- Produces: `sv-playbook task <sub>` where `<sub>` ∈ `create|list|start|move`. `LifecycleError`/`PacketFormatError` → exit 1 with `error: <message>` (+ `hint: <hint>` when present); unknown subcommand/args → usage, exit 2. `list --json` prints a JSON array.

Argument shapes (use `node:util` `parseArgs` with `allowPositionals: true`):
- `task create --id <ID> --title <T> [--write <glob>]... [--depends <ID>]... [--req <REQ>]... [--evidence <E>]... --body-file <path>` (at least one `--write`; `--evidence` defaults to `["final-sha"]`)
- `task list [--json]`
- `task start <ID>` · `task move <ID> <status>`
- Repo root: `commonRoot(process.cwd())`; session: `ensureSession(store, process.cwd())` for `start`/`move`.

- [ ] **Step 1: Write the failing test** — `src/cli/commands/task.test.ts` (drive `taskCommand.run` with a fake `Io` inside a temp dir; `process.chdir` into a `mkdtemp` root where `git init` ran via `execFileSync('git', ['init'])`; restore cwd in `finally`):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { taskCommand } from './task.js';
import type { Io } from '../command.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = []; const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-cli-'));
  execFileSync('git', ['init'], { cwd: root });
  const prev = process.cwd();
  process.chdir(root);
  try { return await fn(); } finally { process.chdir(prev); }
}

test('create -> list -> start -> move review happy path', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const io = fakeIo();
    assert.equal(await taskCommand.run(['create', '--id', 'P2-101', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io), 0);
    assert.equal(await taskCommand.run(['move', 'P2-101', 'ready'], io), 0);
    assert.equal(await taskCommand.run(['start', 'P2-101'], io), 0);
    assert.equal(await taskCommand.run(['move', 'P2-101', 'review'], io), 0);
    const io2 = fakeIo();
    assert.equal(await taskCommand.run(['list', '--json'], io2), 0);
    const parsed = JSON.parse(io2.outLines.join('\n')) as Array<{ id: string; status: string }>;
    assert.equal(parsed[0]?.status, 'review');
  });
});

test('lifecycle errors exit 1 with message and hint', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'x');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'P2-102', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io);
    const code = await taskCommand.run(['start', 'P2-102'], io);
    assert.equal(code, 1);
    assert.ok(io.errLines.some((l) => l.includes('wrong state draft')));
  });
});

test('unknown subcommand exits 2 with usage', async () => {
  const io = fakeIo();
  assert.equal(await taskCommand.run(['frobnicate'], io), 2);
  assert.ok(io.errLines.some((l) => l.includes('Usage')));
});
```

- [ ] **Step 2: Run `npm test` — expect FAIL (module missing).**

- [ ] **Step 3: Implement `src/cli/commands/task.ts`** — one `taskCommand: Command` whose `run` dispatches on `args[0]` to four small handlers; each handler: `parseArgs`, `commonRoot(process.cwd())`, `openStore`, call service, `store.close()` in `finally`. Error mapping at the dispatcher: `LifecycleError`/`PacketFormatError` → print `error: ...` (+hint) return `EXIT.GATE_FAIL`; usage problems → print usage return `EXIT.USAGE`. Register in `registry.ts`: `export const commands: readonly Command[] = [docsCommand, taskCommand];`

- [ ] **Step 4: `npm run verify` — expect PASS.**
- [ ] **Step 5: Commit** — `feat(cli): task create/list/start/move commands over the execution plane`

---

### Task 5: Documentation and PR

**Files:**
- Modify: `content/cli.md` (add `task` section in the established format: When / Why per subcommand, statuses, the refusal matrix table), `README.md` (usage block gains the task commands).

- [ ] **Step 1: Extend `content/cli.md`** after the `docs` section: `### sv-playbook task create|list|start|move` — document argument shapes exactly as in Task 4, the status set `draft ready active review done blocked dropped`, the start refusal matrix (5 rows, from spec §10), and that `.svp/` is never committed while `docs/packets/*.md` always is.
- [ ] **Step 2: Extend the existing docs-content test** — add to `src/cli/commands/docs-content.test.ts`:

```ts
test('cli topic documents the task lifecycle', async () => {
  const text = await readTopic('cli');
  assert.ok(text !== undefined);
  for (const s of ['task create', 'task start', 'refusal', 'draft', 'dropped']) {
    assert.ok(text.toLowerCase().includes(s.toLowerCase()), `missing ${s}`);
  }
});
```

- [ ] **Step 3: `npm run verify` — expect PASS. Commit** — `docs(content): task lifecycle section in CLI guide`
- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feature/P2-execution-plane
gh pr create --title "P2: execution plane core (store, packets, task lifecycle)" --body "Implements Plan 2 (docs/plans/2026-07-08-p2-execution-plane-core.md). DEVIATION list: <none | bullets>. Human review required."
```

Stop after opening the PR. Report final SHA from `git rev-parse HEAD`, full verify output, and the DEVIATION list (empty if none).
