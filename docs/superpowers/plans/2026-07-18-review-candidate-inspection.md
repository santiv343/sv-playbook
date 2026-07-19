# Review Candidate CLI Inspection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `review candidate list/show` so an operator can find a
candidate's id, SHA, branch, and work-definition version through the CLI
— closing IDEA-059, which caused a real `PRINCIPLE-012` violation
(reading `.svp` SQLite directly to find a candidate id, then
loop-guessing definition versions for `dispatch prepare`, because no CLI
path existed).

**Architecture:** New subcommands on the existing `review` command, thin
wrappers over a new read function in `src/review/review-candidate.ts`.
`review_candidates` (schema confirmed 2026-07-18) already has every field
an operator needs — this is a pure read/format task, no schema change.

**Tech Stack:** TypeScript (strict), drizzle-orm, Node's built-in test runner.

## Global Constraints

- No schema change — `review_candidates` already has `id`, `packet_id`,
  `work_definition_version`, `candidate_sha`, `branch`, `created_at`.
- Follow the exact `Subcommand` map pattern already used by `decision.ts`
  (`SUBCOMMANDS: ReadonlyMap<string, Subcommand>`) for consistency, since
  `review.ts` may use a different internal shape today — check first,
  match whichever pattern is `review.ts`'s own if it already has one,
  don't introduce a third convention.
- Run `npm run verify` after every task.
- Every task is RED-first, per this repo's own `PRINCIPLE-002`.

## Verified state (2026-07-18)

- `src/review/review-candidate.ts` has `persistReviewCandidate` and
  `resolveManualInput` but no read/list function — confirmed by grepping
  `export function` in the file.
- `review_candidates` schema (`src/db/review-candidate.schema.constants.ts:9`):
  `id`, `packet_id`, `work_definition_version`, `work_definition_digest`,
  `candidate_sha`, `branch`, `producer_session_id`, `artifact_id`,
  `created_at`. Immutable (has update/delete-blocking triggers) —
  read-only by design, fits a read-only CLI surface naturally.

---

## File Structure

- **Modify** `src/review/review-candidate.ts` — add
  `listReviewCandidates`/`getReviewCandidate`.
- **Modify** `src/cli/commands/review.ts` — add `candidate list`/
  `candidate show <id>` subcommands (confirm exact existing subcommand
  wiring pattern in this file before adding — read it first).

---

### Task 1: Read functions

**Files:**
- Modify: `src/review/review-candidate.ts`
- Test: `src/review/review-candidate.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface ReviewCandidateSummary {
    readonly id: string;
    readonly packetId: string;
    readonly workDefinitionVersion: number;
    readonly candidateSha: string;
    readonly branch: string;
    readonly createdAt: string;
  }
  export function listReviewCandidates(store: Store, packetId?: string): readonly ReviewCandidateSummary[];
  export function getReviewCandidate(store: Store, id: string): ReviewCandidateSummary | undefined;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
test('listReviewCandidates returns all candidates when no packetId filter is given', () => {
  // seed 2 candidates for different packets, assert both come back
});
test('listReviewCandidates filters by packetId when given', () => {
  // seed 2 candidates, filter by one packetId, assert only that one comes back
});
test('getReviewCandidate returns undefined for an unknown id', () => {
  assert.equal(getReviewCandidate(store, 'RC-NOPE'), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

Query `review_candidates` via `store.orm` (this repo's ORM convention —
grep `persistReviewCandidate` for the exact drizzle table export name
and column-mapping style already used in this file, mirror it exactly
rather than inventing new field-naming).

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/review/review-candidate.ts src/review/review-candidate.test.ts
git commit -m "feat(review): listReviewCandidates/getReviewCandidate read functions (IDEA-059)"
```

---

### Task 2: CLI subcommands

**Files:**
- Modify: `src/cli/commands/review.ts`
- Test: `src/cli/commands/review.test.ts`

**Interfaces:**
- Consumes: `listReviewCandidates`/`getReviewCandidate` (Task 1).

- [ ] **Step 1: Write the failing test**

```typescript
test('review candidate list prints candidate ids and shas', async () => {
  const output = captureOutput(['candidate', 'list']);
  assert.match(output, /RC-.*\t.*\t.*/); // id, sha, branch — match this repo's existing tab-separated list convention (see task.ts's list output for the exact format to mirror)
});
test('review candidate show prints full detail for one candidate', async () => {
  const output = captureOutput(['candidate', 'show', 'RC-1']);
  assert.match(output, /candidate_sha|sha:/i);
});
test('review candidate show on an unknown id reports a typed error', async () => {
  const exitCode = run(['candidate', 'show', 'RC-NOPE']);
  assert.equal(exitCode, EXIT.GATE_FAIL);
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

Add `candidate` as a subcommand group inside `review.ts` (or as its own
top-level `candidate` subcommand if `review.ts` doesn't already nest
subcommands — read the file's existing structure first; do not assume
either shape).

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/cli/commands/review.ts src/cli/commands/review.test.ts
git commit -m "feat(review): candidate list/show CLI subcommands"
```

---

## Self-Review

**Spec coverage:** IDEA-059 — both tasks together give the operator a
CLI path that removes the need to read SQLite directly.
