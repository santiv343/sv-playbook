<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: PROJECT-MODEL-001
title: project entity model: rich relationships for sprints tasks backlog decisions reports
depends_on: ["SPRINT-002","ROADMAP-CMD-001","DECISION-LOG-001","AGENT-REPORT-001","PLAN-METRICS-001","SERVE-NOTIFICATIONS-001"]
write_set: ["src/project/**","src/cli/commands/project.ts","src/cli/commands/project.test.ts","src/status/status.ts","src/status/status.types.ts","src/serve/**","content/cli.md"]
requirements: []
evidence_required: ["final-sha"]
---

﻿## Task
Define the project entity model and relationship read model explicitly, so rich information is available consistently across CLI, start, serve, digest, reports and future docs.

Implement a single entity/read-model contract for:
1. Version/milestone -> sprints -> tasks.
2. Backlog = tasks not assigned to an open/queued sprint, ordered by priority.
3. Task -> dependencies, write_set, lease/session, status, evidence, reports, decisions, notifications, costs, PR/CI, events.
4. Sprint -> goal, narrative/why, state, budget, spent, WIP, ordered tasks, blockers, pending decisions, notifications, metrics, retro summary, created/closed metadata.
5. Role/session -> current responsibility, allowed mutations, active leases, dispatches, reports.
6. Decision/escalation -> linked task/sprint, owner role, status, answer/supersession.
7. Notification -> linked decision/task/sprint and acknowledgement state.
8. Retro/report/metrics -> linked sprint/task and source events.

Deliverables:
- A TypeScript read-model module (for example `src/project/model.ts`) that returns this graph from the store using one builder.
- `project model --json` or equivalent CLI output for agents/tools.
- `check model` validates referential integrity: sprint links reference existing tasks; decisions/notifications reference existing tasks/sprints; no task belongs to two active sprints; backlog derivation is deterministic.
- `serve` and `start` consume this model instead of each inventing their own relationship query.

## RED test
Add a model test named exactly: "project model links milestones sprints tasks backlog decisions notifications reports and metrics". Seed a fixture store with one milestone, one sprint, two tasks, one backlog task, one decision, one notification, one report and one cost event; assert the model returns the graph with correct links and derived backlog.
Expected failure cause (literal string in the output): the compiler/module error for the missing project model module/command, OR the test name "project model links milestones sprints tasks backlog decisions notifications reports and metrics".

## Reuse
SPRINT-002, ROADMAP-CMD-001, DECISION-LOG-001, AGENT-REPORT-001, PLAN-METRICS-001, SERVE-NOTIFICATIONS-001, SERVE-DETAIL-001, status readouts, STORE-001 schemas.

## Stop conditions
Separate relationship queries per surface; storing backlog as a second list instead of deriving it; links that accept unknown entity ids; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
