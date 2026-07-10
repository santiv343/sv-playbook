<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-009
title: agent liveness in real time: dispatch status/watch + serve Agentes panel, stall detection from mechanical signals
depends_on: ["FLOW-008"]
write_set: ["src/dispatch/**","src/cli/commands/dispatch*","src/cli/commands/serve*","src/schema/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-10, verbatim): "no se que estan haciendo los subagentes, no se si se colgaron, si el orchestrator se colgo, todo esta info necesito tenerla si o si" — real-time, in serve AND the CLI. Every signal must be MECHANICAL (derived from logs, processes, leases, events), never the agent's self-report. Composes with FLOW-008 (the executor port produces the raw material: one log file + pid/handle per launched agent).
1. LIVENESS MODEL (engine, single source): for every dispatch handle — state (running|exited(code)|unreachable), last-output age (mtime/bytes delta of its .svp/dispatch/<id>.log), packet lease heartbeat age when the agent holds one, and a stall flag when last-output age exceeds a configured threshold (dispatch.stallAfterSeconds, validated schema). The orchestrator is a handle like any other — its silence is visible the same way.
2. CLI: `dispatch status` shows the table (handle, role, packet, state, last-output age, stall flag); `dispatch watch` streams it (poll + redraw, node-only, no deps); both read the SAME builder as serve (one source, two renderers).
3. SERVE: an "Agentes" panel fed by SSE — one card per live handle: role, packet id, state chip, last-output age ticking, tail of the last N log lines (raw, labeled as mechanical capture), and a LOUD stall/dead state (the founder must see a hung agent without asking). Uses the existing SSE channel and provenance badges (log tail = mechanical ✓).
4. EVENTS: stall detected and recovered are evented (agent-stalled, agent-resumed) so digest/history keep them; an exited handle with a still-active packet lease is flagged (crashed mid-task) — that is the duty trigger for FLOW-002 (takeover/reassign path, do not duplicate it).
5. Opinion-free: thresholds and panel behavior are config; the engine only guarantees the signals.

## RED test (write first)
In a liveness test add a test named exactly: "dispatch status reports last-output age and flags a stalled handle from mechanical signals only". With a fixture handle whose log file has an old mtime and a live one, build the status readout: assert ages are computed from the filesystem, the stale one carries the stall flag at the configured threshold, and an exited-with-active-lease handle is flagged as crashed. Today no liveness builder exists -> the FIRST failure is the missing module.
Expected failure cause (literal string in the output): the compiler/module error for the missing liveness module, OR the test name "dispatch status reports last-output age and flags a stalled handle from mechanical signals only".

## Reuse
FLOW-008's handles/logs (this packet READS what the port produces — hard dependency); the lease heartbeat machinery; the events table; serve's SSE channel and status builders (SERVE-001); FLOW-002 duties for the reaction to a crashed handle (trigger it, do not reimplement).

## Stop conditions
Any liveness signal sourced from agent self-report text; a second status builder for serve vs CLI (one builder, two renderers); polling so aggressive it competes with the store (read the filesystem, not the DB, for ages); reimplementing takeover/duties; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
