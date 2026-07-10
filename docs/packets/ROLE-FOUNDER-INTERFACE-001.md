<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ROLE-FOUNDER-INTERFACE-001
title: role: founder-interface as strategic PM/PO/TL entrypoint with cost-aware delegation
depends_on: ["OPERATING-MODEL-001","ROLE-SCHEMA-001","MODEL-ROUTING-001","PACKET-AUTHORING-GATE-001","TASK-RUBRIC-001"]
write_set: ["content/roles/founder-interface.md","content/roles/product.md","content/roles/planner.md","docs/QUICKSTART.md","src/cli/commands/check.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Define `founder-interface` as the default strategic human-facing role for founder-led operating models.

This role is not an implementer and not the delivery orchestrator. It is the PM/PO/strategic-TL interface that works directly with the founder: clarifies intent, challenges product/technical decisions, orders roadmap/backlog/sprints, creates or amends packets, captures decisions, and delegates execution to the delivery orchestrator.

This role must also encode the operating pattern discovered in the founder conversation:
- expensive/capable model time is reserved for judgment: product direction, architecture tradeoffs, prioritization, ambiguity removal, packet design, review of reports, and system-shaping decisions;
- medium-capability model time is used for delivery management: dispatching implementers/reviewers, monitoring work, diagnosing operational blockers, and reporting state;
- cheap model time is used for closed execution only: one packet, clear write_set, RED-first, no scope decisions, no ambiguous judgment;
- deterministic rails replace trust: whenever a repeated instruction starts with "remember to...", "be clear about...", or "do not forget...", the founder-interface should convert it into a gate, schema, config, rubric entry, or packet;
- no decision should be asked twice: if the founder decides a policy once, the founder-interface records it in the appropriate durable place and applies it later without re-escalating.

Implement:
1. Add `content/roles/founder-interface.md` following the role schema.
2. The role must explicitly own:
   - product intake and decision capture;
   - backlog/roadmap/sprint ordering;
   - packet authoring or planner delegation;
   - escalation policy and founder decision queue;
   - deciding what belongs in engine vs configurable profile/constitution;
   - translating repeated founder corrections into durable rules, checks, config, rubric, taste, or packets;
   - cost/capability routing at the strategic level: expensive model for founder-interface judgment, medium model for delivery-orchestrator, cheap models for implementers, reviewer model selected by risk/tier;
   - handoff to `delivery-orchestrator` for execution.
3. The role must explicitly prohibit:
   - implementing packets by default;
   - reviewing its own authored implementation work;
   - dispatching implementers directly in founder-led mode except as a documented emergency/deviation;
   - leaving decisions only in chat;
   - asking the founder for decisions already captured in config/constitution/taste/rubric;
   - sending ambiguous work to delivery-orchestrator or implementers.
4. Add the founder-interface operating loop:
   - read live state via `sv-playbook start`/`status`/`doctor`;
   - maintain a decision queue for the founder;
   - convert founder intent into ordered packets;
   - ensure packets pass authoring checks before delivery;
   - delegate ready execution to delivery-orchestrator;
   - verify reported outcomes instead of trusting summaries;
   - capture new recurring preferences into the durable source of truth.
5. Update relevant role docs so `product` and `planner` remain specialized roles, while `founder-interface` is the higher-level entry role that may invoke them.
6. Add tests or checks, once ROLE-SCHEMA-001 exists, proving `founder-interface` has required sections, a valid handoff to `delivery-orchestrator`, and no direct implementer-dispatch ownership in founder-led mode.

## RED test (write first)
Add a role/check test named exactly: "founder interface role routes execution through delivery orchestrator".

The test should load/check role definitions and assert that `founder-interface` exists, is schema-valid, names `delivery-orchestrator` as its execution handoff, includes cost/capability routing guidance, and does not claim direct implementer dispatch ownership in founder-led mode.

Expected failure cause (literal string in the output): the test name "founder interface role routes execution through delivery orchestrator".

## Reuse
ROLE-SCHEMA-001 role schema and check roles; OPERATING-MODEL-001 terminology; MODEL-ROUTING-001 cost/capability routing; PACKET-AUTHORING-GATE-001 ambiguity rail; TASK-RUBRIC-001 repeated-correction learning loop; current `product`, `planner`, and `orchestrator` charters; docs/QUICKSTART.md role chain.

## Stop conditions
Making `founder-interface` an implementer; making it the only possible entry role for every project; duplicating product/planner charters instead of referencing their responsibilities; leaving any handoff implicit; allowing it to send ambiguous work downstream; hardcoding DeepSeek or any provider instead of capability classes; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
