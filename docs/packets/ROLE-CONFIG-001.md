<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ROLE-CONFIG-001
title: roles configurables por-instancia (CLI-managed): default = los actuales, agregar/editar/quitar; toda edicion pasa check roles
depends_on: ["CONSTITUTION-001","ROLE-SCHEMA-001"]
write_set: ["src/cli/commands/role.ts","src/roles/**","src/cli/registry.ts","content/roles/**","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Roles are per-instance CONFIG, not hardcoded engine (PRINCIPLE-013). The current charters (planner, implementer, reviewer, orchestrator, product) ship as the DEFAULT role set; an instance can add roles (designer, security, QA), modify, or remove them — as long as every role passes `check roles` (ROLE-SCHEMA-001).
1. Roles live per-instance, CLI-managed: `role add/set <name> --body-file`, `role show/list <name>`, `role remove <name>`. Stored in the instance (constitution store from CONSTITUTION-001), with generated read-only .md exports under content/roles/ (banner "GENERATED — edit via the CLI"). Never hand-edited.
2. Each role carries its config bindings: capability floor (min model), and which transition gates/workflow steps it owns.
3. Ship the current five charters as the seeded DEFAULT set for a new instance (init seeds them; adopt may infer/keep the project's existing conventions).
4. `check roles` runs on any role change (and in verify) so a custom or edited role cannot land ambiguous.

## RED test (write first)
In a role-config test add a test named exactly: "role add then show round-trips a custom role and check roles validates it". Add a well-formed custom role via the CLI, show it (from the store), and assert it round-trips AND passes check roles; adding a malformed one is rejected. New feature -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `role` command export, OR the test name "role add then show round-trips a custom role and check roles validates it".

## Reuse
The constitution store + CLI-managed export pattern (CONSTITUTION-001); the `check roles` gate (ROLE-SCHEMA-001); command registration.

## Stop conditions
Hardcoding the role set as engine (defaults are seeded config); a hand-edited role file as the source (CLI-managed only); letting an ambiguous role land (check roles must pass); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
