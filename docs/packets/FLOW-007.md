<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-007
title: incidents as first-class board objects: INC type, linked rails, undocumented-incident detection
depends_on: []
write_set: ["src/tasks/**","src/cli/commands/task*","src/cli/commands/doctor*"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-10): "fijate que todas las cagadas que se manden los agentes queden bien documentadas y mecanizadas". Today the incident->rail loop is PRACTICE (the PM writes packets when something breaks) but incidents themselves are not first-class: there is no board object that says "this happened, these rails close it", and nothing detects an incident left without a rail. Mechanize the loop itself:
1. New task type: `incident` -> prefix INC (TASK_TYPE_PREFIX). An INC packet documents ONE screwup: what happened, root cause, blast radius, and its body links the rail packet ids that close the class.
2. `task create --type incident` works like any type; INC packets close ONLY when every linked rail packet is done (a closing gate: move done refused while a linked rail is non-terminal — the incident stays open as long as the class is open).
3. Doctor/report readout: open INC packets with their linked-rail progress (2/3 rails done) — the founder sees unclosed incident classes in one line; serve renders the same builder.
4. Rubric wiring: any refusal event marked as incident (tamper detection, gate cheats, honesty violations) expects an INC packet within the same working session — doctor flags incident events newer than the newest INC packet as "undocumented incident".
5. BACKFILL as part of this packet: create INC packets for the 2026-07-10 saga — (a) rebuild --force wipe -> rails GATE-001, STORE-002, BUG-006; (b) raw-SQL insert -> rails FLOW-006, closed-world/PRINCIPLE-016; (c) schema-v5 lockout (prior incident) -> rail STORE-MIGRATION-MAIN-001. The board becomes the incident history.

## RED test (write first)
In a task-type test add a test named exactly: "an incident packet cannot close while a linked rail packet is still open". Create an INC fixture linking a draft rail packet, walk it to review, assert move done is refused naming the open rail; close the rail, assert the INC can close. Today the incident type does not exist -> the FIRST failure is the unknown type refusal.
Expected failure cause (literal string in the output): the unknown-type refusal for `incident`, OR the test name "an incident packet cannot close while a linked rail packet is still open".

## Reuse
TASK_TYPE_PREFIX (TYPED-TASKS); the deps machinery for rail links if it fits (an INC depending on its rails gives the ordering for free — evaluate before inventing a second link kind); doctor readout builders; the events table.

## Stop conditions
A second linking mechanism if packet_deps already expresses "closes when rails are done"; incidents as prose in docs instead of board objects; skipping the backfill; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
