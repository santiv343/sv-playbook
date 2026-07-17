# Complexity Checkpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force explicit human approval before a packet touching
never-before-seen `write_set` territory (or a project-declared sensitive
type/path) can leave `ready` or `active`, using a `decision` linked to
the packet — closing the gap that let this repo's own frontend and role
model drift unnoticed.

**Architecture:** Extends two existing, already-working mechanisms
instead of building new ones: `packet_definitions` (versioned packet
history, already covers 100% of live packets) and `decisions` (currently
freestanding, gets a `packet_id` FK). A new pure function computes
"novelty" by diffing a packet's `write_set` against every prior
`write_set` in `packet_definitions`. The gate runs at two lifecycle
points (`move ready`, `active → review`) so a write_set that grows into
new territory mid-flight still gets caught.

**Tech Stack:** TypeScript (strict), `better-sqlite3` + drizzle-orm,
Node's built-in test runner, Ajv (`PlaybookConfigSchema`).

## Global Constraints (from the spec, copied verbatim)

- The CLI is the only writer of state (`PRINCIPLE-012`) — no direct DB
  access from anywhere in this plan's code.
- Every fact has one source (`PRINCIPLE-011`) — do not duplicate a table
  or column that already exists; reuse `packet_definitions`/`packet_deps`.
- New commands introduced by this plan use the `packet`/`config` verb,
  never `task` (D9 — `task` is being retired as the generic verb,
  separately, in IDEA-096; this plan must not add new surface under it).
- `decision answer` must reject a non-human session (D7) — reuse the
  `.svp-session-role` check already used by `src/cli/destructive-gate.ts`.
- The gate's mechanism (that it exists, that it re-checks at two points,
  that stale decisions re-block) is never configurable — only *what
  additionally triggers it* is (D10, "invariant vs configurable" table
  in the spec).
- RED-first: every task below writes a failing test before the
  implementation, per this repo's own `PRINCIPLE-002`.
- Run `npm run verify` after every task; it must stay green (baselines
  in `playbook.config.json` must not increase).

---

## File Structure

- **Modify** `src/db/store.migration-manifest.constants.ts` — register
  the new migration ID.
- **Create** `src/db/decision-linkage.migrations.ts` — adds
  `decisions.packet_id`, `decisions.answered_against_version`.
- **Modify** `src/db/store.migrations.ts` — wire the new migration into
  the manifest map.
- **Modify** `src/cli/commands/decision.ts` — persist `--packet`, add
  human-session check to `answer`, add `answered_against_version` on
  answer.
- **Create** `src/tasks/novelty.ts` — pure function: given a candidate
  `write_set` and the repo's full `packet_definitions` history, returns
  whether it touches never-before-seen territory.
- **Create** `src/tasks/novelty.types.ts` — types for the above.
- **Create** `src/tasks/checkpoint-gate.ts` — combines novelty detection
  + config (`requireDecisionForTypes`/`requireDecisionForPaths`) +
  pending/stale decision lookup into one `assertCheckpointClear(store,
  packetId)` function that throws a typed error when blocked.
- **Modify** `src/tasks/service.ts` — call `assertCheckpointClear` at
  `move ready` and at `active → review`.
- **Modify** `src/tasks/service.errors.ts` — add
  `CHECKPOINT_PENDING_DECISION` typed error.
- **Create** `src/cli/commands/packet.ts` — new `packet history`/
  `packet diff` command (D9: new surface uses `packet`, not `task`).
- **Create** `src/cli/commands/config.ts` — new `config get`/`set`/`list`
  command (IDEA-097).
- **Modify** `src/cli/command-registry` (wherever commands are
  registered — same place `decision`/`task` are registered today) —
  register `packet` and `config`.
- **Modify** `src/schema/config.constants.ts` — add
  `ComplexityCheckpointConfigSchema`, wire into `TasksConfigSchema`.
- **Modify** `src/schema/config.types.ts` — add the inferred type.
- **Modify** `src/tasks/amend.ts` — remove the `writeFileSync(row.path,
  generatePacketDocument(...))` calls (Sección 7 of the spec).
- **Modify** `playbook.config.json` — add the new `tasks.complexityCheckpoint`
  default block.

---

### Task 1: Migration — `decisions.packet_id` and `decisions.answered_against_version`

**Files:**
- Create: `src/db/decision-linkage.migrations.ts`
- Modify: `src/db/store.migration-manifest.constants.ts`
- Modify: `src/db/store.migrations.ts`
- Test: `src/db/decision-linkage.migrations.test.ts`

**Interfaces:**
- Produces: `addDecisionLinkage(db: Database.Database): void` — exported
  from `decision-linkage.migrations.ts`, same shape as
  `addVersionedWorkDefinitions` in `work-definition.migrations.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/db/decision-linkage.migrations.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { addDecisionLinkage } from './decision-linkage.migrations.js';

test('addDecisionLinkage adds packet_id and answered_against_version columns to decisions', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE decisions (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE packets (id TEXT PRIMARY KEY)`);
  db.prepare('INSERT INTO packets (id) VALUES (?)').run('PKT-1');
  db.prepare(
    "INSERT INTO decisions (id, question, created_at, updated_at) VALUES ('DEC-1', 'q', 'now', 'now')",
  ).run();

  addDecisionLinkage(db);

  db.prepare('UPDATE decisions SET packet_id = ?, answered_against_version = ? WHERE id = ?')
    .run('PKT-1', 1, 'DEC-1');
  const row = db.prepare('SELECT packet_id, answered_against_version FROM decisions WHERE id = ?').get('DEC-1');
  assert.deepEqual(row, { packet_id: 'PKT-1', answered_against_version: 1 });
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/db/decision-linkage.migrations.test.js`
Expected: FAIL — `Cannot find module './decision-linkage.migrations.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/db/decision-linkage.migrations.ts
import type Database from 'better-sqlite3';
import { migrateTableColumn } from './store.migration-helpers.js';
import { SQLITE_COLUMN_TYPE } from './schema-vocabulary.constants.js';

export function addDecisionLinkage(db: Database.Database): void {
  migrateTableColumn(db, 'decisions', 'packet_id', SQLITE_COLUMN_TYPE.TEXT, false);
  migrateTableColumn(db, 'decisions', 'answered_against_version', 'INTEGER', false);
}
```

Then register it — add a new entry to `STORE_MIGRATION_ID` in
`src/db/store.migration-manifest.constants.ts` (follow the exact pattern
of `VERSIONED_WORK_DEFINITIONS`: add the id constant, append it to
`STORE_MIGRATION_IDS` at the end of the array — order matters, it drives
`SCHEMA_VERSION`), then in `src/db/store.migrations.ts` import
`addDecisionLinkage` and add
`[STORE_MIGRATION_ID.DECISION_LINKAGE]: addDecisionLinkage` to the
migration map next to `VERSIONED_WORK_DEFINITIONS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/db/decision-linkage.migrations.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/db/decision-linkage.migrations.ts src/db/decision-linkage.migrations.test.ts src/db/store.migration-manifest.constants.ts src/db/store.migrations.ts
git commit -m "feat(checkpoint): add decisions.packet_id + answered_against_version migration"
```

---

### Task 2: `decision ask --packet` persists the link (closes IDEA-091)

**Files:**
- Modify: `src/cli/commands/decision.ts`
- Test: `src/cli/commands/decision.test.ts`

**Interfaces:**
- Consumes: `decisions.packet_id` column from Task 1.
- Produces: `handleAsk` now validates `--packet <ID>` exists in `packets`
  before persisting (fail closed — same pattern as `context add`
  validating `--kind`, per IDEA-069's fix already shipped in this repo).

- [ ] **Step 1: Write the failing test**

```typescript
// add to src/cli/commands/decision.test.ts
test('decision ask --packet persists the packet_id link', () => {
  // ...use this file's existing test harness/fixture setup for opening a
  // temp store, matching the pattern already in this file...
  run(['ask', '--packet', 'PKT-1', 'is this the right approach?']);
  const shown = captureOutput(['show', 'DEC-1']);
  assert.match(shown, /packet: PKT-1/);
});

test('decision ask --packet rejects an unknown packet id', () => {
  const exitCode = run(['ask', '--packet', 'NOPE-1', 'question?']);
  assert.equal(exitCode, EXIT.GATE_FAIL);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/cli/commands/decision.test.js`
Expected: FAIL — no `packet:` line in `show` output, unknown-packet case
not rejected.

- [ ] **Step 3: Write minimal implementation**

In `handleAsk`, after parsing `--packet`, look up the packet and reject
if missing; in the `INSERT INTO decisions` statement, add the
`packet_id` column and bind `parsed.values.packet ?? null`. In
`handleShow`, add a `packet:` output line when `packet_id` is not null
(mirror the existing `answer:` conditional line).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/cli/commands/decision.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/cli/commands/decision.ts src/cli/commands/decision.test.ts
git commit -m "fix(checkpoint): decision ask --packet now persists and validates the link (IDEA-091)"
```

---

### Task 3: `decision answer` requires a human session (D7)

**Files:**
- Modify: `src/cli/commands/decision.ts`
- Test: `src/cli/commands/decision.test.ts`

**Interfaces:**
- Consumes: the session-role check already used in
  `src/cli/destructive-gate.ts` (read `.svp-session-role` in the repo
  root, compare against the expected human marker — mirror that file's
  exact check rather than re-deriving it).
- Produces: `handleAnswer` rejects with a typed message when the session
  role file is missing or says a non-human role, and additionally sets
  `answered_against_version` to the packet's current `packet_definitions`
  version at the moment of answering (0 if the decision has no linked
  packet).

- [ ] **Step 1: Write the failing test**

```typescript
test('decision answer rejects a non-human session', () => {
  writeFileSync(join(root, '.svp-session-role'), 'agent\n', 'utf8');
  const exitCode = run(['answer', 'DEC-1', 'yes, approved']);
  assert.equal(exitCode, EXIT.GATE_FAIL);
});

test('decision answer records answered_against_version from the linked packet', () => {
  writeFileSync(join(root, '.svp-session-role'), 'human\n', 'utf8');
  run(['ask', '--packet', 'PKT-1', 'ok to proceed?']);
  run(['answer', 'DEC-1', 'yes']);
  const shown = captureOutput(['show', 'DEC-1']);
  assert.match(shown, /answered_against_version: 1/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/cli/commands/decision.test.js`
Expected: FAIL — non-human session is accepted today; no
`answered_against_version` output.

- [ ] **Step 3: Write minimal implementation**

Import the same session-role read helper `destructive-gate.ts` uses (if
it's not already exported as a standalone function, extract it into a
shared module `src/cli/session-role.ts` first — this is a same-task
refactor, not a new task, since both call sites need identical logic per
`PRINCIPLE-011`). In `handleAnswer`, before updating the row: reject if
role isn't human; if `dec.packetId` is set, look up the packet's current
`packet_definitions` max version and pass it into the `UPDATE` alongside
the answer text.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/cli/commands/decision.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/cli/commands/decision.ts src/cli/commands/decision.test.ts src/cli/session-role.ts
git commit -m "feat(checkpoint): decision answer requires a human session (D7)"
```

---

### Task 4: Novelty detection — `src/tasks/novelty.ts`

**Files:**
- Create: `src/tasks/novelty.ts`
- Create: `src/tasks/novelty.types.ts`
- Test: `src/tasks/novelty.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // novelty.types.ts
  export interface NoveltyCheckInput {
    readonly candidateWriteSet: readonly string[];
    readonly priorWriteSets: readonly (readonly string[])[];
  }
  export interface NoveltyResult {
    readonly isNovel: boolean;
    readonly newPatterns: readonly string[];
  }
  ```
  ```typescript
  // novelty.ts
  export function detectNovelty(input: NoveltyCheckInput): NoveltyResult;
  ```
  Pure function, no DB access — the caller (Task 6) is responsible for
  loading `priorWriteSets` from `packet_definitions`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tasks/novelty.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNovelty } from './novelty.js';

test('detects a glob pattern never seen in prior packets', () => {
  const result = detectNovelty({
    candidateWriteSet: ['src/serve/assets/**'],
    priorWriteSets: [['src/tasks/**'], ['src/db/**']],
  });
  assert.equal(result.isNovel, true);
  assert.deepEqual(result.newPatterns, ['src/serve/assets/**']);
});

test('does not flag a pattern seen in any prior packet', () => {
  const result = detectNovelty({
    candidateWriteSet: ['src/tasks/**'],
    priorWriteSets: [['src/tasks/**'], ['src/db/**']],
  });
  assert.equal(result.isNovel, false);
  assert.deepEqual(result.newPatterns, []);
});

test('a mix of seen and new patterns is still novel, reporting only the new ones', () => {
  const result = detectNovelty({
    candidateWriteSet: ['src/tasks/**', 'src/serve/assets/**'],
    priorWriteSets: [['src/tasks/**']],
  });
  assert.equal(result.isNovel, true);
  assert.deepEqual(result.newPatterns, ['src/serve/assets/**']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tasks/novelty.test.js`
Expected: FAIL — `Cannot find module './novelty.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/tasks/novelty.ts
import type { NoveltyCheckInput, NoveltyResult } from './novelty.types.js';

export function detectNovelty({ candidateWriteSet, priorWriteSets }: NoveltyCheckInput): NoveltyResult {
  const seen = new Set(priorWriteSets.flat());
  const newPatterns = candidateWriteSet.filter((pattern) => !seen.has(pattern));
  return { isNovel: newPatterns.length > 0, newPatterns };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tasks/novelty.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/tasks/novelty.ts src/tasks/novelty.types.ts src/tasks/novelty.test.ts
git commit -m "feat(checkpoint): pure novelty-detection function (D10)"
```

---

### Task 5: Config schema — `tasks.complexityCheckpoint`

**Files:**
- Modify: `src/schema/config.constants.ts`
- Modify: `src/schema/config.types.ts`
- Modify: `playbook.config.json`
- Test: `src/schema/config.constants.test.ts` (create if it doesn't exist
  yet — check first; if a config schema test file already exists, add to
  it instead per `PRINCIPLE-011`)

**Interfaces:**
- Produces: `ComplexityCheckpointConfigSchema`, exported type
  `ComplexityCheckpointConfig` with fields `enabled: boolean`,
  `requireDecisionForTypes: string[]`, `requireDecisionForPaths: string[]`.

- [ ] **Step 1: Write the failing test**

```typescript
test('TasksConfigSchema accepts a complexityCheckpoint block with defaults', () => {
  const parsed = parsePlaybookConfig({
    ...validBaseConfigFixture,
    tasks: { leaseTtlMs: 1800000, complexityCheckpoint: { enabled: true, requireDecisionForTypes: [], requireDecisionForPaths: [] } },
  });
  assert.equal(parsed.tasks.complexityCheckpoint.enabled, true);
});
```

(Use whatever parse/validate entrypoint this repo's existing config
tests already call — check `src/schema/config.constants.test.ts` or
wherever `PlaybookConfigSchema` is exercised today before writing this,
per D8: grep for `PlaybookConfigSchema` usage first and match the
existing test's exact helper names instead of inventing new ones.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/schema/config.constants.test.js`
Expected: FAIL — schema validation error, unknown property
`complexityCheckpoint`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// config.constants.ts — add near TasksConfigSchema
export const ComplexityCheckpointConfigSchema = s.object({
  enabled: s.boolean(),
  requireDecisionForTypes: s.array(s.string()),
  requireDecisionForPaths: s.array(s.string()),
});

export const TasksConfigSchema = s.object({
  leaseTtlMs: s.positiveInteger(),
  complexityCheckpoint: ComplexityCheckpointConfigSchema,
});
```

Add the matching `ComplexityCheckpointConfig` type export in
`config.types.ts` (same pattern as the other `s.Infer<typeof ...>`
exports in that file), and add the default block to
`playbook.config.json`:

```json
"tasks": {
  "leaseTtlMs": 1800000,
  "complexityCheckpoint": {
    "enabled": true,
    "requireDecisionForTypes": [],
    "requireDecisionForPaths": []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/schema/config.constants.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/schema/config.constants.ts src/schema/config.types.ts playbook.config.json src/schema/config.constants.test.ts
git commit -m "feat(checkpoint): add tasks.complexityCheckpoint config schema"
```

---

### Task 6: The gate — `src/tasks/checkpoint-gate.ts`

**Files:**
- Create: `src/tasks/checkpoint-gate.ts`
- Modify: `src/tasks/service.errors.ts`
- Test: `src/tasks/checkpoint-gate.test.ts`

**Interfaces:**
- Consumes: `detectNovelty` (Task 4), `ComplexityCheckpointConfig` (Task
  5), `decisions.packet_id`/`answered_against_version` (Tasks 1-3),
  `packet_definitions` (existing).
- Produces:
  ```typescript
  export function assertCheckpointClear(store: Store, packetId: string): void;
  ```
  Throws `CheckpointPendingDecisionError` (new, in `service.errors.ts`,
  same pattern as the existing `LifecycleError`) when: (a) novelty is
  detected and no linked decision is answered-and-current, or (b) the
  packet's type/write_set matches `requireDecisionForTypes`/
  `requireDecisionForPaths` and the same condition holds. "Answered and
  current" means: a `decisions` row with this `packet_id`, non-null
  `answer`, and `answered_against_version` equal to the packet's current
  max version in `packet_definitions`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/tasks/checkpoint-gate.test.ts
test('blocks when write_set is novel and no decision is linked', () => {
  // seed a store with one prior packet (write_set src/db/**) and a new
  // packet PKT-2 with write_set src/serve/assets/** and no decisions row
  assert.throws(() => assertCheckpointClear(store, 'PKT-2'), CheckpointPendingDecisionError);
});

test('passes when the novel write_set has an answered, current decision', () => {
  // decisions row: packet_id=PKT-2, answer='approved', answered_against_version=1
  // PKT-2 is still at version 1 in packet_definitions
  assert.doesNotThrow(() => assertCheckpointClear(store, 'PKT-2'));
});

test('blocks again when the packet was amended after the decision was answered', () => {
  // same as above, but PKT-2 now has version 2 in packet_definitions
  assert.throws(() => assertCheckpointClear(store, 'PKT-2'), CheckpointPendingDecisionError);
});

test('does not block when the checkpoint is disabled in config', () => {
  // config.tasks.complexityCheckpoint.enabled = false
  assert.doesNotThrow(() => assertCheckpointClear(store, 'PKT-2'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tasks/checkpoint-gate.test.js`
Expected: FAIL — `Cannot find module './checkpoint-gate.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/tasks/checkpoint-gate.ts
import { eq } from 'drizzle-orm';
import type { Store } from '../db/store.types.js';
import { detectNovelty } from './novelty.js';
import { CheckpointPendingDecisionError } from './service.errors.js';
import { packetDefinitions, packets, decisions } from './schema.constants.js'; // adjust to this repo's actual drizzle table exports — verify exact names via grep before writing
import { loadPlaybookConfig } from '../schema/config.js'; // adjust to the real config-loading entrypoint — verify via grep

export function assertCheckpointClear(store: Store, packetId: string): void {
  const config = loadPlaybookConfig(/* repoRoot */).tasks.complexityCheckpoint;
  if (!config.enabled) return;

  const packet = store.orm.select().from(packets).where(eq(packets.id, packetId)).get();
  if (packet === undefined) return;

  const allDefinitions = store.orm.select().from(packetDefinitions).all();
  const priorWriteSets = allDefinitions
    .filter((row) => row.packetId !== packetId)
    .map((row) => JSON.parse(row.definitionJson).writeSet as string[]);
  const currentDefinition = allDefinitions
    .filter((row) => row.packetId === packetId)
    .sort((a, b) => b.version - a.version)[0];
  if (currentDefinition === undefined) return;
  const candidateWriteSet = JSON.parse(currentDefinition.definitionJson).writeSet as string[];

  const novelty = detectNovelty({ candidateWriteSet, priorWriteSets });
  const typeMatch = config.requireDecisionForTypes.includes(packet.type);
  const pathMatch = config.requireDecisionForPaths.some((glob) => candidateWriteSet.includes(glob));

  if (!novelty.isNovel && !typeMatch && !pathMatch) return;

  const linkedDecisions = store.orm.select().from(decisions).where(eq(decisions.packetId, packetId)).all();
  const allAnsweredAndCurrent = linkedDecisions.length > 0 && linkedDecisions.every(
    (d) => d.answer !== null && d.answeredAgainstVersion === currentDefinition.version,
  );
  if (!allAnsweredAndCurrent) {
    throw new CheckpointPendingDecisionError(packetId, novelty.newPatterns);
  }
}
```

(Table/column names above are best-effort from this session's reading of
`src/tasks/schema.constants.ts` and `src/db/store.constants.ts` — the
implementer MUST grep the actual exported drizzle table objects and
config-loader function name before writing this file, per D8, since
exact export names weren't independently re-verified for this plan.)

Add to `service.errors.ts`:

```typescript
export class CheckpointPendingDecisionError extends LifecycleError {
  constructor(packetId: string, newPatterns: readonly string[]) {
    super(
      `packet ${packetId} touches new territory: ${newPatterns.join(', ')}`,
      'link and answer a decision for this packet before it can proceed',
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tasks/checkpoint-gate.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/tasks/checkpoint-gate.ts src/tasks/checkpoint-gate.test.ts src/tasks/service.errors.ts
git commit -m "feat(checkpoint): assertCheckpointClear gate function"
```

---

### Task 7: Wire the gate into `move ready` and `active → review`

**Files:**
- Modify: `src/tasks/service.ts`
- Test: `src/tasks/service.test.ts`

**Interfaces:**
- Consumes: `assertCheckpointClear` (Task 6).

- [ ] **Step 1: Write the failing test**

```typescript
test('task move ready refuses a packet with a pending checkpoint decision', () => {
  // packet with novel write_set, no decision
  assert.throws(() => moveTask(store, 'PKT-2', 'ready'), CheckpointPendingDecisionError);
});

test('task move review re-checks the checkpoint if the packet grew mid-flight', () => {
  // packet passed ready before write_set grew into new territory while active
  assert.throws(() => moveTask(store, 'PKT-2', 'review'), CheckpointPendingDecisionError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tasks/service.test.js`
Expected: FAIL — both transitions succeed today.

- [ ] **Step 3: Write minimal implementation**

Find the existing transition-handling function in `service.ts` (the one
`ALLOWED` gates against) and call `assertCheckpointClear(store,
packetId)` at the top of the branches for `to === STATUS.READY` and
`to === STATUS.REVIEW` (review is the target of the `active → review`
transition), before any other side effect of the move runs.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tasks/service.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/tasks/service.ts src/tasks/service.test.ts
git commit -m "feat(checkpoint): wire assertCheckpointClear into move ready and active->review"
```

---

### Task 8: `packet history` and `packet diff` commands

**Files:**
- Create: `src/cli/commands/packet.ts`
- Test: `src/cli/commands/packet.test.ts`
- Modify: wherever commands are registered (grep for where `decision`'s
  `Command` export is added to the registry — mirror that exact spot)

**Interfaces:**
- Consumes: `packet_definitions` (existing).
- Produces: CLI subcommands `packet history <ID> [--json]`, `packet diff
  <ID> --from <v> --to <v> [--json]`.

- [ ] **Step 1: Write the failing test**

```typescript
test('packet history lists versions oldest to newest with digests', () => {
  const output = captureOutput(['history', 'PKT-1']);
  assert.match(output, /v1\t.+\t[0-9a-f]{8}/);
});

test('packet diff shows the field that changed between two versions', () => {
  const output = captureOutput(['diff', 'PKT-1', '--from', '1', '--to', '2']);
  assert.match(output, /writeSet:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/cli/commands/packet.test.js`
Expected: FAIL — command doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Follow `decision.ts`'s exact structure (`Subcommand` map, `UsageError`,
`withStore` helper) for consistency (`PRINCIPLE-011` — don't invent a
second CLI command shape). `history` selects all `packet_definitions`
rows for the id ordered by version, prints `v<version>\t<created_at>\t<digest[0:8]>`;
`diff` loads the two versions' `definition_json`, parses both, and
prints each top-level key whose JSON-stringified value differs.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/cli/commands/packet.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/cli/commands/packet.ts src/cli/commands/packet.test.ts
git commit -m "feat(checkpoint): packet history and packet diff commands (D9, D6)"
```

---

### Task 9: `config get`/`set`/`list` command

**Files:**
- Create: `src/cli/commands/config.ts`
- Test: `src/cli/commands/config.test.ts`
- Modify: command registry (same spot as Task 8)

**Interfaces:**
- Consumes: `PlaybookConfigSchema` (existing, Ajv).
- Produces: `config get <key>`, `config set <key> <value>`, `config list`.
  `<key>` is a dot path (e.g. `tasks.complexityCheckpoint.enabled`).

- [ ] **Step 1: Write the failing test**

```typescript
test('config get reads a nested key', () => {
  const output = captureOutput(['get', 'tasks.leaseTtlMs']);
  assert.equal(output.trim(), '1800000');
});

test('config set validates against PlaybookConfigSchema before writing', () => {
  const exitCode = run(['set', 'tasks.leaseTtlMs', 'not-a-number']);
  assert.equal(exitCode, EXIT.GATE_FAIL);
});

test('config set writes a valid value and persists it', () => {
  run(['set', 'tasks.complexityCheckpoint.enabled', 'false']);
  const output = captureOutput(['get', 'tasks.complexityCheckpoint.enabled']);
  assert.equal(output.trim(), 'false');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/cli/commands/config.test.js`
Expected: FAIL — command doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Read `playbook.config.json`, resolve the dot path for `get`; for `set`,
apply the change to a clone, re-validate the whole object against
`PlaybookConfigSchema` before writing back to disk (fail closed on any
validation error, matching IDEA-069's precedent already shipped in this
repo).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/cli/commands/config.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/cli/commands/config.ts src/cli/commands/config.test.ts
git commit -m "feat(checkpoint): config get/set/list command (IDEA-097)"
```

---

### Task 10: Stop generating `.md` on packet create/amend (Sección 7)

**Files:**
- Modify: `src/tasks/amend.ts`
- Modify: the packet-creation module (grep for the other
  `generatePacketDocument` call site — `task create`'s handler)
- Test: `src/tasks/amend.test.ts`, and the creation module's test file

**Interfaces:**
- Consumes: nothing new.
- Produces: packet create/amend no longer touch the filesystem for
  `.md` export; `packets.path` becomes nullable (migration, same pattern
  as Task 1).

- [ ] **Step 1: Write the failing test**

```typescript
test('amendPacket does not write a .md file to disk', () => {
  amendPacket(store, docRoot, 'PKT-1', { title: 'new title' });
  assert.equal(existsSync(join(docRoot, 'docs/packets/PKT-1.md')), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/tasks/amend.test.js`
Expected: FAIL — the file still gets written today.

- [ ] **Step 3: Write minimal implementation**

Remove both `writeFileSync(row.path, generatePacketDocument(definition,
body), 'utf8')` calls in `src/tasks/amend.ts` (the `active` branch and
the default branch), and the equivalent call in the packet-creation
handler. Add a migration (mirror Task 1's pattern) that makes
`packets.path` nullable — SQLite requires a table rebuild for dropping
`NOT NULL`; follow the same rebuild-and-copy pattern already used
elsewhere in `store.migrations.ts` for column changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/tasks/amend.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/tasks/amend.ts src/db/store.migrations.ts
git commit -m "feat(checkpoint): stop generating docs/packets/*.md on create/amend (Sección 7)"
```

---

### Task 11: Delete the 185 existing `.md` packet files

**Files:**
- Delete: `docs/packets/*.md` (185 files)

**Interfaces:** none — this is a pure deletion, verified safe by Task 2
of the design's own verification (189/189 packets already have a
`packet_definitions` row, confirmed 2026-07-17).

- [ ] **Step 1: Re-verify coverage is still 100% right before deleting**

Run: `node bin/sv-playbook.js status --json` and confirm the packet count
matches what's in `packet_definitions` (same check done during the
design session — do not skip this even though it passed before; the
store may have changed since).

- [ ] **Step 2: Delete the files**

```bash
git rm docs/packets/*.md
```

- [ ] **Step 3: Run full verify**

Run: `npm run verify` — this MUST still pass; if `check`/`lint` reference
`docs/packets/*.md` anywhere still, that's a signal a step above was
missed, not a reason to skip this step.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(checkpoint): delete docs/packets/*.md — DB is now the sole source (D4)"
```

---

## Self-Review

**Spec coverage:** D1 (checkpoint first) — this plan IS the checkpoint.
D2/D10 (config + novelty) — Tasks 4, 5, 6. D3 (extend `decision`, not
rebuild) — Tasks 1-3. D4 (packets 100% DB) — Tasks 10-11. D5 (append-only
versioning) — already exists, verified in the spec, no task needed. D6
(CLI-only inspection) — Task 8. D7 (human session on answer) — Task 3.
D8 (prior-art evidence) — process requirement on the implementer, not a
shippable task; flagged inline in Task 6 where an implementer must
verify exact names before writing. D9 (packet verb for new commands) —
Tasks 8, 9 use `packet`/`config`, not `task`. Sections 5/6 (edge cases,
evidence) — covered by the test lists in Tasks 3, 6, 7.

**Known gap, intentionally not a task here:** exact drizzle table/column
export names in Task 6 and the config-loader entrypoint name are marked
for implementer verification rather than asserted, because this plan was
written from this session's reading of the schema rather than a fresh
grep at execution time — flagging this explicitly rather than presenting
unverified names as fact.
