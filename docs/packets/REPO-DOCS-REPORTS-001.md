<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: REPO-DOCS-REPORTS-001
title: living repo documentation and reports from project model
depends_on: ["PROJECT-MODEL-001","SPRINT-DETAIL-001","AGENT-REPORT-001","PLAN-METRICS-001"]
write_set: ["src/reports/**","src/project/**","src/cli/commands/project.ts","src/cli/commands/project.test.ts","src/serve/**","content/cli.md"]
requirements: []
evidence_required: ["final-sha"]
---

﻿## Task
Add living repository documentation and reporting generated from project data, not hand-maintained prose. The founder needs rich context at all times: what the repo is, how work is organized, what sprints exist, what changed, and what reports/decisions exist.

Implement:
1. `repo docs [--json]` or `project docs [--json]` returns a generated documentation bundle from the project model:
   - product/constitution summary;
   - current roadmap/milestones/sprints;
   - sprint summaries and links to sprint detail;
   - task/backlog summary;
   - role/operating model/profile summary;
   - key decisions and open escalations;
   - recent reports and retro summaries;
   - module/CLI command catalog pointers.
2. `repo report [--since <iso|last>] [--sprint <id>] [--json]` returns a rich report: changes, completed tasks, blocked tasks, pending decisions, notifications, metrics, costs, review outcomes, and risks.
3. Serve adds a Docs/Reports view consuming the same builders. It is read-only and highlights related tasks/sprints/decisions.
4. Generated docs may be exported for review, but exports are not the source. The source is DB/config/project model/events.
5. If information is missing, the report says which source event/entity is missing and links to the packet that should emit it. Do not invent narrative.

## RED test
Add a docs/report test named exactly: "repo report summarizes sprints tasks decisions notifications reports and metrics from the project model". Seed project model data and assert the report contains sprint summary, completed task, pending decision, notification, report and metric sections. New command -> missing export/registration is acceptable first failure.
Expected failure cause (literal string in the output): the compiler/module error for the missing repo/project docs command, OR the test name "repo report summarizes sprints tasks decisions notifications reports and metrics from the project model".

## Reuse
PROJECT-MODEL-001, SPRINT-DETAIL-001, SERVE-ACTIVITY-001 digest builder, AGENT-REPORT-001, PLAN-METRICS-001, DECISION-LOG-001, SERVE-NOTIFICATIONS-001, PROFILE-001, CONSTITUTION-001.

## Stop conditions
Hand-maintained docs as source; free-text reports with unverifiable facts; separate serve vs CLI report builders; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
