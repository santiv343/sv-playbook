# Aged-Store Promotion Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A store created before the GATE-012 promotion schema landed
must get its `promotion_*` tables brought up to the current shape when
opened, instead of failing with `no such column: review_candidate_id` —
closing IDEA-060, a real production failure (first real `promotion run`
failed this exact way; the store was repaired by manual drop/recreate
outside the machinery, a `PRINCIPLE-012` violation).

**Architecture:** `addPromotionTables` (`src/db/promotion.migrations.ts:11`)
today only runs `CREATE TABLE IF NOT EXISTS`, which does nothing for a
table that already exists with an older column set — SQLite's `IF NOT
EXISTS` is a no-op when the table is present, regardless of whether its
columns match. Extend the migration to also run `migrateTableColumn`
(the existing helper already used elsewhere in this codebase for exactly
this kind of backfill) for each column the current schema requires but
an aged table might be missing.

**Tech Stack:** TypeScript (strict), `better-sqlite3`, Node's built-in
test runner.

## Global Constraints

- `migrateTableColumn(db, table, column, type, notNull, defaultValue)`
  (`src/db/store.migration-helpers.ts`) is the existing, already-tested
  mechanism for adding a missing column to an existing table — use it,
  do not write a new ALTER-TABLE helper.
- This must be idempotent — running it against an already-current store
  must be a safe no-op (SQLite tolerates this naturally if
  `migrateTableColumn` already checks column existence before altering —
  confirm that's true by reading it, don't assume).
- Run `npm run verify` after every task.
- Every task is RED-first, per this repo's own `PRINCIPLE-002` — the RED
  state here is a fixture representing a pre-GATE-012 store missing the
  columns.

## Verified state (2026-07-18)

- `addPromotionTables` (`src/db/promotion.migrations.ts:11`) is exactly
  `db.exec(PROMOTION_STORE_SCHEMA)` — no column backfill logic at all
  today.
- `promotion_candidates`'s current full column list (`store.constants.ts:59-71`):
  `candidate_id`, `review_candidate_id`, `task_id`,
  `work_definition_version`, `work_definition_digest`, `base_sha`,
  `candidate_sha`, `config_digest`, `contract_digest`, `created_at`.
- The original incident report also names orphan tables
  `check_attempts`/`adoptions`/`invalidation_records` on aged stores —
  this plan's Task 1 must confirm whether those are still real concerns
  against the CURRENT schema (they may be entirely superseded artifacts
  from an even older schema generation — verify before building repair
  logic for tables that may not exist in any current code path).

---

## File Structure

- **Modify** `src/db/promotion.migrations.ts` — add column backfill
  calls to `addPromotionTables`.
- **Create** `src/db/promotion.migrations.test.ts` (if it doesn't already
  exist — check first) — the aged-fixture regression test IDEA-060
  itself calls for (referenced there as "ENTRY-011 aged-fixture
  regression test").

---

### Task 1: Confirm what "aged" actually means today

**Files:** none — investigation only.

- [ ] **Step 1: Check whether `check_attempts`/`adoptions`/`invalidation_records` still exist anywhere in the current schema**

```bash
grep -rn "check_attempts\|adoptions\|invalidation_records" src/db --include="*.ts"
```

If these don't appear in any CURRENT schema file, they're artifacts of
an even older generation than the one this plan targets — do not build
repair logic for tables the current schema doesn't define; note this
finding and narrow scope to just `promotion_candidates`'s column set.

- [ ] **Step 2: Confirm the exact column set the CURRENT schema requires vs. what an aged store (pre-GATE-012) would have**

Re-read `PROMOTION_STORE_SCHEMA` in full (`store.constants.ts`) to build
the authoritative "current required columns" list — do not trust this
plan's Verified State section as final, it was written from a partial
read.

---

### Task 2: Backfill migration

**Files:**
- Modify: `src/db/promotion.migrations.ts`
- Test: `src/db/promotion.migrations.test.ts`

**Interfaces:**
- Consumes: `migrateTableColumn` (existing).

- [ ] **Step 1: Write the failing test**

```typescript
test('addPromotionTables backfills review_candidate_id onto a pre-GATE-012 promotion_candidates table', () => {
  const db = new Database(':memory:');
  // create promotion_candidates WITHOUT review_candidate_id/work_definition_*,
  // matching a plausible pre-GATE-012 shape (use Task 1's confirmed column list)
  db.exec(`CREATE TABLE promotion_candidates (
    candidate_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    candidate_sha TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  addPromotionTables(db);

  const columns = db.prepare('PRAGMA table_info(promotion_candidates)').all().map((c) => c.name);
  assert.ok(columns.includes('review_candidate_id'));
  assert.ok(columns.includes('work_definition_version'));
  assert.ok(columns.includes('work_definition_digest'));
});

test('addPromotionTables is a no-op on an already-current store', () => {
  const db = new Database(':memory:');
  addPromotionTables(db);
  addPromotionTables(db); // second call must not throw or duplicate anything
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/db/promotion.migrations.test.js`
Expected: FAIL — the aged fixture is missing columns after
`addPromotionTables` runs, since it's currently a pure `CREATE TABLE IF
NOT EXISTS`.

- [ ] **Step 3: Write minimal implementation**

```typescript
export function addPromotionTables(db: Database.Database): void {
  db.exec(PROMOTION_STORE_SCHEMA);
  migrateTableColumn(db, PROMOTION_TABLE.CANDIDATES, 'review_candidate_id', SQLITE_COLUMN_TYPE.TEXT, false);
  migrateTableColumn(db, PROMOTION_TABLE.CANDIDATES, 'work_definition_version', 'INTEGER', false);
  migrateTableColumn(db, PROMOTION_TABLE.CANDIDATES, 'work_definition_digest', SQLITE_COLUMN_TYPE.TEXT, false);
  migrateTableColumn(db, PROMOTION_TABLE.CANDIDATES, 'config_digest', SQLITE_COLUMN_TYPE.TEXT, false);
  migrateTableColumn(db, PROMOTION_TABLE.CANDIDATES, 'contract_digest', SQLITE_COLUMN_TYPE.TEXT, false);
}
```

(Confirm `PROMOTION_TABLE.CANDIDATES`'s exact string value and that
`migrateTableColumn`'s signature matches this call shape before writing
— this session verified the pattern exists but did not re-read its exact
parameter order for this specific call site.)

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/db/promotion.migrations.ts src/db/promotion.migrations.test.ts
git commit -m "fix(promotion): backfill missing columns on aged pre-GATE-012 stores (IDEA-060)"
```

---

## Self-Review

**Spec coverage:** IDEA-060 (aged-store promotion migration) — Task 1
narrows scope honestly instead of assuming the original incident
report's every detail still applies; Task 2 delivers the fix with a real
regression fixture (the "ENTRY-011 aged-fixture regression test" the
original idea explicitly asked for).
