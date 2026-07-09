<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ADOPT-INVENTORY-001
title: adopt paso 1: inventario read-only de un repo existente (stack, verify cmd, CI, monorepo packages, artefactos playbook)
depends_on: []
write_set: ["src/adopt/inventory.ts","src/adopt/inventory.types.ts","src/adopt/inventory.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
First step of `adopt` (bringing an existing repo under the playbook; Aurora is the target). Add a READ-ONLY inventory of a target repo. `inventoryRepo(root)` returns a typed report describing what is there, mutating nothing:
- stack: language/runtime detected from package.json + tsconfig + lockfiles;
- verifyCommand: the test/verify script from package.json `scripts` (test/verify/ci), or null;
- ci: presence of .github/workflows (and the workflow names);
- playbookArtifacts: whether AGENTS.md, playbook.config.json, docs/packets/, .svp/ exist;
- git: remote url + default branch if resolvable;
- packages: for a monorepo, the workspace package list (package.json `workspaces` or pnpm-workspace.yaml).

## RED test (write first)
In src/adopt/inventory.test.ts add a test named exactly: "inventory detects the verify command and monorepo packages". Point inventoryRepo at a fixture dir (a package.json with a `test` script and a `workspaces` array), and assert the report's verifyCommand matches the script and its packages list contains the workspace names. New function → the FIRST failure is the missing export.
Expected failure cause (literal string in the output): the compiler/module error for the missing `inventoryRepo` export, OR the test name "inventory detects the verify command and monorepo packages".

## Reuse
node:fs read helpers; existing JSON parsing conventions (config.ts). Keep types in inventory.types.ts (layout rule).

## Stop conditions
Any write to the target repo; hardcoding Aurora-specific paths; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
