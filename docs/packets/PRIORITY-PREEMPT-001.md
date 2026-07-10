<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: PRIORITY-PREEMPT-001
title: priority first-class: explicit preemption of lower-priority ready overlaps + task conflicts readout (never touch active without takeover)
depends_on: ["GATE-WRITESET-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts","src/cli/commands/task.ts","src/cli/commands/task.test.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Priority exists as a DB column but NOTHING uses it (audit 2026-07-10). Founder scenario: an URGENT task's write_set overlaps a less-urgent READY task — today the conflict gate defends the old task blindly. Make priority first-class and conflicts priority-aware:
1. CLI surface: `task create/amend --priority <p0|p1|p2|p3>` (default p2); priority shown in list/show/status and as a chip on serve cards (note SERVE-BOARD-UI-001).
2. Priority-aware conflict handling on `task move ready` when write_sets overlap:
   - incoming LOWER-or-equal priority vs existing ready/active: refused as today, but the refusal now STATES both priorities ("held by ACTIVE X (p1) — yours is p2").
   - incoming HIGHER priority vs a READY (not started) packet: the CLI offers preemption explicitly: `--preempt <ID>` demotes the ready packet back to draft (evented, with the reason), then promotes the urgent one. Never silent — preemption is always an explicit flag.
   - incoming HIGHER priority vs an ACTIVE packet (an agent is working): NEVER auto-preempted; the CLI prints the situation and the two sanctioned paths (wait, or takeover via the existing takeover flow) — a human/orchestrator decision (DECISION-LOG-001 when available).
3. `dispatch plan` (DISPATCH-PLAN-001) orders batches by priority; note added there.
4. VISIBILITY (the founder's explicit ask: "deberíamos poder ver eso"): `task conflicts [<ID>]` lists, for a packet or the whole board, every write_set overlap across non-terminal packets WITH both priorities and states — the same single overlap rule (FLOW-CONFLICT-001), exposed as a readout. Serve renders overlap badges on cards from the same builder.

## RED test (write first)
In a priority test add a test named exactly: "a higher priority packet can preempt a ready overlap explicitly and never an active one". Packet A ready (p2), packet B (p1) overlapping: assert move B ready without --preempt is refused stating both priorities; with --preempt A it succeeds, A returns to draft with an event. Make A active instead: assert --preempt is refused pointing at the takeover path. Today priority is inert -> it FAILS.
Expected failure cause (literal string in the output): the test name "a higher priority packet can preempt a ready overlap explicitly and never an active one".

## Reuse
The priority column (schema already has it); checkWriteSetConflict / FLOW-CONFLICT-001 (single overlap source); the transition events; the takeover flow (do not duplicate it — point to it).

## Stop conditions
Silent or automatic preemption (always an explicit flag); preempting an ACTIVE packet by any path other than the existing takeover; a second overlap implementation for the conflicts readout; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
