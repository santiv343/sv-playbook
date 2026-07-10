<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: AGENTIC-AGILE-DOCS-001
title: docs: agile mechanized for agents, with configurable profiles and role chain
depends_on: ["OPERATING-MODEL-001","ROLE-FOUNDER-INTERFACE-001","ROLE-DELIVERY-ORCHESTRATOR-001","CLI-START-001"]
write_set: ["docs/QUICKSTART.md","docs/specs/2026-07-07-sv-playbook-design.md","content/cli.md","src/cli/commands/docs-content.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Document "agile mechanized for agents" as the user-facing operating concept, with clear engine/profile boundaries and no Santi-specific hardcoding.

The docs must explain the chain:
Human/founder -> configured entry role (e.g. Founder Interface) -> delivery orchestrator -> implementers/reviewers -> CLI gates.

Implement:
1. Update docs/QUICKSTART.md with the founder-led chain, the delivery chain, and the daily ritual:
   - founder opens a capable agent;
   - agent runs `sv-playbook start`;
   - start selects configured entryRole;
   - founder-interface manages product/backlog/decisions;
   - delivery-orchestrator manages execution.
2. Update the design spec to state that operating models are configurable profiles, not engine behavior.
3. Update content/cli.md to document `start`, `handoff --role`, and how config controls the default role once CLI-START-001 and OPERATING-MODEL-001 land.
4. Add examples for three profiles:
   - solo/simple;
   - founder-led;
   - enterprise.
5. Keep docs single-source: do not duplicate full role charters inside Quickstart; link to `docs roles/<role>`.

## RED test (write first)
Add a docs/content test named exactly: "quickstart documents the founder interface to delivery orchestrator chain".

The test should read docs/QUICKSTART.md and assert it names `founder-interface`, `delivery-orchestrator`, and the engine/profile distinction.

Expected failure cause (literal string in the output): the test name "quickstart documents the founder interface to delivery orchestrator chain".

## Reuse
docs/QUICKSTART.md; docs/specs/2026-07-07-sv-playbook-design.md; content/cli.md; OPERATING-MODEL-001; CLI-START-001; role docs.

## Stop conditions
Embedding full role charters in Quickstart; documenting Santi's workflow as universal; creating docs that claim commands exist before their packets land without marking them planned; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
