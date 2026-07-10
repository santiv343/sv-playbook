<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SERVE-NOTIFICATIONS-001
title: serve notifications: pending decisions and highlighted related tasks
depends_on: ["DECISION-LOG-001","FLOW-002","SERVE-001"]
write_set: ["src/serve/**","src/notifications/**","src/cli/commands/notification.ts","src/cli/commands/notification.test.ts","src/status/status.ts","src/status/status.types.ts","content/cli.md"]
requirements: []
evidence_required: ["final-sha"]
---

﻿## Task
Add in-app notifications to serve for decisions/escalations and related board highlighting. For now the notification channel is serve itself, not Slack/email/OS notifications.

Implement:
1. A single notifications read model built from DB events/decisions/duties: pending decisions, blocked tasks needing founder input, failed duties over tolerance, review items requiring attention, and system warnings from doctor/check surfaces.
2. `GET /api/notifications` returns notifications with: id, severity, kind, title, body, related task ids, related decision id, created_at, acknowledged_at if applicable.
3. The serve UI renders a notifications area/badge visible from every view. Unacknowledged critical notifications are visually prominent.
4. Board integration: any task related to an active notification is highlighted in its column; task detail shows the related notification/decision/escalation context.
5. Acknowledge/dismiss remains a CLI write path (`notification ack <id>` or decision answer clears it); serve must not write directly unless/until there is a CLI-backed control adapter.
6. Same builder feeds `start`/digest later; no duplicate notification queries.

## RED test
Add a serve/notification test named exactly: "serve notifications highlight tasks linked to pending decisions". Seed a task linked to a pending decision/escalation, call `/api/notifications`, and assert the notification includes the task id and the board JSON marks that task as highlighted/attention-needed.
Expected failure cause (literal string in the output): the test name "serve notifications highlight tasks linked to pending decisions".

## Reuse
DECISION-LOG-001 decision records; FLOW-002 duties; SERVE-001 server/read-only pattern; status board builder; SERVE-ACTIVITY-001 digest builder where possible.

## Stop conditions
Adding external notification transports before the serve notification model exists; serve writing state directly; separate notification logic per UI view; unlinked notifications that cannot tell the founder which task/decision they affect.

## Evidence required at close
red-test-output, verify-root, final-sha.
