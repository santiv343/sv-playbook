# Relocate .svp/ Outside the Repo Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `.svp/` out of the repo working tree into a per-repo
directory under the OS's local-app-data location, so no repo-scoped
destructive command (`rm -rf .svp`, `git clean -fdx`, a careless manual
cleanup) can ever delete the operational store again — closing IDEA-033,
confirmed by a real incident on 2026-07-18 (an agent manually deleted
`.svp/` and its own ad-hoc backup while testing, losing all local
operational history for this session).

**Architecture:** One new function, `resolveStoreRoot(repoRoot)`,
replaces every direct `join(repoRoot, SVP_DIR)` call across the ~9
existing call sites. It computes a stable, collision-resistant directory
under `%LOCALAPPDATA%/sv-playbook/<repo-id>/` (Windows) or
`~/.local/share/sv-playbook/<repo-id>/` (Mac/Linux), where `<repo-id>` is
a SHA-256 hash of the repo's canonical `commonRoot()` path (already the
function this codebase uses to identify a repo uniquely across
worktrees). A one-time migration moves an existing in-tree `.svp/` to the
new location the first time it's detected, then removes the old one —
this only runs if the new location doesn't already have a store, so it's
idempotent and safe to leave in place permanently as a self-healing path
for any repo not yet migrated.

**Tech Stack:** TypeScript (strict), Node's `node:crypto` (sha256),
`node:os` (`homedir`), Node's built-in test runner.

## Global Constraints (from this session's investigation, copied verbatim)

- `commonRoot(startDir)` (`src/db/store.ts:25`) already resolves the
  canonical git common directory across worktrees — reuse it as the
  identity input for the repo-id hash, do not derive identity a second
  way.
- All ~9 current consumers of `SVP_DIR` do `join(repoRoot, SVP_DIR)`
  directly (`src/cli/commands/rebuild.ts`, `src/cli/destructive-gate.ts`,
  `src/daemon/daemon.ts`, `src/db/backup.ts`, `src/db/store.migrations.ts`,
  `src/db/store.ts`) — verified by grep 2026-07-18, re-grep at execution
  time in case this list has moved since this plan was written.
- The migration must be a real move (rename where the source and
  destination are on the same filesystem; copy-then-verify-then-delete
  otherwise), never a silent copy that leaves the old, deletable copy
  behind — that would not fix the actual risk.
- Do not attempt the migration inside a destructive command's own error
  path — it runs proactively, the first time any store-opening code path
  detects an in-tree `.svp/` and no store yet at the new location.
- `.gitignore`'s `.svp/` entry can stay (harmless once nothing writes
  there) — do not spend a task removing it, that's cosmetic.
- Run `npm run verify` after every task; baselines in
  `playbook.config.json` must not increase.
- Every task is RED-first, per this repo's own `PRINCIPLE-002`.
- This is a breaking change for every existing local `.svp/` this repo
  or any adopter has — the migration task (Task 3) is not optional
  polish, it's required for this plan to ship safely.

## Verified state (2026-07-18)

- `SVP_DIR = '.svp'` (`src/db/store.constants.ts:17`) is the single
  source for the directory name — stays the same, only its PARENT
  changes.
- `commonRoot()` shells out to `git rev-parse --git-common-dir` and
  resolves it to an absolute path — this is already the per-repo
  identity anchor used elsewhere in this codebase (worktree detection,
  daemon binding).
- `OS_PLATFORM = { WINDOWS: 'win32' }` (`src/platform.constants.ts`) is
  the existing pattern for OS branching in this codebase — match it
  rather than introducing a new platform-detection idiom.
- No repo-id concept currently exists anywhere in `src/` — this plan
  introduces the first one. It must be a pure function of `commonRoot()`
  output only (no timestamps, no randomness) so the same repo always
  resolves to the same external directory.

---

## File Structure

- **Create** `src/db/store-location.ts` — `resolveStoreRoot(repoRoot)`
  and `repoId(commonRootPath)`.
- **Create** `src/db/store-location.types.ts` — if the return shape needs
  more than a plain string, otherwise skip this file (don't create an
  empty types file — check after Task 1 whether it's warranted).
- **Modify** `src/db/store.constants.ts` — no change to `SVP_DIR` itself;
  may add a constant for the local-app-data subdirectory name
  (`sv-playbook`) if not already present as a literal somewhere.
- **Modify** the ~9 call sites listed in Global Constraints to call
  `resolveStoreRoot(repoRoot)` instead of `join(repoRoot, SVP_DIR)`.
- **Create** `src/db/store-migration-relocate.ts` — the one-time
  in-tree-to-external move, invoked from wherever the store is first
  opened (`src/db/store.ts`'s `openStore`-equivalent entrypoint — confirm
  the exact function name by reading the file, don't guess).

---

### Task 1: `resolveStoreRoot` — pure path computation, no I/O

**Files:**
- Create: `src/db/store-location.ts`
- Test: `src/db/store-location.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export function repoId(canonicalCommonRoot: string): string;
  export function resolveStoreRoot(canonicalCommonRoot: string): string;
  ```
  Both pure functions — no filesystem access, no `commonRoot()` call
  inside them (the caller passes the already-resolved path; this task
  does not touch git).

- [ ] **Step 1: Write the failing test**

```typescript
// src/db/store-location.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repoId, resolveStoreRoot } from './store-location.js';

test('repoId is deterministic for the same input', () => {
  assert.equal(repoId('C:/Users/santi/Desktop/projects/sv-playbook'), repoId('C:/Users/santi/Desktop/projects/sv-playbook'));
});

test('repoId differs for different repos', () => {
  assert.notEqual(repoId('C:/repo-a'), repoId('C:/repo-b'));
});

test('resolveStoreRoot on Windows uses LOCALAPPDATA', () => {
  const original = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = 'C:/Users/santi/AppData/Local';
  try {
    const result = resolveStoreRoot('C:/Users/santi/Desktop/projects/sv-playbook');
    assert.match(result, /AppData[\\/]Local[\\/]sv-playbook[\\/][0-9a-f]{16}$/);
  } finally {
    if (original === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = original;
  }
});
```

(This test assumes Windows since that's this session's confirmed
platform — the implementer must also add an equivalent
non-Windows/XDG-path test; do not skip the other platform just because
this environment is Windows.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/db/store-location.test.js`
Expected: FAIL — `Cannot find module './store-location.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/db/store-location.ts
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OS_PLATFORM } from '../platform.constants.js';

const APP_DIR_NAME = 'sv-playbook';
const REPO_ID_LENGTH = 16;

export function repoId(canonicalCommonRoot: string): string {
  return createHash('sha256').update(canonicalCommonRoot).digest('hex').slice(0, REPO_ID_LENGTH);
}

export function resolveStoreRoot(canonicalCommonRoot: string): string {
  const id = repoId(canonicalCommonRoot);
  if (process.platform === OS_PLATFORM.WINDOWS) {
    const base = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
    return join(base, APP_DIR_NAME, id);
  }
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(base, APP_DIR_NAME, id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/db/store-location.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/db/store-location.ts src/db/store-location.test.ts
git commit -m "feat(store-location): resolveStoreRoot — external, deterministic per-repo path (IDEA-033)"
```

---

### Task 2: Wire `resolveStoreRoot` into every `SVP_DIR` consumer

**Files:**
- Modify: `src/db/store.ts`, `src/db/backup.ts`, `src/db/store.migrations.ts`,
  `src/cli/commands/rebuild.ts`, `src/cli/destructive-gate.ts`,
  `src/daemon/daemon.ts` (re-verify this exact list against a fresh grep
  before starting — it may have changed since this plan was written)
- Test: each modified file's existing test suite (no new test files —
  extend existing coverage to assert the resolved path is external, not
  `join(repoRoot, '.svp')`)

**Interfaces:**
- Consumes: `resolveStoreRoot` (Task 1).

- [ ] **Step 1: Write the failing test (representative example — repeat pattern per file)**

```typescript
// add to src/db/store.test.ts (or wherever this repo's existing store
// path tests live — check first)
test('the store directory resolves outside the repo tree', () => {
  const repoRoot = '/some/fake/repo';
  // whatever this file's existing pattern is for asserting a resolved
  // path — the key assertion:
  const dir = /* call whatever store.ts now exposes for this */;
  assert.doesNotMatch(dir, /^\/some\/fake\/repo/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build 2>&1 | tail -30` and the relevant test files.
Expected: current code still resolves in-tree, tests fail.

- [ ] **Step 3: Replace `join(repoRoot, SVP_DIR)` with `resolveStoreRoot(commonRoot(repoRoot))` at each call site**

Each site differs slightly in what variable already holds the
common-root value — some already call `commonRoot()` upstream (reuse
that result, don't call it twice), others take a raw `repoRoot`
parameter (call `commonRoot(repoRoot)` once, pass the result through).
Read each file's surrounding function before editing — do not
mechanically find-and-replace without checking whether `commonRoot()`
was already computed nearby.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/db/store.ts src/db/backup.ts src/db/store.migrations.ts src/cli/commands/rebuild.ts src/cli/destructive-gate.ts src/daemon/daemon.ts
git commit -m "feat(store-location): route every SVP_DIR consumer through resolveStoreRoot"
```

---

### Task 3: One-time migration — move an existing in-tree store out

**Files:**
- Create: `src/db/store-migration-relocate.ts`
- Test: `src/db/store-migration-relocate.test.ts`

**Interfaces:**
- Consumes: `resolveStoreRoot` (Task 1).
- Produces:
  ```typescript
  export function relocateStoreIfNeeded(repoRoot: string, commonRootPath: string): void;
  ```
  No-op if no in-tree `.svp/` exists, or if the external location already
  has a store (never overwrites). Otherwise moves the whole directory.

- [ ] **Step 1: Write the failing test**

```typescript
// src/db/store-migration-relocate.test.ts
test('moves an existing in-tree .svp/ to the external location', () => {
  // set up a temp repoRoot with a fake .svp/playbook.sqlite inside it
  // call relocateStoreIfNeeded
  // assert: the external resolveStoreRoot(commonRootPath) now has the file
  // assert: the in-tree .svp/ no longer exists
});

test('is a no-op when the external location already has a store', () => {
  // set up BOTH an in-tree .svp/ AND a pre-existing external store
  // call relocateStoreIfNeeded
  // assert: the in-tree .svp/ is untouched (not silently deleted)
});

test('is a no-op when there is no in-tree .svp/ to migrate', () => {
  // no .svp/ anywhere
  // assert: does not throw, does not create anything
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/db/store-migration-relocate.test.js`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/db/store-migration-relocate.ts
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SVP_DIR } from './store.constants.js';
import { resolveStoreRoot } from './store-location.js';

export function relocateStoreIfNeeded(repoRoot: string, commonRootPath: string): void {
  const inTreePath = join(repoRoot, SVP_DIR);
  if (!existsSync(inTreePath)) return;
  const externalPath = resolveStoreRoot(commonRootPath);
  if (existsSync(externalPath)) return;
  mkdirSync(dirname(externalPath), { recursive: true });
  renameSync(inTreePath, externalPath);
}
```

(`renameSync` across filesystems/drives throws `EXDEV` on some
platforms — the implementer must verify this repo's CI runners and
common local setups don't hit that case, or add a copy-then-delete
fallback; do not ship without checking, since a thrown `EXDEV` here
would look like data loss to whoever hits it.)

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Wire it into the store-opening entrypoint**

Find the function in `src/db/store.ts` that every command path funnels
through to open the store (read the file to find the exact name — do
not guess), and call `relocateStoreIfNeeded(repoRoot, commonRootPath)`
once at the top, before anything else touches the store.

- [ ] **Step 6: Run full verify and commit**

```bash
npm run verify
git add src/db/store-migration-relocate.ts src/db/store-migration-relocate.test.ts src/db/store.ts
git commit -m "feat(store-location): one-time migration moves an in-tree .svp/ to the external location"
```

---

### Task 4: Manual end-to-end verification on this repo's own store

**Files:** none — this is a live verification step, not a code change.

- [ ] **Step 1: Back up this repo's current `.svp/` for real, using the actual command**

```bash
node bin/sv-playbook.js backup state
```

Confirm it reports success and a snapshot file exists before proceeding
— do not rely on a manual `cp`.

- [ ] **Step 2: Run any command that opens the store**

```bash
node bin/sv-playbook.js status
```

- [ ] **Step 3: Confirm the store actually moved**

Check that `.svp/` no longer exists in the repo root (or exists but is
now empty/stale — confirm which, based on how Task 3 was implemented),
and that a new store exists under the resolved external path — print
`resolveStoreRoot` for this repo's `commonRoot()` and check the file is
there.

- [ ] **Step 4: Confirm `status`/`doctor` still report the same data as before the migration**

If the migration preserved the actual database file (not recreated it
empty), packet counts should match what they were before Task 4 Step 1's
backup. If they don't, STOP — do not proceed, the migration has a bug,
report it rather than working around it.

---

## Self-Review

**Spec coverage:** IDEA-033's core ask (move `.svp/` out of the blast
zone of repo-scoped destructive operations) — Tasks 1-3 build the
mechanism, Task 4 verifies it against this repo's own real store, the
one that was actually damaged by the incident that motivated this plan.

**Known gaps, intentionally not resolved here:**
- Cross-filesystem `EXDEV` handling in the migration (Task 3 Step 3)
  is flagged for implementer verification, not assumed solved.
- This plan does not add a SEPARATE "refuse destructive ops on .svp/"
  gate — deliberately, because relocating the directory outside the repo
  tree already makes `rm -rf .svp`/`git clean -fdx` physically unable to
  reach it. Building a second guard on top would be exactly the kind of
  redundant machinery this session has been correcting elsewhere (D8).
- Multi-machine/multi-clone scenarios (the same repo cloned twice on one
  machine, or synced via cloud storage) are not addressed — `commonRoot()`
  resolves to an absolute path, so two clones of the same repo at
  different paths get different external stores today, which may or may
  not be the desired behavior; not decided in this plan, flagged for a
  founder call if it comes up.
