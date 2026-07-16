<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ADOPT-INVENTORY-FIX-001
title: "fix: inventory detection — stack, artifacts, CI, git, pnpm workspaces"
depends_on: ["ADOPT-INVENTORY-001"]
write_set: ["src/adopt/inventory.ts","src/adopt/inventory.types.ts","src/adopt/inventory.test.ts"]
requirements: []
evidence_required: []
tags: []
---

## Task
The inventory implementation is a stub — stack detection, playbook artifact checks, CI workflow scanning, git info, and pnpm workspace support all return hardcoded empty/null values. This makes the adopt report unreliable (false gaps).

Fix inventoryRepo to actually detect:
1. **Stack**: detect Node/TypeScript from package.json (dependencies, devDependencies, tsconfig presence), presence of lockfiles (pnpm-lock.yaml, package-lock.json, yarn.lock), and monorepo tools (turbo.json, nx.json, lerna.json).
2. **Playbook artifacts**: check for AGENTS.md, playbook.config.json, docs/packets/ directory, .svp/ directory using existsSync.
3. **CI workflows**: scan .github/workflows/ directory for workflow YAML files, return their names.
4. **Git info**: use execFileSync to run `git remote get-url origin` and `git rev-parse --abbrev-ref HEAD` in the target repo.
5. **Monorepo packages**: in addition to package.json `workspaces`, read pnpm-workspace.yaml if it exists and extract the packages list.

## RED test (write first)
In src/adopt/inventory.test.ts add a test named exactly: "inventory detects AGENTS.md, git info, and pnpm workspace packages". Create a fixture with AGENTS.md, package.json (name, test script, no workspaces), pnpm-workspace.yaml with package globs, a .github/workflows/ci.yml, and a git repo with a remote. Assert:
- playbookArtifacts['AGENTS.md'] is true
- git remoteUrl is not null
- packages list contains entries from pnpm-workspace.yaml
- ci.workflows contains 'ci.yml'
- stack includes 'typescript'

Expected failure cause: the test name "inventory detects AGENTS.md, git info, and pnpm workspace packages".

## Reuse
Existing inventory types in src/adopt/inventory.types.ts. The existing test fixture in inventory.test.ts.

## Stop conditions
Leaving any hardcoded empty/null value; touching files outside the write_set; breaking the existing test "inventory detects the verify command and monorepo packages".
