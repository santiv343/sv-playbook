<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: PACKET-AUTHORING-GATE-001
title: packet authoring gate: planners cannot move ambiguous tasks to ready
depends_on: ["CHECK-001","ROLE-SCHEMA-001","TASK-RUBRIC-001","TYPED-TASKS-001"]
write_set: ["src/cli/commands/check.ts","src/cli/commands/check.test.ts","src/tasks/service.ts","src/tasks/service.test.ts","src/packets/document.ts","src/packets/document.types.ts","src/packets/document.test.ts","content/roles/planner.md","content/roles/format.md","content/rubric.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Make packet authoring quality a deterministic gate, not a reminder to the planner. The recurring failure mode is that a task is technically present but leaves interpretation to the implementer: vague scope, open decisions, missing expected RED failure cause, ambiguous write_set, unowned follow-up, or instructions that two competent agents could execute differently.

Add a packet-authoring check that every planner/founder-interface generated packet must pass before it can become `ready`.

Implement:
1. Extend the `check` surface with `check packets` (or extend `check structure` if CHECK-001 chooses a unified target) to validate every draft/ready packet definition.
2. Enforce a single-source packet authoring schema:
   - required sections: Task, RED test (or explicit no-RED criterion with rationale), Reuse, Stop conditions, Evidence required;
   - write_set must be non-empty and must not use broader globs when a narrower file/module glob is available;
   - expected failure cause must use the closed list already required by the planner charter: missing import/export compiler error OR the exact test name;
   - no unresolved markers: `TBD`, `TODO`, `OPEN:`, `later`, `somehow`, `etc`, `and so on`;
   - no vague verbs without observable output: "improve", "clean up", "handle", "make better", "support", unless followed by concrete acceptance criteria;
   - every JUDGMENT left to the implementer must name its escalation path, otherwise it is a planning bug;
   - every dependency must exist;
   - every packet type/prefix, once TYPED-TASKS-001 lands, must match the packet's declared type.
3. Gate `task move <id> ready` through the packet-authoring check for that packet. A packet that fails authoring validation stays in draft and the CLI prints exact file/field/violation lines.
4. Update the planner/founder-interface authoring flow so packet creation is not "write a good task" prose. It is:
   - capture decision;
   - choose packet type;
   - define exact write_set;
   - define RED test and closed-list expected failure cause;
   - define reuse pointers;
   - define stop conditions;
   - run packet-authoring check;
   - only then move ready.
5. Treat the check as the default ambiguity rail for all roles: no role may emit work for another role unless that work passes the relevant schema/check. Ambiguity is a system defect, not an implementer responsibility.

## RED test (write first)
Add a check/transition test named exactly: "moving an ambiguous packet to ready fails with packet authoring violations".

Create a draft packet body containing vague work such as "improve the startup flow and handle etc later", with no RED test expected failure cause and a broad write_set. Attempt `task move <id> ready`. Assert the command exits non-zero and names packet authoring violations, including the unresolved/vague language.

Expected failure cause (literal string in the output): the test name "moving an ambiguous packet to ready fails with packet authoring violations".

## Reuse
CHECK-001 command surface; packet parser in `src/packets/document.ts`; planner charter; `movePacket` ready transition; write_set conflict check already run on ready; TASK-RUBRIC-001 for universal quality inheritance; ROLE-SCHEMA-001 for the rule that roles cannot emit ambiguous handoffs.

## Stop conditions
Leaving authoring quality as reviewer-only prose; allowing `task move ready` for a packet with vague/unresolved text; duplicating the required-section/closed-list definitions across modules; blocking legitimate product language without a clear escape hatch; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
