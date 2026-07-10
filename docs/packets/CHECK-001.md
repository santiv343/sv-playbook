<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: CHECK-001
title: check <target>: validacion deterministica de lo autorado (structure, instructions drift) — gate SDD que faltaba
depends_on: ["INSTRUCTIONS-MIRROR-001"]
write_set: ["src/cli/commands/check.ts","src/cli/commands/check.test.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Add `sv-playbook check <target>` — the deterministic validation surface for the SDD-above layer (PRINCIPLE-001), complementing `verify` (TDD-below). It gives authored artifacts a MECHANICAL gate instead of relying on reviewer prose. Targets:
- `check structure` — every authored packet/plan/spec has its required sections (a packet must have Task, RED test [unless a documented no-RED criterion packet], Stop conditions, Evidence). Report each violation as file + missing section.
- `check instructions` — the generated harness instruction mirrors match their single source (drift detection; pairs with INSTRUCTIONS-MIRROR-001). Fails if any mirror diverges from a fresh render.
Exit 1 with the offending rule/target id on any violation, exit 0 when clean. `check` with no target runs all targets.

## RED test (write first)
In src/cli/commands/check.test.ts add a test named exactly: "check structure fails when a packet is missing a required section". Create a fixture packet markdown lacking its Stop conditions section, run `check structure`, and assert it exits non-zero and names the missing section. New command → the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `check` command export, OR the test name "check structure fails when a packet is missing a required section".

## Reuse
The packet/document parser in src/packets/document.ts; the instructions renderer from INSTRUCTIONS-MIRROR-001 for the drift check; command registration + EXIT codes.

## Stop conditions
Duplicating the required-section list anywhere but one constants source; making check mutate anything (it is read-only); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
