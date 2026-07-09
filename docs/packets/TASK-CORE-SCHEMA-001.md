---
id: TASK-CORE-SCHEMA-001
title: schema DB-core: columna body + tabla packet_deps + version bump (la tarea completa vive en la DB)
depends_on: []
write_set: ["src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Prepare the store schema for the DB-as-full-task-SoT model (founder decision 2026-07-09: a task's core — title, description/body, relations — lives in the DB, not a fragile per-task `.md`). Two additions to the packets store:
1. Add column `body TEXT NOT NULL DEFAULT ''` to the `packets` table — it will hold the task description/instructions that today live ONLY in the `.md`.
2. Add table `packet_deps (packet_id TEXT NOT NULL, depends_on_id TEXT NOT NULL, PRIMARY KEY (packet_id, depends_on_id))` — relational dependencies (today deps live only in `.md` frontmatter and are not queryable). This table is also the seed for epic / parent-subtask relations later.

Bump the schema `user_version` by 1 and route it through the EXISTING version guard/migration machinery (STORE-VERSION: refuse-with-named-recovery on mismatch, backup before migrate). Existing rows get `body=''` (backfilled later by `task import`). No command reads/writes the new fields yet — later packets do. Do not change any other behavior.

## RED test (write first)
In src/db/store.test.ts add a test named exactly: "packets store has a body column and a packet_deps table at the bumped schema version". Open a fresh store and assert: `PRAGMA table_info(packets)` includes a `body` column; the `packet_deps` table exists; `PRAGMA user_version` equals the new bumped value. Today there is no body column → it FAILS.
Expected failure cause (literal string in the output): the test name "packets store has a body column and a packet_deps table at the bumped schema version".

## Reuse
Existing schema string + SCHEMA_VERSION in src/db/store.constants.ts; the existing migration/version-guard in src/db/store.ts.

## Stop conditions
Reading or writing the new fields from any command (that is later packets); skipping the version bump or its guard; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
