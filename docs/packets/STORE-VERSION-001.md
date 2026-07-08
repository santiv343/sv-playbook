---
id: STORE-VERSION-001
title: schema user_version with backup and self-healing rebuild (no dead ends)
depends_on: ["STORE-REBUILD-001"]
write_set: ["src/db/store.ts","src/db/store.test.ts","src/cli/commands/task.ts","src/cli/commands/rebuild.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Self-healing schema (PRINCIPLE-010: no dead ends; D26). In src/db/store.ts:
1. Export const SCHEMA_VERSION = 2 (version 1 = pre-write_set schema).
2. openStore: after opening, read PRAGMA user_version. If it equals SCHEMA_VERSION, proceed. If it is LOWER (including 0 for pre-versioning DBs): close the DB, copy the file to .svp/backups/playbook-corrupt-<ISO-compact-timestamp>.sqlite (mkdir backups), delete the live file, open fresh (schema applies), set PRAGMA user_version = SCHEMA_VERSION, then call rebuildFromFiles(repoRoot, store) from src/tasks/service.ts and echo via console.error exactly: `store auto-rebuilt (schema v<old> -> v<new>)`. If HIGHER: throw with message `store is from a newer sv-playbook; upgrade the package` (that one IS a stop, with a named exit).
3. New DBs get user_version = SCHEMA_VERSION on creation.
Circular import caution: openStore cannot import service.ts (service imports store). Solution: openStore accepts an optional second parameter rebuild?: (repoRoot: string) => void, and the CLI wiring passes it; when absent (unit tests of store alone), auto-heal recreates the schema but skips file rebuild.

## RED test (write first, appended to src/db/store.test.ts)
Test name: "schema version mismatch triggers backup and self-heal".
Body: temp root; openStore, close. Open the sqlite file directly (DatabaseSync) and exec PRAGMA user_version = 1, close. openStore again with a spy rebuild callback; assert the callback was called once, a file exists under .svp/backups/, and PRAGMA user_version on the new store equals SCHEMA_VERSION.
Expected failure cause (literal string in the output): "schema version mismatch triggers backup and self-heal"

## Reuse
src/db/store.ts (openStore, SCHEMA), node:fs (copyFileSync, mkdirSync, rmSync), STORE-REBUILD-001's rebuildFromFiles for the CLI wiring.

## Stop conditions
Anything outside the write_set; migrating data in place (ALTER) - self-heal is always backup+rebuild, never surgery.

## Evidence required at close
red-test-output, verify-root, final-sha.
