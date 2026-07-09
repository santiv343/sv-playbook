---
id: STORE-MIGRATION-SAFETY-001
title: migracion segura: backup verificado antes; rechaza si hay lease vivo foraneo (no corromper worktrees concurrentes)
depends_on: ["STORE-BACKUP-CADENCE-001"]
write_set: ["src/db/store.ts","src/db/store.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
A schema migration must never corrupt concurrent workers sharing one `.svp`. Incident root cause: a worker on a branch bumped the shared DB's schema (v2→v3) while other workers ran v2 code → mismatch cascade. Agent-agnostic guard in the store's migration path:
1. Before applying any migration (schema_version bump), create a VERIFIED backup first; if the backup or its verification fails, ABORT the migration (never migrate without a recoverable snapshot).
2. Refuse the migration if any FOREIGN live lease exists (a lease held by a different session/worktree whose heartbeat is within TTL) — a migration proceeds only when the migrating session is the sole active user of the shared store. On refusal, print: `migration blocked: <n> other worktree/session(s) are live on the shared store — pause them or isolate state per worktree before migrating`.

## RED test (write first)
In src/db/store.test.ts add a test named exactly: "schema migration refuses while a foreign live lease exists". Set up a store that needs a migration, insert a fresh lease for a different session id, attempt the migration, and assert it refuses (throws with the block message) and the schema_version is unchanged. Today migrations run unconditionally → it FAILS.
Expected failure cause (literal string in the output): the test name "schema migration refuses while a foreign live lease exists".

## Reuse
The migration/version path in src/db/store.ts; createStateBackup in src/db/backup.ts; LEASE_TTL_MS and the leases table.

## Stop conditions
Migrating without a verified pre-migration backup; migrating with foreign live leases present; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
