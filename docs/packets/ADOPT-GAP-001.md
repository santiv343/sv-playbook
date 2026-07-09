<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ADOPT-GAP-001
title: adopt paso 2: gap analysis (inventario vs requisitos del playbook) -> lista tipada de gaps
depends_on: ["ADOPT-INVENTORY-001"]
write_set: ["src/adopt/gap.ts","src/adopt/gap.types.ts","src/adopt/gap.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Gap analysis for `adopt`: given an inventory report (from ADOPT-INVENTORY-001), compare it against the playbook's adoption requirements and produce a typed, ordered gap list. Each requirement is classified present | missing | violating with a short reason. Requirements to check:
1. playbook.config.json exists AND declares a tier;
2. AGENTS.md cold-start exists;
3. a verify command is defined;
4. docs/packets/ directory exists;
5. a CI workflow that runs verify exists;
6. git default branch is protected (best-effort: note "unknown" if it cannot be checked offline).
Output: gaps ordered missing/violating first, present last. Read-only (operates on the inventory, not the repo).

## RED test (write first)
In src/adopt/gap.test.ts add a test named exactly: "gap analysis flags missing AGENTS.md and missing config as gaps". Feed a synthetic inventory where AGENTS.md and playbook.config.json are absent, and assert both appear in the result as `missing`. New function → missing export first.
Expected failure cause (literal string in the output): the compiler/module error for the missing `analyzeGaps` export, OR the test name "gap analysis flags missing AGENTS.md and missing config as gaps".

## Reuse
The inventory report type from src/adopt/inventory.types.ts. Keep gap types in gap.types.ts.

## Stop conditions
Reading the repo directly instead of the inventory (single source: inventory is the input); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
