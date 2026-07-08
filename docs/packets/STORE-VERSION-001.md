---
id: STORE-VERSION-001
title: schema user_version with backup and self-healing rebuild (no dead ends)
depends_on: ["STORE-REBUILD-001"]
write_set: ["src/db/store.ts","src/db/store.test.ts","src/cli/commands/task.ts","src/cli/commands/rebuild.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Versioned schema with refuse-and-recover (PRINCIPLE-010; D26 revised after the 2026-07-08 EPERM mid-heal corruption: clients NEVER heal the shared DB). In src/db/store.ts:
1. Export const SCHEMA_VERSION = 2 (version 1 = pre-write_set schema) and export class StoreVersionError extends Error.
2. openStore: after opening, read PRAGMA user_version. If it equals SCHEMA_VERSION, proceed. If it DIFFERS (lower, including 0, or higher): close the DB immediately and throw StoreVersionError with message `store schema v<found> does not match v<expected>: run sv-playbook rebuild from the main repo with no other sv-playbook processes running`. openStore NEVER deletes, backs up, or modifies an existing DB file - self-healing a SHARED resource from a client caused a mid-flight corruption; `rebuild` is the single explicit recovery actor.
3. New (empty) DBs get user_version = SCHEMA_VERSION on creation.
4. The rebuild command must bypass the check by design (it deletes and recreates the DB): openStore accepts an optional options parameter { skipVersionCheck?: boolean }; only src/cli/commands/rebuild.ts passes true, and rebuild sets user_version = SCHEMA_VERSION on the fresh DB.

## RED test (write first, appended to src/db/store.test.ts)
Test name: "schema version mismatch refuses with the rebuild recovery message".
Body: temp root; openStore, close. Open the sqlite file directly (DatabaseSync) and exec PRAGMA user_version = 1, close. assert.throws(() => openStore(root), /run sv-playbook rebuild/). Then assert openStore(root, { skipVersionCheck: true }) succeeds and can set user_version to SCHEMA_VERSION.
Expected failure cause (literal string in the output): "schema version mismatch refuses with the rebuild recovery message"

## Reuse
src/db/store.ts (openStore, SCHEMA), src/cli/commands/rebuild.ts (wire skipVersionCheck + set the version).

## Stop conditions
Anything outside the write_set; ANY mutation of an existing DB file from openStore (delete/backup/copy/ALTER are all forbidden there).

## Evidence required at close
red-test-output, verify-root, final-sha.

closed: done 2026-07-08T13:34:03.749Z