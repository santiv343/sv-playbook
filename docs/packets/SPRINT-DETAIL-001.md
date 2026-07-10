<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SPRINT-DETAIL-001
title: rich sprint list show and report views for founder re-entry
depends_on: ["SPRINT-002","PROJECT-MODEL-001","SERVE-PLAN-001"]
write_set: ["src/sprints/**","src/project/**","src/cli/commands/sprint.ts","src/cli/commands/sprint.test.ts","src/serve/**","content/cli.md"]
requirements: []
evidence_required: ["final-sha"]
---

﻿## Task
Make sprint information rich and always available. A founder must be able to see which sprints exist, what each is about, what is inside, what is blocked, what decisions are pending, and what happened so far without reading chat or raw packet files.

Implement rich sprint views:
1. CLI:
   - `sprint list [--json]` shows open, queued, closed sprints with goal, narrative summary, progress, WIP, budget/spent, blocked count and pending decision count.
   - `sprint show <SPRINT> [--json]` shows full detail: goal, narrative/why, owner/PM notes, state, dates metadata, budget/spent, WIP, ordered task rows with status/priority, dependencies, blockers, pending decisions, notifications, reports, costs, PRs, last events and retro summary.
   - `sprint report <SPRINT> [--json]` emits a human-readable snapshot suitable for founder re-entry.
2. Serve:
   - `/api/sprints` and `/api/sprints/:id` expose the same builders as CLI.
   - Plan view lists sprints; clicking one opens a sprint detail page/drawer.
   - Related board cards are highlighted when viewing a sprint.
3. Data model additions if needed: sprint `narrative` / `why` field, ordering, and links to decisions/notifications/reports through PROJECT-MODEL-001 rather than ad hoc queries.
4. `start --role founder-interface` shows the open sprint summary and links/pointers to full sprint detail.
5. No chat dependency: all sprint context comes from DB events, reports, decisions, metrics, retro and task definitions.

## RED test
Add a sprint detail test named exactly: "sprint show returns rich detail including tasks backlog blockers decisions reports and metrics". Seed a sprint with tasks, one blocker, one pending decision, one report and one cost event; assert `sprint show --json` returns all linked sections and `sprint list --json` includes the summary counts.
Expected failure cause (literal string in the output): the test name "sprint show returns rich detail including tasks backlog blockers decisions reports and metrics".

## Reuse
SPRINT-002, PROJECT-MODEL-001, SERVE-PLAN-001, SERVE-DETAIL-001, SERVE-NOTIFICATIONS-001, PLAN-METRICS-001, DECISION-LOG-001, AGENT-REPORT-001, RETRO-001, CLI-START-001.

## Stop conditions
Making sprint detail a separate query path from PROJECT-MODEL-001; omitting decisions/notifications/blockers; requiring the founder to read chat or generated packet markdown for context; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
