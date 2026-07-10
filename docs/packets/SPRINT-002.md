<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SPRINT-002
title: sprints as the agile planning unit: budget, WIP, backlog, retro
depends_on: []
write_set: ["src/sprints/**","src/db/store.ts","src/db/store.constants.ts","src/cli/commands/sprint.ts","src/cli/commands/sprint.test.ts","src/tasks/service.ts","src/tasks/service.test.ts","content/cli.md"]
requirements: []
evidence_required: ["final-sha"]
---

﻿## Task
Use classic agile vocabulary in the product surface: sprint, retro, task, backlog, roadmap. The underlying agent economics are adapted, but the user-facing concept is a sprint. If semantics differ from Scrum/calendar sprints, document the difference where it matters instead of inventing a new primary term.

Implement sprint planning as the coordination unit between milestone/version and task:
1. A `sprints` table + CLI: `sprint create --goal <sentence> --budget <usd> [--wip <n>]`, `sprint add/remove <SPRINT> <TASK-ID>`, `sprint order <SPRINT> <TASK-ID>...`, `sprint show/list`, `sprint close <SPRINT>`.
2. A sprint has: goal, budget cap in USD, optional WIP limit, state (open/closed), ordered task set, created_at/closed_at metadata. Calendar duration is optional metadata/config, not the core pacing mechanism.
3. Backlog = tasks not assigned to any open/queued sprint. Nothing enters work by itself: moving an unassigned task to ready requires an explicit override flag and event.
4. WIP limit is enforced mechanically when tasks start or move active.
5. Budget rolls up from task cost events (PLAN-METRICS-001 formalizes capture). v1 records/displays; hard-stop on budget exhaustion is a separate policy decision.
6. `sprint close` requires all tasks terminal (done/dropped) or explicitly moved back to backlog. Closing triggers `retro` (RETRO-001). Cool-down rule: retro-produced rails are implemented before the next sprint opens, once that gate exists.
7. PM/founder-interface owns sprint membership/order. Delivery orchestrator works the open sprint by default. It may suggest sprint changes, but the suggestion becomes a decision/escalation record; it does not mutate membership/order.
8. `dispatch plan` and `dispatch run` default to the open sprint. `--all` reveals backlog/full board explicitly.
9. Opinion-free: sprint mode is the default profile, not an engine requirement. A team can configure no-sprint/manual flow, but the default shared vocabulary remains agile.
10. Backward compatibility: if old internal/docs references to bet exist, migrate them to sprint or provide a temporary alias only at the CLI edge with deprecation messaging. New docs, commands and UI must not introduce bet terminology.

## RED test
In a sprints test add a test named exactly: "a sprint enforces its wip limit and rolls up task costs against its budget". Create a sprint with wip=1 and two tasks, move one to active, assert starting the second fails naming the sprint WIP limit; record costs on the first task and assert sprint show reports spent against budget.
Expected failure cause (literal string in the output): the compiler/module error for the missing `sprint` command export, OR the test name "a sprint enforces its wip limit and rolls up task costs against its budget".

## Reuse
The packets/packet_deps schema + migration pattern (TASK-CORE-SCHEMA-001); movePacket transition hooks (the WIP check composes with the gates); command registration; the events table; DECISION-LOG-001 for sprint-change suggestions; DISPATCH-PLAN-001/FLOW-001 for open-sprint execution.

## Stop conditions
Introducing `bet` as a primary user-facing term; making calendar time the core semantics; letting tasks slip into ready without a sprint or explicit override; hardcoding sprints as mandatory for every instance; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
