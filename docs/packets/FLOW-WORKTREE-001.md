---
id: FLOW-WORKTREE-001
title: packet docs resolve to working tree, not common root; clarify worktree ownership
depends_on: []
write_set: ["src/db/store.ts","src/db/store.test.ts","src/tasks/service.ts","src/tasks/service.test.ts","src/cli/commands/task.ts","docs/specs/2026-07-07-sv-playbook-design.md"]
requirements: []
evidence_required: ["final-sha"]
---

## Context
Dogfooding finding (DROP-ROTATE-001 loop): `task create` writes the packet doc to `commonRoot(cwd)/docs/packets`, and `commonRoot` always resolves to the shared main-repo root (parent of `git rev-parse --git-common-dir`), even from a linked worktree. So packet docs always land in main's working tree, breaking the "one worktree per packet" model for the definition file. The DB correctly stays shared at commonRoot, but file artifacts (packet docs) must resolve to the CURRENT working tree. Also: `task start` does not create worktrees (the harness does); spec §10 wording implied it does.

## Task
- `src/db/store.ts`: add `worktreeRoot(startDir)` → `git rev-parse --show-toplevel` (sibling of `commonRoot`).
- `src/tasks/service.ts`: `createPacket` param `repoRoot` → `docRoot` (used only for the doc path); `briefPacket` drops its unused `_repoRoot` param (it reads the stored absolute path already).
- `src/cli/commands/task.ts`: `handleCreate` passes `worktreeRoot(process.cwd())` as docRoot (DB still via `commonRoot`/`withStore`); `handleBrief` drops the repoRoot arg; import `worktreeRoot`.
- `docs/specs/2026-07-07-sv-playbook-design.md` §10: matrix cell "creates lease + worktree" → "creates lease (worktree is created by the harness; CLI records its path)"; add one sentence clarifying the CLI does not spawn worktrees.

## RED
- `worktreeRoot` helper exists and resolves the git toplevel.
- `createPacket` writes to `docRoot/docs/packets/<id>.md`.
- `briefPacket(store, id)` compiles (2-arg).
- No remaining `repoRoot`-as-doc-path conflation in `service.ts`.

## Stop conditions
- `npm run verify` green.
- From a linked worktree, `task create` writes the packet into the worktree's tree (verified structurally via `show-toplevel`).
- Spec no longer claims `start` creates the worktree.

## Evidence
(filled at close)
