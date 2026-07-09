<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: RETRO-001
title: (v2) retro de sprint generado desde la tabla de eventos (blockers, deviations, rework, tiempo-por-estado; gradua IDEA-006)
depends_on: ["SPRINT-001"]
write_set: ["src/cli/commands/retro.ts","src/sprints/retro.ts","src/sprints/retro.test.ts","src/cli/registry.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
(v2) Sprint retro — generate a retrospective from the events table, so the learning loop is semi-automated instead of relying on someone remembering. `retro <sprint>` (or `retro --since <date>`) reads events/transitions and reports: packets done/blocked/dropped, blockers hit, deviations recorded, verify cycles + rework per packet, time-per-state, and the incidents that became rails. Output human + `--json`. Graduates IDEA-006. Feeds the taste ledger / decision log: recurring findings become candidate rules.

## RED test (write first)
In a retro test add a test named exactly: "retro summarizes blockers and rework for a sprint from events". Seed a store with a sprint whose packets have block/deviation/verify events, run retro, and assert the report counts the blockers and the rework. New feature -> missing export.
Expected failure cause (literal string in the output): the compiler/module error for the missing `retro` export, OR the test name "retro summarizes blockers and rework for a sprint from events".

## Reuse
The events/transitions tables; the sprint link from SPRINT-001; the status/report builders.

## Stop conditions
Fabricating retro data instead of deriving it from events; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
