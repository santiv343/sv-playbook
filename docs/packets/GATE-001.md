<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-001
title: destructive CLI actions require superior approval
depends_on: []
write_set: ["src/cli/commands/rebuild.ts","src/cli/commands/restore.ts","src/cli/commands/task.ts","src/cli/commands/task.test.ts","src/cli/registry*","src/cli/command.types.ts","src/redteam/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-10, verbatim): "acciones destructivas deben consultarse con superior". Incident that triggered it: an agent ran `rebuild --force` against the LIVE shared .svp on its own initiative; the rebuild had a bug (created_at NOT NULL) and wiped the DB to 0 rows — ~65 done states lost until a recovery pass restored them. The --force flag existed as a self-service escape hatch; no role boundary guarded it. Make destructive-action consent a mechanical rail, not a norm:
1. A DESTRUCTIVE command registry (data, not prose): rebuild --force, restore, task takeover --force, any future command that can discard state declares itself destructive in its registration metadata (compose with REGISTRY-AUTODISCOVER's registry).
2. Role-scoped consent (compose with FLOW-003 role sessions): a session with a non-founder role (worker, delivery-orchestrator) invoking a destructive command is REFUSED with the sanctioned path printed: "destructive action — requires founder-interface approval: record the request with `decision request <summary>` and wait" (DECISION-LOG-001 is merged — use it). The refusal is evented.
3. A founder-role session (or a human session with no declared role) gets an explicit confirmation gate: the command prints what will be destroyed (counts: N done, M events) and requires a literal `--confirm-destructive` flag — never interactive, never default.
4. Every destructive execution (approved or refused) lands in events with who/role/what/counts, so serve and digest show them.
5. Red-team case (RAIL-REDTEAM-001 suite): script a worker-role session attempting rebuild --force and assert the refusal names this gate and the decision-request path.

## RED test (write first)
In a destructive-consent test add a test named exactly: "a non-founder role invoking a destructive command is refused with the decision-request path". With a FLOW-003-style role session set to delivery-orchestrator, invoke rebuild --force on a fixture store and assert refusal naming the gate and the sanctioned path; assert a founder session without --confirm-destructive is also refused with the counts printed; with the flag it proceeds. Today no role/consent check exists -> it FAILS.
Expected failure cause (literal string in the output): the test name "a non-founder role invoking a destructive command is refused with the decision-request path".

## Reuse
FLOW-003 role sessions (when merged; if not yet, the session-role read must be the same single source); DECISION-LOG-001 (merged) for the escalation record; the events table; RAIL-REDTEAM-001 suite for the cheat case; the command registry metadata.

## Stop conditions
An interactive prompt (breaks agent automation — flags only); making --confirm-destructive a default anywhere (docs, scripts, charters); a second role-detection mechanism apart from FLOW-003's; weakening the existing recovery guard; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
