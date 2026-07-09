<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FIX-BACKUP-FILENAME-001
title: backup: filename unico (ms/contador) — arregla colision VACUUM INTO que falla el backup en silencio
depends_on: []
write_set: ["src/db/backup.ts","src/db/backup.constants.ts","src/db/backup.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Backups are the PRIMARY durability, and right now they can SILENTLY fail. The auto-backup filename has second granularity (`playbook-YYYYMMDDHHMMSS.sqlite`); when several backups fire within the same second (e.g. closing multiple packets in a loop), `VACUUM INTO` refuses to write an already-existing file and throws `output file already exists`, while the triggering operation's state change still commits — so a backup is expected but never created.

Make every backup filename UNIQUE per call: append a high-resolution component (milliseconds plus a short monotonic counter or random suffix) so two backups in the same second cannot collide. Defense-in-depth: if the resolved target path still somehow exists, VACUUM INTO to a unique temp name and rename into place — never let a name clash fail a backup. Metadata sidecar filename must track the sqlite name.

## RED test (write first)
In src/db/backup.test.ts add a test named exactly: "two backups within the same second get distinct filenames and both succeed". Create two backups in immediate succession (pin/fake the clock to the same second if the test needs determinism), and assert two distinct `.sqlite` backup files exist and neither call threw. Today the second collides and throws → it FAILS.
Expected failure cause (literal string in the output): the test name "two backups within the same second get distinct filenames and both succeed".

## Reuse
The `stamp()` / filename builder and createStateBackup in src/db/backup.ts; BACKUP_PREFIX in backup.constants.ts.

## Stop conditions
Keeping second-granularity names; swallowing a real backup failure (only the name-clash is non-fatal); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
