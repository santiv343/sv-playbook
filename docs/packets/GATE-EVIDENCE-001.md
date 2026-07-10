<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-EVIDENCE-001
title: gate: rechazar move->done si falta algun item de evidence_required declarado
depends_on: ["GATE-VERIFY-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Mechanize "capture all the required evidence" — today a packet declares `evidence_required` (e.g. red-test-output, verify-root, final-sha) but nothing enforces it, so a packet can close with evidence missing. On `task move <id> done`, the CLI REFUSES the transition if any item in that packet's `evidence_required` has no corresponding captured evidence event. The refusal names the missing items. The agent can no longer forget (or skip) evidence.

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "move to done is refused when a required evidence item is missing". Set up a review packet whose evidence_required includes an item that was never captured, attempt move->done, and assert it throws naming the missing item. Today move->done does no evidence check → it FAILS.
Expected failure cause (literal string in the output): the test name "move to done is refused when a required evidence item is missing".

## Reuse
The evidence events already written by captureEvidence (EVENT_EVIDENCE); the packet's evidence_required (read it from the store/definition); the transition path in movePacket.

## Stop conditions
Closing with missing evidence; hardcoding the evidence list instead of reading the packet's declared evidence_required; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
