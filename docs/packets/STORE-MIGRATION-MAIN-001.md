<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: STORE-MIGRATION-MAIN-001
title: live-store migrations only from main: workers use fixture DBs, shared .svp migrates post-merge (incident 2026-07-10)
depends_on: []
write_set: ["src/db/store.ts","src/db/store.test.ts","src/db/store.constants.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Close the incident class observed 2026-07-10 (second schema-mismatch event, this time SURVIVED thanks to the recovery guard): a worker implementing a schema-bump packet migrated the LIVE shared .svp from its feature worktree. The guard prevented data loss, but every other checkout still on the old code (including main) was LOCKED OUT of the CLI until the PR merged — the founder-interface could not write a note for ~20 minutes. Migrations of the live DB must only happen from code that is already on main.
1. Rule in the migration path (extends STORE-MIGRATION-SAFETY-001, single source): when the CLI detects the store's schema is OLDER than the code's target, it refuses to auto-migrate unless the running code's HEAD is on the repo's default branch (git branch check) OR an explicit `--migrate-live` flag is passed (founder-level escape hatch, evented).
2. Workers developing a migration NEVER touch the live store: their RED tests run against throwaway fixture DBs (this is already the test convention — assert it: a redteam/test case creates a store fixture and verifies the migration path never resolves to the shared .svp path during tests).
3. The post-merge migration becomes a first-class moment: the first CLI invocation on updated main migrates (verified backup first, per the existing guard) and emits a schema-migrated event for digest/serve.
4. The refusal message for a too-NEW store (current behavior, correct) gains one line: "a migration PR is likely open or just merged — git pull and retry" — turning the lockout into a self-explaining state.

## RED test (write first)
In a migration-safety test add a test named exactly: "auto-migration of an older live store is refused off the default branch without the explicit flag". Simulate code targeting v(N+1) with a v(N) store while the repo fixture is on a feature branch: assert refusal naming the rule; assert it proceeds on the default branch (backup-first), and with --migrate-live on the feature branch (evented). Today the branch check does not exist -> it FAILS.
Expected failure cause (literal string in the output): the test name "auto-migration of an older live store is refused off the default branch without the explicit flag".

## Reuse
STORE-MIGRATION-SAFETY-001's guard (extend, do not fork); the recovery-guard refusal format; the events table; the git helpers used by evidence capture for branch detection.

## Stop conditions
Weakening the existing verified-backup-first rule; a second migration path; making the branch check bypassable silently; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
