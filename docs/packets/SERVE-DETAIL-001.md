<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SERVE-DETAIL-001
title: serve detalle de tarea en tiempo real: transcript vivo del agente, archivos modificados (+scope), timeline, evidencia, verify, PR/CI, costo, salud
depends_on: ["SERVE-001"]
write_set: ["src/cli/commands/serve.ts","src/serve/**","src/serve/serve.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
(v2) Rich task-detail view in serve — the founder's "see what every agent is doing second by second". Extends SERVE-001 (minimal board). On opening a task, `GET /api/task/:id` + a detail page render EVERYTHING about that packet, live:
- Definition: title, type, body/description, write_set, depends_on, requirements, evidence_required.
- Live state: status, the agent holding it (harness + model), lease acquired-at + elapsed, health signal (alive/stale from heartbeat).
- LIVE agent transcript: the same data the agent's own CLI shows, tailing in real time (the proven mechanism: poll the harness session messages; IDEA-041). This is the core "real data all the time" requirement.
- Modified files: live `git diff --name-only`/`--stat` of the lease branch, EACH marked in-scope or out-of-scope against the write_set (the GATE-WRITESET data, shown live).
- Event timeline: transitions, notes, evidence, checkpoints (the events table).
- Evidence captured so far: RED output, verify result, HEAD sha.
- Verify status: last run + pass/fail (GATE-VERIFY data).
- PR + CI: link and check status.
- Cost/tokens if recorded (IDEA-031).
Read-only in this packet; control buttons (dispatch/abort/takeover, calling the CLI) are a follow-up. All data comes from the DB + git + the harness session API — no new state.

## Gate (v2; RED for the API)
RED test "task detail api returns definition, live state, modified files and events for a packet". Assert GET /api/task/:id returns those sections for a fixture packet with a lease + events. Reuse the status/events readouts and the git-diff + write_set matcher from GATE-WRITESET-001.

## Stop conditions
Any write path (read-only); duplicating board queries instead of reusing the status/events contract; inventing state not in DB/git/session.

## Evidence required at close
red-test-output, verify-root, final-sha.
