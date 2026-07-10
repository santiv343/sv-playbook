<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: CONSTITUTION-001
title: constitucion por-instancia CLI-managed en la DB (vision, definicion de producto, principios): playbook se alinea a la instancia, no la impone (base para Aurora)
depends_on: ["STORE-MIGRATION-SAFETY-001"]
write_set: ["src/cli/commands/constitution.ts","src/constitution/**","src/cli/registry.ts","src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
(foundational) A product's CONSTITUTION — its declared vision, product definition, and principles — is PER-INSTANCE data, CLI-managed and DB-resident, NOT hardcoded engine files. This is what lets playbook be pointed at Aurora and ALIGN to Aurora's constitution instead of imposing sv-playbook's. Same error class as hand-editing a packet: a project's vision/principles are instance data with a generated export, not engine source.
1. Schema (migration via STORE-MIGRATION-SAFETY-001): a `constitution` store keyed by section — `vision`, `product_definition` (prose bodies) and `principles` (an ordered list of {id, rule, rationale}); extensible to more keys. Per-instance (each .svp has its own).
2. CLI (the only writer): `constitution set <section> --body-file <path>`, `constitution add-principle --rule ... --rationale ...`, `constitution show <section> [--json]`, `constitution list`. A generated read-only export under docs/constitution/ for git durability + review (never hand-edited; regenerated on set, banner "GENERATED").
3. Alignment: agents, serve, and the REVIEWER read the INSTANCE's constitution to align — a review consults this instance's vision/principles, not the engine's. The engine's universal invariants stay in content/principles.md and are non-negotiable; the instance's constitution is declared ON TOP.
4. Declared via the doors: `init` interviews for it; `adopt` infers/prompts it from the target. Dogfood: sv-playbook seeds its OWN constitution from the current docs/VISION.md content (VISION.md is then reframed as sv-playbook's declared instance vision; the engine keeps only universal invariants in principles.md).

## RED test (write first)
In a constitution test add a test named exactly: "constitution set then show round-trips the vision through the store". Set the vision section from a body, then show it, and assert the stored/returned vision matches (from the DB, and the generated export exists). New feature -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `constitution` command export, OR the test name "constitution set then show round-trips the vision through the store".

## Reuse
The store/migration path (STORE-MIGRATION-SAFETY-001); the generated-export generator; command registration; the doc parser.

## Stop conditions
Hardcoding any instance's vision/principles as engine source; a hand-edited constitution file as the source (CLI-managed only); moving universal invariants into the per-instance constitution; unsafe migration.

## Evidence required at close
red-test-output, verify-root, final-sha.
