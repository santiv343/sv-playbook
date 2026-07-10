<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ROLE-DELIVERY-ORCHESTRATOR-001
title: role: delivery-orchestrator manages implementers and reviewers, not product direction
depends_on: ["OPERATING-MODEL-001","ROLE-SCHEMA-001"]
write_set: ["content/roles/delivery-orchestrator.md","content/roles/orchestrator.md","content/dispatch/worker.md","content/dispatch/adapters.md","docs/QUICKSTART.md","src/cli/commands/check.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Reframe the operational orchestrator as `delivery-orchestrator`: the medium-capability role that manages execution under a founder/interface-approved plan.

The delivery orchestrator supervises implementation, not product direction. It reads ready packets, dispatches implementers, monitors leases/transcripts/CI/PRs, delegates reviewers, records dispatch notes, and escalates strategic decisions back to `founder-interface`.

Implement:
1. Add or rename the operational charter to `content/roles/delivery-orchestrator.md`.
2. Update `content/roles/orchestrator.md` so either:
   - it becomes a compatibility alias that points to `delivery-orchestrator`, or
   - it is explicitly deprecated by the new role.
3. Remove "The human's single interface" from the operational orchestrator charter. That responsibility belongs to the configured `entryRole`.
4. The delivery role must explicitly own:
   - dispatching implementers for ready packets;
   - choosing harness/model within the configured model routing;
   - monitoring active work;
   - requesting review;
   - reporting blockers;
   - escalating only non-operational decisions.
5. The delivery role must explicitly prohibit:
   - deciding product scope;
   - changing tier/constitution/operating model;
   - implementing packets itself by default;
   - reviewing its own dispatches.

## RED test (write first)
Add a role/check test named exactly: "delivery orchestrator is not the human single interface".

The test should validate role definitions and fail if `delivery-orchestrator` or `orchestrator` claims the human-single-interface responsibility when `entryRole` is configured as `founder-interface`.

Expected failure cause (literal string in the output): the test name "delivery orchestrator is not the human single interface".

## Reuse
Current `content/roles/orchestrator.md`; ROLE-SCHEMA-001 responsibility single-source checks; OPERATING-MODEL-001 configured `entryRole`; dispatch docs under `content/dispatch/`.

## Stop conditions
Leaving two roles owning dispatch; leaving two roles claiming human-interface ownership; removing backwards compatibility without a migration path; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
