# Role Catalog Self-Heal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A store that has never had `role bootstrap` run on it must not
fail `task move review` (or any other consumer needing the active role
catalog) with a raw contract error — it should self-heal by bootstrapping
the bundled catalog automatically, closing IDEA-087. Real incident: a
live store needed a manual `role bootstrap` before `task move review`
would create a review candidate; the close path failed on the missing
catalog instead of fixing itself.

**Architecture:** `bootstrapBundledRoleCatalog` (already exists, wired to
`sv-playbook role bootstrap`) and `requireActiveRoleCatalog` (already
exists, used by `role receipt`) are the two functions this plan combines:
wherever a consumer today calls something equivalent to
`requireActiveRoleCatalog` and gets a hard failure, it instead tries
that first, and on a "no active catalog" failure, calls
`bootstrapBundledRoleCatalog` once and retries — instead of the operator
having to notice the error and run the command by hand.

**Tech Stack:** TypeScript (strict), Node's built-in test runner.

## Global Constraints

- Self-healing must be narrow: only auto-bootstrap when there is
  genuinely NO active catalog yet (a fresh/never-initialized store) — it
  must never silently override or replace an existing, intentionally
  customized catalog. If an active catalog already exists but is
  otherwise invalid, that is a different failure mode and must still
  surface as an error, not trigger a "fix" that discards a real
  customization.
- Run `npm run verify` after every task.
- Every task is RED-first, per this repo's own `PRINCIPLE-002`.

## Verified state (2026-07-18)

- `bootstrapBundledRoleCatalog` and `requireActiveRoleCatalog` both exist
  and are wired into `sv-playbook role bootstrap`/`role receipt`
  (`src/cli/commands/role.ts:108-118`) — confirmed by reading the file.
- No consumer path (`task move review` or otherwise) currently calls
  either of these proactively before failing — confirmed by grep: no
  self-heal call site exists anywhere in `src/review` or `src/promotion`.
- The exact contract name from the original incident report
  ("review-candidate-v2") does not appear literally in current code —
  it may have been renamed since. Task 1 below confirms the current
  real name and failure path before Task 2 builds the fix.

---

## File Structure

- **Modify** whichever file in `src/tasks/` or `src/review/` actually
  raises the "missing role catalog" error today when `task move review`
  runs on a fresh store (Task 1 identifies the exact file — do not guess
  it here).

---

### Task 1: Confirm the exact current failure path

**Files:** none — investigation only.

- [ ] **Step 1: Reproduce the failure on a genuinely fresh store**

```bash
mkdir /tmp/fresh-svp-test && cd /tmp/fresh-svp-test && git init
node <path-to-repo>/bin/sv-playbook.js task create --type CHORE --title "test" --write "x.ts" --body-file <(echo "## Task\ntest\n## RED test\ntest\n## Stop conditions\ntest\n## Evidence\ntest")
node <path-to-repo>/bin/sv-playbook.js task move <id> ready
node <path-to-repo>/bin/sv-playbook.js task start <id>
node <path-to-repo>/bin/sv-playbook.js task move <id> review
```

Observe the exact error and which function/file raises it (add a stack
trace or read the error's originating call site directly — do not guess
from the message text alone).

- [ ] **Step 2: Confirm `role bootstrap` fixes it**

```bash
node <path-to-repo>/bin/sv-playbook.js role bootstrap
node <path-to-repo>/bin/sv-playbook.js task move <id> review
```

If this doesn't resolve it, the bug has changed shape since IDEA-087 was
logged — STOP and report the new finding rather than building a fix for
the old, no-longer-accurate failure mode.

---

### Task 2: Self-heal at the confirmed failure point

**Files:** determined by Task 1's finding.

**Interfaces:**
- Consumes: `bootstrapBundledRoleCatalog`, `requireActiveRoleCatalog`
  (both existing, confirmed present in `src/roles/catalog.ts` or
  wherever `role.ts` imports them from — check the import line).

- [ ] **Step 1: Write the failing test**

```typescript
test('task move review self-heals a store with no active role catalog', () => {
  // seed a store with a ready-to-review packet but NO role catalog bootstrapped
  // call the move-to-review path
  // assert it succeeds (does not throw the raw contract error)
  // assert an active role catalog now exists, matching the bundled default
});

test('task move review does not touch an existing customized catalog', () => {
  // seed a store WITH an active, customized (non-bundled) role catalog
  // call the move-to-review path
  // assert the catalog is unchanged (not overwritten by the bundled one)
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

At the exact call site Task 1 identified, wrap the existing
"require active catalog" call: try it, and on the specific
"no active catalog" error (not any other error), call
`bootstrapBundledRoleCatalog` once, then retry the original call. Do not
swallow any OTHER error type into this retry path.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Re-run Task 1's live reproduction to confirm the real bug is gone**

- [ ] **Step 6: Run full verify and commit**

```bash
npm run verify
git commit -m "fix(roles): self-heal a missing role catalog instead of failing the review transition (IDEA-087)"
```

---

## Self-Review

**Spec coverage:** IDEA-087 — Task 1 re-confirms the failure still
reproduces as described (the exact contract name may have drifted, this
plan does not assume the original report is still literally accurate);
Task 2 fixes the confirmed path narrowly, without risking an existing
customized catalog.
