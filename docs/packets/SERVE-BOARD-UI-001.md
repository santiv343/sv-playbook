<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SERVE-BOARD-UI-001
title: serve: kanban board UI + task view (columns from engine statuses, read-only, zero deps)
depends_on: ["SERVE-001"]
write_set: ["src/serve/**","src/cli/commands/serve.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
The founder must SEE the board like a Jira, not read a table: a kanban UI on top of SERVE-001's minimal server. This is the visual layer he asked for explicitly ("ver tablero, tareas, detalle de tareas al entrar a una").
1. The serve root page renders a KANBAN board: one column per status in workflow order (draft, ready, active, blocked, review, done, dropped), cards per packet showing id, title, priority, lease holder (if any), and dependency badges (blocked-by / blocks).
2. Clicking a card opens the task view: the packet definition (title, body, write_set, deps, evidence required) + its event timeline — served from a `GET /api/task/:id` endpoint (the same endpoint SERVE-DETAIL-001 later enriches with live transcript/diff; build the basic version here, SERVE-DETAIL extends it — one endpoint, no fork).
3. Auto-refresh (poll) so an agent moving a packet is visible within seconds; done/dropped columns collapsed by default (46+ done packets must not drown the view).
4. Self-contained HTML/CSS/JS served by node:http — zero external deps, works offline, one file or template module.
5. Read-only. No control buttons (dispatch/abort live in a later packet).
Opinion-free: column set/order comes from the workflow statuses the engine exposes, not a hardcoded list in the page — when configurable workflows land (state-machine config), the board follows automatically.

## RED test (write first)
In src/serve/board-ui.test.ts add a test named exactly: "serve board page renders kanban columns and GET /api/task/:id returns the packet detail". Start the server against a store with packets in different statuses, GET / and assert the HTML contains a column per status and a card with a packet id; GET /api/task/:id and assert the JSON contains the definition and events. Today serve renders a minimal table → it FAILS.
Expected failure cause (literal string in the output): the test name "serve board page renders kanban columns and GET /api/task/:id returns the packet detail".

## Reuse
SERVE-001's server, board contract and page (extend it); the status/events readouts; the deps graph from packet_deps.

## Stop conditions
A second board query bypassing the status contract; hardcoding the column list instead of deriving it from the engine's statuses; external runtime deps (CDN scripts/fonts); any write path; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
