<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SERVE-001
title: serve: vista web local read-only del tablero en vivo (minima; UI rica = follow-ups IDEA-045)
depends_on: []
write_set: ["src/cli/commands/serve.ts","src/cli/commands/serve.test.ts","src/serve/**","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
`sv-playbook serve` — a LOCAL, READ-ONLY web view of the board in real time (the founder's core visibility need; unblocked now that the DB is rich). SCOPE THIS PACKET to the minimal viable server; the rich UI is follow-up packets (see IDEA-045 blueprint).
- Start an HTTP server (node:http, no external deps) on a configurable port.
- `GET /api/board` returns the live board as JSON — reuse the SAME contract as `status --json` (single source: do NOT invent new queries) plus the recent events stream and current leases.
- `GET /` serves a single self-contained HTML page that fetches /api/board and AUTO-REFRESHES (poll every few seconds), rendering: the counts, a table of packets by status, and who holds each lease. No control buttons in v1 (read-only).
- Read-only: serve NEVER mutates the board.

## RED test (write first)
In src/cli/commands/serve.test.ts add a test named exactly: "serve /api/board returns the live board state". Start the server on an ephemeral port, GET /api/board, and assert the JSON contains the packet counts and the packet list matching the store. New command → the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `serve` command export, OR the test name "serve /api/board returns the live board state".

## Reuse
The status --json builder in src/status/status.ts (the board contract — single source); the events/leases readouts; node:http (no external server dep).

## Stop conditions
Any write path in serve (it is read-only); duplicating the board query instead of reusing the status contract; adding external runtime deps; building the full operations-bar/activity-feed UI here (follow-up packets); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
