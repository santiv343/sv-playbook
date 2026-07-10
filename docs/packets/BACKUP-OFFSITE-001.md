<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: BACKUP-OFFSITE-001
title: off-machine backups: push verified backups to a configured target + doctor durability line (disk death no longer loses the event history)
depends_on: []
write_set: ["src/backup/**","src/cli/commands/backup.ts","src/cli/commands/backup.test.ts","src/cli/commands/doctor.ts","src/config.ts","src/config.types.ts","src/config.constants.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Close the durability hole above local disk: backups (VACUUM INTO, verified restore) all live on the SAME machine — a disk failure loses the full event history/audit trail; the git floor only recovers definitions + terminal states. Add an off-machine backup path with zero new runtime deps:
1. `backup push [--to <target>]` — copy the latest VERIFIED backup to a configured off-machine target. v1 targets (pick per config, no new deps): a configurable directory (NAS/cloud-synced folder like Dropbox/Drive/OneDrive local mounts) and/or a git ref approach ONLY if explicitly configured (a dedicated orphan branch holding the sqlite blob is acceptable as an opt-in, NOT default — binary blobs in the main history stay forbidden).
2. Cadence: `move done` auto-backup (existing) optionally chains a push per config (`backup.push_on_close: true`); failures are LOUD events, never silent (the backup-collision lesson).
3. `backup verify-remote` — checks the newest pushed copy is restorable (same verified-restore path).
4. `doctor` reports: last local backup age, last pushed age, both targets' health — the founder sees durability status in one line (and serve's Backups view reads the same builder).
Opinion-free: targets/cadence are per-instance config; the engine only guarantees the mechanism.

## RED test (write first)
In a backup-push test add a test named exactly: "backup push copies the latest verified backup to the configured target and records the event". With a fixture target dir configured, run backup push, assert the newest backup file lands there byte-identical, an event records it, and a push with NO configured target fails with the exact config hint. New command -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `backup push` export, OR the test name "backup push copies the latest verified backup to the configured target and records the event".

## Reuse
The backup/restore machinery (BACKUP-VERIFY-RESTORE-001, backup.dir config); the doctor readouts; the events table; the config validation helpers.

## Stop conditions
New runtime dependencies (cloud SDKs — the mounted-folder pattern covers them); committing sqlite blobs to the main branch history; silent push failures; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
