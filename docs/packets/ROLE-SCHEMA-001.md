<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ROLE-SCHEMA-001
title: cero ambiguedad chequeable: schema de rol exhaustivo + check roles (responsabilidad single-source; mata el bug de quien-mergea)
depends_on: ["CHECK-001"]
write_set: ["content/roles/format.md","src/cli/commands/check.ts","src/check/roles.ts","src/check/roles.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Make "zero ambiguity" a CHECKABLE property of every role, not a request. Two parts: define the role-definition SCHEMA (engine), and a `check roles` gate that mechanically enforces it (the who-merges conflict was a role-ambiguity bug; this makes it impossible).

1. SCHEMA (extend content/roles/format.md) — every role definition MUST have all of, exhaustively:
   - mission: one sentence, what the role is for.
   - scope + prohibitions: what it does AND an explicit list of what it must NEVER do.
   - inputs: the exact reads/commands it runs before acting.
   - procedure: ordered steps, each EITHER an EXEC step {command, expected output, action-on-mismatch} OR a JUDGMENT step {criterion, explicit escalation path}. No bare verbs.
   - outputs: fixed-structure artifacts it produces.
   - handoffs: the exact next role + the mechanism.
   - gates: the mechanical checks this role must pass (mapping to the transition gates).
   - decision-authority: what it decides alone vs must escalate.
   - stop-conditions; capability-floor (min model + what a low-capability agent does).

2. `check roles` (a target of the check command) validates ACROSS ALL role definitions:
   - every procedure step is a well-formed EXEC or JUDGMENT (reject bare/vague verbs);
   - every JUDGMENT step has an escalation path;
   - every handoff names an EXISTING role;
   - RESPONSIBILITY single-source: every responsibility in the responsibility set (e.g. merge, dispatch, implement, capture-evidence, close-packet) is owned by EXACTLY ONE role — reject if any is unowned (gap) or claimed by two (conflict);
   - every required schema section is present.
   Exit 1 naming each violation.

## RED test (write first)
In a check-roles test add a test named exactly: "check roles fails when a responsibility is owned by two roles". Provide two fixture role definitions that both claim the 'merge' responsibility, run check roles, and assert it exits non-zero naming the contested responsibility. Today no such check exists -> it FAILS.
Expected failure cause (literal string in the output): the test name "check roles fails when a responsibility is owned by two roles".

## Reuse
The check command from CHECK-001; the document/frontmatter parser; the format contract in content/roles/format.md.

## Stop conditions
Accepting a role with a bare-verb step or an unescalated JUDGMENT; allowing a responsibility gap or overlap; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
