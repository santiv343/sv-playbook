<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SPRINT-001
title: (v2) sprints: agrupar packets en una unidad con goal y start/close (gradua IDEA-015)
depends_on: ["STORE-MIGRATION-SAFETY-001"]
write_set: ["src/cli/commands/sprint.ts","src/sprints/**","src/cli/registry.ts","src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
(v2) Sprints — group packets into a time-boxed unit with a goal, for cadence and reporting. Add a `sprints` table (id, goal, started_at, closed_at) and a packet->sprint link (a column or join). CLI: `sprint create --goal <g>`, `sprint add <sprint> <packet>...`, `sprint close <sprint>`, `sprint show <sprint>`. `status`/serve can filter the board by the active sprint. A packet may belong to at most one sprint. Graduates IDEA-015. Opinion-free (PRINCIPLE-013): whether sprints are used at all is per-instance config; the engine only provides the capability.

## RED test (write first)
In a sprint test add a test named exactly: "a packet added to a sprint appears in that sprint's board". Create a sprint, add a packet, and assert sprint show lists it. New feature -> missing export.
Expected failure cause (literal string in the output): the compiler/module error for the missing `sprint` export, OR the test name "a packet added to a sprint appears in that sprint's board".

## Reuse
The store/migration path (guarded by STORE-MIGRATION-SAFETY-001); the command registration + status readout.

## Stop conditions
Making sprints mandatory (they are optional per instance); a packet in two sprints; unsafe migration.

## Evidence required at close
red-test-output, verify-root, final-sha.
