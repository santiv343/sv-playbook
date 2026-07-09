---
id: STORE-BACKUP-CADENCE-001
title: backups = durabilidad primaria: retencion con piso, backup-antes-de-migrar, doctor avisa staleness
depends_on: []
write_set: ["src/db/backup.ts","src/db/backup.constants.ts","src/db/backup.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Backups are the PRIMARY durability (founder: restore recovers the full live state that git cannot — events, leases, agent activity for serve). The incident's backup was useless because the only snapshot was taken AFTER the cascade. Make a good pre-incident backup always exist:
1. Retention must NEVER let the newest GOOD backup be replaced by a post-corruption one: keep the last N verified backups (N configurable, default 20) and never delete a verified backup if it would leave fewer than a floor (default 3) verified snapshots.
2. Auto-backup cadence: before every schema migration (coordinate with STORE-MIGRATION-SAFETY-001), before `takeover --force`, on `move done`, and whenever the newest backup exceeds `maxAgeHours`.
3. `doctor` must warn LOUDLY (a distinct non-ok line) when the newest backup is older than `maxAgeHours` OR failed verification — so staleness is visible before it bites.

## RED test (write first)
In src/db/backup.test.ts add a test named exactly: "doctor-facing backup status flags a stale newest backup". Create a backup, artificially age it beyond maxAgeHours, and assert the backup-status helper (the one doctor/status consume) reports a stale/degraded flag rather than ok. Today staleness is reported only as a number with no flag → it FAILS.
Expected failure cause (literal string in the output): the test name "doctor-facing backup status flags a stale newest backup".

## Reuse
createStateBackup / latestStateBackupAgeHours in src/db/backup.ts; backup config (retention/maxAgeHours) in src/config.ts; the doctor/status readouts.

## Stop conditions
Retention that can drop below the verified-snapshot floor; silent staleness (must be a visible flag); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
