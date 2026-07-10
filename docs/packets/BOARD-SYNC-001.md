<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: BOARD-SYNC-001
title: board sync: one deterministic command replaces the hand-generated branch/commit/PR/auto-merge choreography for board exports
depends_on: ["TASK-MD-EXPORT-001"]
write_set: ["src/cli/commands/board.ts","src/cli/commands/board.test.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Kill the hand-generated git choreography for board changes. Today, after CLI board mutations (create/amend/move/note), an agent hand-writes the same sequence every time: branch -> commit the regenerated docs/packets exports -> push -> PR -> enable auto-merge. Every hand-written instance is a chance to get it wrong (wrong branch, missed file, bad title) — founder rule: the less an AI generates by hand, the better.
1. `sv-playbook board sync [--title <T>]` does the whole sequence deterministically: detect dirty generated exports (docs/packets/*.md and future generated dirs); refuse if NON-generated files are dirty (never sweep unrelated work into a board PR); create a branch `board/sync-<utc-timestamp>`; commit with a generated message listing the affected packet IDs and their change kind (created/amended/moved/noted — derived from the events since the last sync, not from prose); push; open the PR with the same generated body; enable squash auto-merge; return to the previous branch.
2. Record a `board-sync` event with the PR number, so digest/serve show it and the next sync knows the cursor.
3. Idempotent: nothing dirty -> "nothing to sync", exit 0.
4. `--dry-run` prints the plan (files, IDs, title) without touching git.
Requires gh + a remote; degrade with a clear message when absent (commit-only mode with --local).

## RED test (write first)
In a board-sync test add a test named exactly: "board sync refuses when non-generated files are dirty and commits only generated exports". In a fixture git repo, dirty one generated export AND one unrelated source file; assert sync REFUSES naming the unrelated file; clean it, run sync --local, and assert the commit contains only the generated export and the message lists the packet ID with its change kind. New command -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `board` command export, OR the test name "board sync refuses when non-generated files are dirty and commits only generated exports".

## Reuse
The generated-export writer (TASK-MD-EXPORT-001) knows the generated paths (single source — export the list, do not re-hardcode); the events table for change kinds + the sync cursor; gh CLI conventions from MERGE-QUEUE-001.

## Stop conditions
Committing anything outside the generated-export paths; hand-assembled commit messages (must derive from events); pushing to main directly; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
