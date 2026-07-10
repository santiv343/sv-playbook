<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FIX-SCAFFOLD-IDS-001
title: fix scaffold: remediation packets con IDs tipados auto-generados en el namespace del proyecto adoptado (no ADOPT-AURORA-00X colisionando)
depends_on: ["TYPED-TASKS-001"]
write_set: ["src/cli/commands/adopt.ts","src/adopt/scaffold.ts","src/cli/commands/adopt.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
The adopt scaffold names the remediation packets it creates with hand-assigned, colliding ids — the first Aurora run proposed ADOPT-AURORA-001..004, which collides with the execution packet's own id and sits in the wrong namespace. Remediation packets must be created in the ADOPTED repo's board with TYPED, CLI-AUTO-GENERATED ids in that project's namespace (e.g. AURORA-CONFIG-001, not ADOPT-AURORA-002). Fix ADOPT-SCAFFOLD to: assign each remediation packet a type and let the CLI generate its id (via TYPED-TASKS-001), scoped to the adopted project. No hand-assigned ids anywhere in scaffolding.

## RED test (write first)
In the adopt scaffold test add a test named exactly: "scaffold remediation packets get typed auto-generated ids, not hand-assigned collisions". Run scaffold against a fixture with two gaps, and assert the two remediation packets have distinct typed auto-generated ids (not ADOPT-AURORA-00X and not colliding with the runner). Today they are hand-assigned and collide -> it FAILS.
Expected failure cause (literal string in the output): the test name "scaffold remediation packets get typed auto-generated ids, not hand-assigned collisions".

## Reuse
The typed auto-id generation from TYPED-TASKS-001; the scaffold packet-create path in ADOPT-SCAFFOLD-001.

## Stop conditions
Hand-assigning any id in scaffolding; creating remediation packets in the engine's board instead of the adopted project's; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
