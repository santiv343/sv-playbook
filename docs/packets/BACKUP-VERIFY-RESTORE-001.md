---
id: BACKUP-VERIFY-RESTORE-001
title: backups reales: VACUUM INTO snapshot + verify-before-swap atomic restore (no filesystem workaround)
depends_on: []
write_set: ["src/db/**","src/cli/commands/backup.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Make backup WRITE and RESTORE correct SQLite operations, not filesystem workarounds. Two changes, both in src/db/backup.ts.

1. BACKUP WRITE via a consistent SQLite snapshot. Replace the `copyFileSync(dbPath(repoRoot), sqlitePath)` calls in `createStateBackup` and `rawPreRestoreBackup` with a native snapshot: open the live DB with `new DatabaseSync(dbPath(repoRoot))` and run `db.exec("VACUUM INTO '<escaped>'")` where `<escaped>` is the destination path with every single quote doubled (SQLite string-literal escaping), then close. `VACUUM INTO` reads a transactionally consistent image (WAL included) and writes a defragmented, standalone file with no -wal/-shm sidecar, so the `checkpoint(repoRoot)` + `openStore(repoRoot).close()` dance in `createStateBackup` becomes unnecessary and MUST be removed (drop the private `checkpoint` helper if it has no other caller). Behavior otherwise unchanged: same paths, same metadata, same retention/trim.

2. RESTORE verify-before-swap and atomic. In `restoreStateBackup`, BEFORE replacing the live DB, validate the candidate `backupPath`:
   - open it with `new DatabaseSync(backupPath)` (read side) and assert `PRAGMA integrity_check` returns exactly the single row value `ok`;
   - assert `PRAGMA user_version` equals `SCHEMA_VERSION` (imported from ./store.constants.js);
   - if a sibling metadata file (`backupPath` with `.sqlite` replaced by `.json`) exists, assert its `sha256` field equals the actual sha256 of `backupPath`.
   On ANY of these failing, throw a `RestoreError` (new class, see layout) with a message naming what failed and how to recover — and do this BEFORE touching the live DB, so a bad backup never clobbers good data. Only after all checks pass: write the candidate to a temp file in the live DB's directory, then `renameSync` it over the live DB (atomic swap on the same volume) instead of copying onto the live file in place. The pre-restore safety backup of the current live DB stays as-is and still runs first.

`RestoreError extends Error` goes in a NEW file src/db/backup.errors.ts (layout rule: error classes never live in a logic module). Wire its import into backup.ts.

## RED test (write first)
In src/db/backup.test.ts add a test named exactly: "restore refuses a corrupt backup and leaves the live database intact". It: creates a store with one known packet, takes a good backup, writes a garbage/truncated file to some path, then calls `restoreStateBackup(repoRoot, garbagePath, ...)` inside `assert.throws(...)`, and afterward asserts the live DB still opens and still contains the known packet. Run npm test after writing ONLY the test: it FAILS because today `restoreStateBackup` does a blind `copyFileSync` — it does NOT throw and the garbage overwrites the live DB.
Expected failure cause (literal string in the output): the test name "restore refuses a corrupt backup and leaves the live database intact".

## Reuse
Existing sha256/writeMetadata/backupsDir helpers; node:sqlite DatabaseSync; node:fs renameSync/writeFileSync; SCHEMA_VERSION from store.constants.

## Stop conditions
Anything outside the write_set; changing the metadata JSON shape; removing the pre-restore safety backup; weakening the validation to make the RED pass.

## Evidence required at close
red-test-output, verify-root, final-sha.
