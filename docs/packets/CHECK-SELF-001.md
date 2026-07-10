<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: CHECK-SELF-001
title: dogfood: check self audita el engine contra sus propios principios (CLI-only, opinion-free, roles, single-source) — alignment como gate permanente, no auditoria a mano
depends_on: ["CHECK-001","ROLE-SCHEMA-001"]
write_set: ["src/cli/commands/check.ts","src/check/self.ts","src/check/self.test.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Dogfood: the engine must CONTINUOUSLY verify it follows its OWN principles, so "does the rest accompany" is a permanent gate, not a manual point-by-point audit (which is exactly the fragile, memory-dependent thing the playbook exists to kill). Add `check self` (a target of the check command, run inside verify) that audits sv-playbook's engine against its principles and reports/fails per the tier's strictness:
1. CLI-only (PRINCIPLE-012): assert no DatabaseSync/node:sqlite outside src/db (reuses the CLI-SOLE-INTERFACE rule).
2. Opinion-free (PRINCIPLE-013): read a DECLARED registry of engine opinions that must be config (content or a constants list: state machine, gate thresholds, module-layout rule, roles, tiers, kanban columns, dispatch routing) and flag any that are still hardcoded in code with no config source.
3. Roles conform to the role schema (delegates to `check roles`).
4. Authored artifacts conform to structure + instructions (delegates to `check structure`/`check instructions`).
5. Single-source of RESPONSIBILITY and of facts across content — e.g. "who merges" stated once and consistently; no stale reference to removed machinery.
`check self` aggregates these into one report; a person or agent runs it to KNOW the engine is coherent, and verify runs it so drift can't land.

## RED test (write first)
In a check-self test add a test named exactly: "check self flags a declared engine opinion that is hardcoded with no config source". Seed the opinion registry with an opinion whose value is hardcoded in a fixture module and has no config binding, run check self, and assert it reports that opinion as a misalignment. Today no self-audit exists -> it FAILS.
Expected failure cause (literal string in the output): the test name "check self flags a declared engine opinion that is hardcoded with no config source".

## Reuse
The check command + its sub-targets (CHECK-001, ROLE-SCHEMA-001, CLI-SOLE-INTERFACE-001); the content parsers.

## Stop conditions
Making check self a one-off script instead of a repeatable gate; hardcoding the opinion list in more than one place; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
