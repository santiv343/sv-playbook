<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: TYPED-TASKS-001
title: tasks tipadas + IDs auto-generados por el CLI (prefijo por tipo, cero asignacion a mano); router del rigor por tipo
depends_on: ["STORE-MIGRATION-SAFETY-001"]
write_set: ["src/cli/commands/task.ts","src/tasks/service.ts","src/tasks/service.test.ts","src/tasks/service.constants.ts","src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Tasks get a TYPE, and the CLI generates the ID from the type — hand-assigned IDs caused a real collision and are a CLI-only violation (the orchestrator was inventing IDs). The type is also the future router for type-specific rigor.
1. Schema: add a `type TEXT NOT NULL` column to packets (a migration — go through STORE-MIGRATION-SAFETY-001: verified backup first, refuse with foreign leases).
2. Type -> prefix map in ONE constants source, e.g. { feature: 'FEAT', bug: 'BUG', config: 'CONFIG', docs: 'DOCS', gate: 'GATE', store: 'STORE', flow: 'FLOW', chore: 'CHORE', ... } (extensible).
3. `task create --type <type> --title ... [--write ...]` (NO --id for normal creation): the CLI assigns `<PREFIX>-<NNN>` where NNN is the next number for that prefix (max existing + 1, zero-padded to 3), computed from the store. Store the type on the packet. Reject an unknown --type. Keep an explicit `--id` accepted ONLY for `import`/`rebuild` reconstruction paths, never for normal creation.

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "task create --type feature auto-assigns sequential FEAT ids". Create two packets with `--type feature` and no id, assert the first gets FEAT-001 and the second FEAT-002 (and the type is stored). Today create REQUIRES --id and cannot auto-generate → it FAILS.
Expected failure cause (literal string in the output): the test name "task create --type feature auto-assigns sequential FEAT ids".

## Reuse
createPacket + the id validation in src/tasks/service.ts; the handleCreate flag parsing in src/cli/commands/task.ts; the schema/migration path (guarded by STORE-MIGRATION-SAFETY-001); a new type->prefix constants file.

## Stop conditions
Allowing hand-assigned ids in normal `task create` (only import/rebuild may pass an id); putting the type->prefix map in more than one place; migrating unsafely (use the migration-safety guard); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
