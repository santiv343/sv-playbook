<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: STORE-004
title: v9: destructive events into the events table, sidecar log backfilled and retired
depends_on: []
write_set: ["src/db/store.ts","src/db/store.test.ts","src/db/store.constants.ts","src/cli/destructive-gate*","src/cli/commands/task.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Required follow-up from the PR #130 review (GATE-001 merged with an adjudicated interim): destructive events live in a sidecar log (.svp-destructive-events.log, free text) because adding 'destructive' to the events CHECK required a v9 migration forbidden in that packet. Finish the class:
1. Schema v9 migration (events-table rebuild per ENTRY-008: bump SCHEMA_VERSION, openStore case, CREATE events_new with EVENT_COMMANDS including 'destructive' - the constant EVENT_DESTRUCTIVE is already staged in service.constants.ts:28 - INSERT...SELECT, DROP, RENAME, user_version=9). Migration test against a v8 fixture per the established pattern.
2. destructive-gate writes to the events table (sessionless events allowed) and RETIRES the sidecar log; import/backfill existing sidecar lines into events during the migration (parse best-effort; malformed lines land as a single 'destructive-legacy' event with the raw text).
3. Serve/digest read destructive events from the same builders as every other event (no special path).
4. Wire or drop the dead metadata found in review: destructiveSubcommands (task.ts:364) either consumed by the dispatcher or removed; fix the gate-ordering noise (gate fires before subcommand usage validation).
LIVE-STORE SAFETY: this IS a schema-bump packet - the migration gate (STORE-MIGRATION-MAIN-001, merged) now enforces main-branch-only auto-migration; tests on fixtures only; never run the new code's CLI against the live store from the worktree.

## RED test (write first)
In a migration test add a test named exactly: "v9 migration admits destructive events and backfills the sidecar log". v8 fixture store + a sidecar log with 2 lines: open with v9 code (fixture on default branch or --migrate-live), assert migration runs, an EVENT_DESTRUCTIVE inserts cleanly, the 2 sidecar lines exist as events, and the sidecar file is renamed/retired. Today no v9 case exists -> it FAILS.
Expected failure cause (literal string in the output): the test name "v9 migration admits destructive events and backfills the sidecar log".

## Reuse
The v7->v8 events rebuild migration (same table-rebuild mechanics); STORE-MIGRATION-MAIN-001's branch gate and backup-first (do not weaken); EVENT_DESTRUCTIVE constant; destructive-gate.ts.

## Stop conditions
Weakening the migration gate or verified-backup-first; a second events write path; leaving both the sidecar AND table paths active (the table wins, sidecar retires); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
