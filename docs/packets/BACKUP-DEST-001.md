---
id: BACKUP-DEST-001
title: backup.dir configurable fuera de .svp (durabilidad local sin git; base del adapter remoto v2)
depends_on: ["BACKUP-VERIFY-RESTORE-001"]
write_set: ["src/config.ts","src/config.types.ts","src/db/backup.ts","src/db/backup.test.ts","src/cli/commands/backup.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Let backups live OUTSIDE .svp/ (durability without git). Today `backupsDir(repoRoot)` is hardcoded to `join(repoRoot, SVP_DIR, BACKUPS_DIR)`, so a lost .svp/ takes every backup with it.

1. Config: add optional `dir?: string` to `BackupConfig` (src/config.types.ts). In `loadBackupConfig` (src/config.ts) read `backup.dir`: if present it must be a string (reuse the string-validation pattern; undefined = omitted, keep it optional — do NOT default it to a path). DEFAULTS.backup does not set `dir`.
2. Resolution: in src/db/backup.ts, `backupsDir` must resolve the configured dir when set — absolute path used as-is, relative path resolved against repoRoot — and fall back to `join(repoRoot, SVP_DIR, BACKUPS_DIR)` when unset. Load the config where the destination is needed and thread the resolved dir through `createStateBackup`, `rawPreRestoreBackup`, `trimBackups`, and `latestStateBackupAgeHours` so ALL of them read/write/trim the same resolved location. `mkdirSync(..., { recursive: true })` the target. Restore reads from the explicit `--file` path (unchanged) but its pre-restore backup lands in the resolved dir.

## RED test (write first)
In src/db/backup.test.ts add a test named exactly: "backups honor a configured backup.dir outside .svp". It: writes a playbook.config.json with `backup.dir` set to a temp directory OUTSIDE the repo's .svp, creates a backup, then asserts the .sqlite landed in that external dir and that .svp/backups contains no backup for it. Run npm test after writing ONLY the test: it FAILS because `backupsDir` ignores config today and writes into .svp/backups.
Expected failure cause (literal string in the output): the test name "backups honor a configured backup.dir outside .svp".

## Reuse
Existing config validation helpers; existing backupsDir call sites.

## Stop conditions
Anything outside the write_set; defaulting `dir` to a hardcoded external path; leaving any backup call site pointing at the old hardcoded dir.

## Evidence required at close
red-test-output, verify-root, final-sha.
