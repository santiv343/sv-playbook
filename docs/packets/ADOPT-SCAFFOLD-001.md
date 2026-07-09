<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ADOPT-SCAFFOLD-001
title: comando adopt: inventory+gap -> scaffold (config, AGENTS.md, baseline, packets de remediacion via CLI)
depends_on: ["ADOPT-INVENTORY-001","ADOPT-GAP-001","ADOPT-BASELINE-001"]
write_set: ["src/cli/commands/adopt.ts","src/cli/commands/adopt.test.ts","src/cli/registry.ts","content/cli.md","src/adopt/scaffold.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
The `sv-playbook adopt` command that ties the pieces together. On a target repo it runs inventory (ADOPT-INVENTORY) -> gap analysis (ADOPT-GAP) -> then SCAFFOLDS (writes) the minimum to bring it under the playbook:
1. playbook.config.json — productName (from dir/package.json name), a default tier, verifyCommand (detected by inventory), chatLanguage default; record the baseline (ADOPT-BASELINE).
2. AGENTS.md cold-start — from the playbook's own template/content.
3. Remediation packets — one actionable packet per addressable gap, authored via the CLI's own packet-create path (so the adopted repo gets a backlog of playbook-ification tasks in its board).
Guard: never clobber an existing playbook.config.json or AGENTS.md without `--force`; without `--force` on an already-adopted repo, report the gaps and stop. Register the command in the CLI and document it in content/cli.md.

## RED test (write first)
In src/cli/commands/adopt.test.ts add a test named exactly: "adopt scaffolds config, AGENTS.md and remediation packets for a bare repo". Run adopt against a fixture repo lacking config/AGENTS.md, then assert playbook.config.json and AGENTS.md now exist AND at least one remediation packet was created. New command → the FIRST failure is the missing registration/export.
Expected failure cause (literal string in the output): the compiler/module error for the missing `adopt` command export in registry.ts, OR the test name "adopt scaffolds config, AGENTS.md and remediation packets for a bare repo".

## Reuse
inventoryRepo (ADOPT-INVENTORY), analyzeGaps (ADOPT-GAP), baseline (ADOPT-BASELINE); the packet-create path in src/tasks/service.ts; command registration pattern; the AGENTS.md template from content/.

## Stop conditions
Clobbering existing config/AGENTS.md without --force; writing remediation packets by any path other than the CLI's validated create; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
