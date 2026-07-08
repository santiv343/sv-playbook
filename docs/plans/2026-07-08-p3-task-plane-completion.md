# Plan 3: Task Plane Completion (show, recover, takeover, note, brief)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the task plane: packet detail (`show`), crash/relief handling (`recover`, `takeover` with the spec §10 semantics), progress breadcrumbs (`note`), deterministic prompt assembly (`brief`), and lease heartbeats.

**Architecture:** Extends P2's layers only — new functions in `src/tasks/service.ts`, new subcommand handlers in `src/cli/commands/task.ts`. No new top-level modules except nothing. Reuse `stringColumn`/`numberColumn` from `src/db/rows.ts` for every DB read (the `consistent-type-assertions: never` rule is active — no assertions anywhere).

**Tech Stack:** unchanged (Node >= 22.13, `node:sqlite`, TS strict, node:test, zero runtime deps).

## Global Constraints

- Plans 1 and 2 Global Constraints apply verbatim (exit codes, Windows first-class, no suppressions, English, ISO-8601 UTC timestamps).
- **Autonomy level: `standard`** — self-resolve deviations only when in-write-set + verify-green + reversible + recorded as `DEVIATION:` in the PR description. If a fix requires touching files outside this plan's write-set, that is NOT self-resolvable: stop and report.
- Write-set: `src/tasks/service.ts`, `src/tasks/service.test.ts`, `src/cli/commands/task.ts`, `src/cli/commands/task.test.ts`, `content/cli.md`, `src/cli/commands/docs-content.test.ts`, `README.md`.
- Branch: `feature/P3-task-plane-completion`. PR to `main`. Stop after opening it.
- Lease staleness: a lease is **stale** when `now - heartbeat_at > 30 minutes`. Define `const LEASE_TTL_MS = 30 * 60 * 1000;` in `service.ts`.

---

### Task 1: Heartbeats and lease inspection in the service

**Files:**
- Modify: `src/tasks/service.ts`
- Test: `src/tasks/service.test.ts` (append)

**Interfaces (produced):**

```ts
export interface LeaseInfo { sessionId: string; worktree: string; acquiredAt: string; heartbeatAt: string; stale: boolean; }
export function leaseOf(store: Store, packetId: string): LeaseInfo | undefined;  // replaces the P2 private helper; exported now
export function refreshHeartbeat(store: Store, sessionId: string): void;         // updates heartbeat_at on ALL leases held by the session
```

Rules:
- `leaseOf` reads the lease row via `stringColumn` guards and computes `stale` with `LEASE_TTL_MS` against `Date.now()`.
- `startPacket` and `movePacket` switch to the exported `leaseOf` (delete the private duplicate) and call `refreshHeartbeat(store, sessionId)` first thing when a `sessionId` is provided.

- [ ] **Step 1: Append the failing tests** to `src/tasks/service.test.ts`:

```ts
test('leaseOf reports holder and freshness; refreshHeartbeat updates it', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-001'), 'a');
  const s1 = ensureSession(store, root);
  movePacket(store, undefined, 'P3-001', 'ready');
  startPacket(store, s1, root, 'P3-001');
  const lease = leaseOf(store, 'P3-001');
  assert.ok(lease !== undefined);
  assert.equal(lease.sessionId, s1);
  assert.equal(lease.stale, false);
  store.db.prepare('UPDATE leases SET heartbeat_at = ? WHERE packet_id = ?')
    .run(new Date(Date.now() - 31 * 60 * 1000).toISOString(), 'P3-001');
  const old = leaseOf(store, 'P3-001');
  assert.equal(old?.stale, true);
  refreshHeartbeat(store, s1);
  assert.equal(leaseOf(store, 'P3-001')?.stale, false);
});
```

Add `leaseOf` and `refreshHeartbeat` to the existing import from `./service.js`.

- [ ] **Step 2: `npm test` — expect FAIL (`leaseOf` not exported).**
- [ ] **Step 3: Implement** — export `leaseOf` (row → guards → `LeaseInfo`), add `refreshHeartbeat` (`UPDATE leases SET heartbeat_at = ? WHERE session_id = ?`), rewire `startPacket`/`movePacket`.
- [ ] **Step 4: `npm run verify` — PASS. Commit** — `feat(tasks): exported lease inspection with staleness and heartbeats`

---

### Task 2: `recover` (read-only inspection) and `takeover` in the service

**Files:**
- Modify: `src/tasks/service.ts`
- Test: `src/tasks/service.test.ts` (append)

**Interfaces (produced):**

```ts
export interface RecoveryReport {
  packetId: string;
  status: string;
  lease: LeaseInfo | undefined;
  lastTransitions: string[];   // up to 5, formatted "<at> <from>-><to> (<session|->)"
  lastNotes: string[];         // up to 5 note events, formatted "<at> <text>"
}
export function recoverPacket(store: Store, packetId: string): RecoveryReport;
export function takeoverPacket(store: Store, sessionId: string, worktree: string, packetId: string, force: boolean): RecoveryReport;
```

Rules (spec §10 exactly):
- `recoverPacket` never mutates. Unknown packet → LifecycleError.
- `takeoverPacket`: no lease → LifecycleError `no lease to take over` hint `use task start`; live (non-stale) lease held by another session and `force === false` → LifecycleError `lease is live` hint `pause the holder or pass --force`; own live lease → LifecycleError `you already hold this lease`; stale lease, or `force === true` → atomically (inside `db.exec('BEGIN IMMEDIATE')`/`COMMIT`, `ROLLBACK` on throw): delete old lease, insert new lease for `sessionId`, record event `takeover` with detail `from <oldSession> force=<force>`. Returns `recoverPacket(...)` taken AFTER the swap. Packet stays `active` — no transition rows.

- [ ] **Step 1: Append the failing tests:**

```ts
test('takeover: no lease -> error; stale lease -> allowed; live lease needs force', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-002'), 'a');
  const s1 = ensureSession(store, root);
  const wt2 = await mkdtemp(join(tmpdir(), 'svp-wt3-'));
  const s2 = ensureSession(store, wt2);
  assert.throws(() => { takeoverPacket(store, s2, wt2, 'P3-002', false); }, /no lease/);
  movePacket(store, undefined, 'P3-002', 'ready');
  startPacket(store, s1, root, 'P3-002');
  assert.throws(() => { takeoverPacket(store, s2, wt2, 'P3-002', false); }, /lease is live/);
  const forced = takeoverPacket(store, s2, wt2, 'P3-002', true);
  assert.equal(forced.lease?.sessionId, s2);
  store.db.prepare('UPDATE leases SET heartbeat_at = ? WHERE packet_id = ?')
    .run(new Date(Date.now() - 31 * 60 * 1000).toISOString(), 'P3-002');
  const back = takeoverPacket(store, s1, root, 'P3-002', false); // stale: no force needed
  assert.equal(back.lease?.sessionId, s1);
});

test('recover reports status, lease and recent history without mutating', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-003'), 'a');
  movePacket(store, undefined, 'P3-003', 'ready');
  const report = recoverPacket(store, 'P3-003');
  assert.equal(report.status, 'ready');
  assert.equal(report.lease, undefined);
  assert.ok(report.lastTransitions.length >= 2);
});
```

- [ ] **Step 2: `npm test` — expect FAIL.**
- [ ] **Step 3: Implement both functions** (row reads via guards; transitions query `ORDER BY seq DESC LIMIT 5`; notes query filters `command = 'note'`).
- [ ] **Step 4: `npm run verify` — PASS. Commit** — `feat(tasks): recover inspection and takeover with stale/force semantics`

---

### Task 3: `note` in the service

**Files:**
- Modify: `src/tasks/service.ts`
- Test: `src/tasks/service.test.ts` (append)

**Interfaces:** `export function notePacket(store: Store, sessionId: string, packetId: string, text: string): void;` — unknown packet → LifecycleError; empty/whitespace text → LifecycleError; inserts event `command='note', detail=text` and refreshes the session heartbeat.

- [ ] **Step 1: Failing test:**

```ts
test('note records a breadcrumb event visible in recover', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-004'), 'a');
  const s1 = ensureSession(store, root);
  notePacket(store, s1, 'P3-004', 'halfway through the RED test');
  const report = recoverPacket(store, 'P3-004');
  assert.ok(report.lastNotes.some((n) => n.includes('halfway through')));
  assert.throws(() => { notePacket(store, s1, 'P3-004', '   '); }, LifecycleError);
});
```

- [ ] **Step 2: FAIL. Step 3: implement. Step 4: verify PASS. Commit** — `feat(tasks): note breadcrumbs`

---

### Task 4: `brief` — deterministic prompt assembly

**Files:**
- Modify: `src/tasks/service.ts` (pure formatter) and `src/cli/commands/task.ts` (wiring in Task 5)
- Test: `src/tasks/service.test.ts` (append)

**Interfaces:** `export function briefPacket(store: Store, repoRoot: string, packetId: string): string;`

Fixed structure, identical every time (PRINCIPLE-009). Exact template — placeholders in angle brackets are the only variable parts:

```text
# Brief: <id> — <title>

## Status
state: <status>
lease: <none | held by <sessionId> (fresh|stale)>

## Definition (docs/packets/<id>.md)
<full packet document text, read from the packet path stored in the DB>

## Process
- Contract and workflow: run `npx sv-playbook docs cli` before acting.
- All state changes go through `sv-playbook task move` — never edit status by hand.
- Leave breadcrumbs with `sv-playbook task note <id> "<text>"` at each step.
- Stop conditions and evidence duties are defined in the packet above.
```

Reads the packet file with `readFileSync(path, 'utf8')`; missing file → LifecycleError `packet file missing: <path>` (projection drift is an error, not a warning).

- [ ] **Step 1: Failing test:**

```ts
test('brief has the fixed structure and embeds the packet document', async () => {
  const { root, store } = await setup();
  createPacket(store, root, def('P3-005'), 'Implement the thing.\n');
  const brief = briefPacket(store, root, 'P3-005');
  for (const marker of ['# Brief: P3-005', '## Status', '## Definition', '## Process', 'Implement the thing.']) {
    assert.ok(brief.includes(marker), `missing ${marker}`);
  }
});
```

- [ ] **Step 2: FAIL. Step 3: implement. Step 4: verify PASS. Commit** — `feat(tasks): deterministic brief assembly`

---

### Task 5: CLI wiring — `task show|recover|takeover|note|brief`

**Files:**
- Modify: `src/cli/commands/task.ts`
- Test: `src/cli/commands/task.test.ts` (append)

Subcommands (extend the existing dispatcher and USAGE):
- `task show <ID>` — prints the RecoveryReport human-readably (id, status, lease line, transitions, notes). `--json` prints it as JSON.
- `task recover <ID>` — alias of show (same report; exists as its own verb because the CLI guide teaches it as the crash-inspection step).
- `task takeover <ID> [--force]` — calls `takeoverPacket` with the current session; prints the post-takeover report.
- `task note <ID> <text...>` — joins remaining args with spaces.
- `task brief <ID>` — prints `briefPacket` output verbatim.
- Every handler that has a session calls `refreshHeartbeat` (already inside service functions where specified; do not duplicate).

- [ ] **Step 1: Append failing CLI tests:**

```ts
test('takeover without lease exits 1 with hint; brief prints the packet', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Brief me.\n');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'P3-101', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io);
    const code = await taskCommand.run(['takeover', 'P3-101'], io);
    assert.equal(code, 1);
    assert.ok(io.errLines.some((l) => l.includes('no lease')));
    const io2 = fakeIo();
    assert.equal(await taskCommand.run(['brief', 'P3-101'], io2), 0);
    assert.ok(io2.outLines.join('\n').includes('Brief me.'));
  });
});

test('note then show surfaces the breadcrumb', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'x');
    const io = fakeIo();
    await taskCommand.run(['create', '--id', 'P3-102', '--title', 'X', '--write', 'src/**', '--body-file', 'body.md'], io);
    await taskCommand.run(['note', 'P3-102', 'checkpoint', 'one'], io);
    const io2 = fakeIo();
    assert.equal(await taskCommand.run(['show', 'P3-102'], io2), 0);
    assert.ok(io2.outLines.some((l) => l.includes('checkpoint one')));
  });
});
```

- [ ] **Step 2: FAIL. Step 3: implement handlers. Step 4: `npm run verify` — PASS. Commit** — `feat(cli): show, recover, takeover, note and brief subcommands`

---

### Task 6: Docs and PR

**Files:**
- Modify: `content/cli.md`, `README.md`, `src/cli/commands/docs-content.test.ts`

- [ ] **Step 1:** Extend the `task` section of `content/cli.md`: document the five new subcommands in the When/Why format, replace the takeover hint row in the refusal matrix ("use takeover once available" → the real semantics: stale lease → `task takeover`; live lease → `--force` or pause the holder first), and document `LEASE_TTL_MS` (30 minutes) plainly.
- [ ] **Step 2:** Append to `docs-content.test.ts`:

```ts
test('cli topic documents takeover and brief', async () => {
  const text = await readTopic('cli');
  assert.ok(text !== undefined);
  for (const s of ['takeover', 'brief', 'stale', 'note']) {
    assert.ok(text.toLowerCase().includes(s), `missing ${s}`);
  }
});
```

- [ ] **Step 3:** README usage block: add `task brief P2-101` and `task takeover P2-101 --force` lines.
- [ ] **Step 4:** `npm run verify` — PASS. Commit — `docs(content): task plane completion in CLI guide`
- [ ] **Step 5:** Push and open PR:

```bash
git push -u origin feature/P3-task-plane-completion
gh pr create --title "P3: task plane completion (show, recover, takeover, note, brief)" --body "Implements Plan 3 (docs/plans/2026-07-08-p3-task-plane-completion.md). DEVIATION list: <none | bullets>. Human review required."
```

Stop after opening the PR. Report final SHA from `git rev-parse HEAD` run after the last commit, full verify output, and the DEVIATION list.
