<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-DEPS-001
title: gate: rechazar task start si algun depends_on no esta done (orden de dispatch enforzado por el CLI)
depends_on: ["GATE-EVIDENCE-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Mechanize "respect depends_on" — today a packet's dependencies are documentary; nothing stops a worker starting a packet whose prerequisites are not finished. Make `task start <id>` (and `task move <id> ready`) REFUSE if any packet in this packet's `depends_on` is not in status `done` (or `dropped`, which unblocks). The refusal names the unmet dependencies. The dispatch order is now enforced by the CLI, not remembered by the orchestrator.

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "task start is refused when a depends_on packet is not done". Create packet B depends_on A with A still in draft, attempt to start B, and assert it throws naming A as an unmet dependency. Today start ignores depends_on → it FAILS.
Expected failure cause (literal string in the output): the test name "task start is refused when a depends_on packet is not done".

## Reuse
getDeps (already reads a packet's depends_on) and currentStatus in src/tasks/service.ts; the start/lease path.

## Stop conditions
Ignoring depends_on; blocking on a dropped dependency (dropped unblocks); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
