<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: STORE-002
title: rebuild swap-guard: candidate DB + terminal-count comparison before replacing the live store
depends_on: []
write_set: ["src/cli/commands/rebuild*","src/cli/commands/restore.ts","src/cli/commands/doctor*","src/cli/commands/status.ts","src/db/backup*","src/db/store.ts","src/db/inspection.ts","src/status/**"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

## Task
Incident 2026-07-10 (rail already implemented in the recovery pass — this packet tracks and reviews that work): `rebuild --force` failed mid-transaction (created_at NOT NULL, the rebuild never set it) and left the LIVE DB at 0 rows; a later manual importPackets restored 125 packets but ALL as draft — ~65 done states existed only in the DB and were lost until recovered from backup. The implemented rails, to be reviewed and merged:
1. rebuild builds a CANDIDATE DB, validates integrity, compares terminal-packet count against the live DB, and only then swaps — it can no longer replace a rich DB with reconstructed drafts.
2. rebuild sets created_at (the original NOT NULL bug).
3. restore accepts backups of migratable schemas and forces open/migration post-restore.
4. Backups record and verify terminalPacketCount; doctor and status --json flag when the newest backup is semantically poorer than the live DB.
5. busy_timeout set before WAL — fixes `database is locked` on concurrent doctor+status inspections, covered by test.
6. Mojibake cleanup in human output of status/doctor.

## RED test (write first)
Already written in the recovery pass (rebuild.test.ts, backup.test.ts, doctor.test.ts additions). Reviewer must confirm the swap-guard test fails against the pre-recovery rebuild (the guard is the behavior under test) and that terminalPacketCount round-trips through backup metadata.

## Reuse
The recovery-guard refusal format; BACKUP-VERIFY-RESTORE-001 machinery; the events table.

## Stop conditions
Weakening verified-backup-first; a swap path that skips the candidate comparison; touching files outside the write_set.

## Evidence required at close
verify-root, final-sha, review PR approval.
