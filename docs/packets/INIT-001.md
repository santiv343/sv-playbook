<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: INIT-001
title: init: puerta de proyecto NUEVO (greenfield) — scaffold config/AGENTS.md/foundation/board vacio
depends_on: ["INSTRUCTIONS-MIRROR-001"]
write_set: ["src/cli/commands/init.ts","src/cli/commands/init.test.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
`sv-playbook init` — the door for a NEW project (adopt is for existing repos; this is greenfield). It scaffolds a fresh project under the playbook. For v1 keep it flag-driven (the interactive wizard is a thin layer authored later): accept `--name`, `--tier`, `--verify <cmd>`, `--lang`, or a seed config file. It writes:
- playbook.config.json (productName, tier, verifyCommand, chatLanguage, no baseline — new projects are strict from day one);
- AGENTS.md cold-start (via the INSTRUCTIONS-MIRROR generator — single source);
- an empty docs/packets/ dir and a docs/specs/ foundation-doc skeleton;
- initializes the .svp store (empty board).
Guard: refuse on an already-initialized dir (existing playbook.config.json or .svp) without `--force`. Reuse the scaffold path shared with `adopt` (config + AGENTS.md writing) so there is one implementation, not two.

## RED test (write first)
In src/cli/commands/init.test.ts add a test named exactly: "init scaffolds config, AGENTS.md and an empty board for a new project". Run init in an empty fixture dir with the required flags, then assert playbook.config.json and AGENTS.md exist and the store opens with zero packets. New command → the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `init` command export, OR the test name "init scaffolds config, AGENTS.md and an empty board for a new project".

## Reuse
The INSTRUCTIONS-MIRROR-001 generator for AGENTS.md; the config writer; the adopt scaffold path (shared); command registration.

## Stop conditions
Duplicating the config/AGENTS.md scaffold instead of sharing it with adopt; clobbering an initialized dir without --force; building the interactive wizard here (that is a later thin layer); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
