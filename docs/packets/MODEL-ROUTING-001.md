<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: MODEL-ROUTING-001
title: config: role-to-model routing for founder interface, delivery TL, implementers and reviewers
depends_on: ["OPERATING-MODEL-001","ROLE-CONFIG-001"]
write_set: ["src/config.types.ts","src/config.ts","src/config.constants.ts","src/config.test.ts","content/dispatch/adapters.md","content/roles/delivery-orchestrator.md","docs/specs/2026-07-07-sv-playbook-design.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Add model/capability routing as configuration so the founder-led agile chain can use expensive reasoning only where it matters and cheaper models for closed execution.

The intended sv-playbook profile is:
- `founder-interface`: high capability / expensive;
- `delivery-orchestrator`: medium capability;
- `implementer`: cheap model, narrow packet, hard gates;
- `reviewer`: capable enough for strict review, configurable by project risk/tier.

This is a profile, not an engine assumption.

Implement:
1. Extend config with a `modelRouting` or equivalent role-routing map that binds role -> capability class / preferred harness / preferred model label.
2. Provide defaults that preserve current behavior when absent.
3. Add validation that role-routing entries reference known roles once ROLE-CONFIG-001 exists.
4. Update delivery-orchestrator docs to choose implementer/reviewer models from this routing and record dispatch decisions as task notes/events.
5. Add docs explaining that routing is advisory until dispatch automation exists, but the delivery orchestrator must cite it when choosing a model.

## RED test (write first)
Add a config validation test named exactly: "model routing accepts founder interface delivery orchestrator implementer and reviewer roles".

Create a config fixture with routing for those roles and assert it loads/round-trips. Add an invalid role entry and assert validation rejects it once role config is available.

Expected failure cause (literal string in the output): the test name "model routing accepts founder interface delivery orchestrator implementer and reviewer roles".

## Reuse
`src/config.ts`, `src/config.types.ts`, `src/config.constants.ts`; dispatch adapter docs; backlog IDEA-007 model registry/routing; OPERATING-MODEL-001 role chain; ROLE-CONFIG-001 role existence validation.

## Stop conditions
Hardcoding DeepSeek or any provider as the only implementer model; making routing required for existing repos; trusting model self-report as evidence; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
