<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: DECISION-LOG-001
title: decisions as data: ask/answer escalations live in the DB, surfaced by start/digest/serve — never lost in chat
depends_on: ["TASK-CORE-DB-001"]
write_set: ["src/decisions/**","src/cli/commands/decision.ts","src/cli/commands/decision.test.ts","src/db/store.ts","src/db/store.constants.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Human decisions must be DATA, not chat prose. Today an orchestrator escalates questions to the founder in a chat message; the answer lands in that chat and nothing guarantees the next agent (or the same one after a handoff) ever sees it. Mechanize the escalation loop:
1. `decision ask --question <text> [--option <text>]... [--packet <ID>]` — any role records a pending decision in the DB (evented). The question must be self-contained (an agent reading it cold can act on the answer).
2. `decision list [--pending]`, `decision show <id>`.
3. `decision answer <id> --choice <option|text>` — records the founder's ruling (evented, timestamped, attributed).
4. Surfacing, single-sourced: `start` shows pending decisions for the founder role and recent ANSWERS for agent roles; digest includes ask/answer events; serve renders a pending-decisions section; a packet blocked on a decision references it (`--packet` links them) so `task show` displays the pending question.
5. Answered decisions are immutable history (a new ask supersedes — link via superseded_by), because rulings are the founder's judgment ledger: over time they feed the taste ledger (a recurring similar question = a missing rule; note the graduation path, TASTE-LEDGER-001).
This closes the loop the roles taxonomy (ROLE-ORCHESTRATOR-HARDEN) defined in prose: the taxonomy said WHAT to escalate; this makes escalation itself mechanical and durable.

## RED test (write first)
In a decision test add a test named exactly: "decision ask then answer round-trips and start surfaces the pending question". Ask a decision linked to a packet, assert it appears pending in list and in the packet's show; answer it; assert the answer is recorded with attribution and no longer pending. New command -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `decision` command export, OR the test name "decision ask then answer round-trips and start surfaces the pending question".

## Reuse
The events table; the start command composition (CLI-START-001); task show; command registration; the schema-migration pattern.

## Stop conditions
Free-floating decisions with no self-contained question; mutating an answered decision (supersede instead); a second surfacing query path per consumer (one builder); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
