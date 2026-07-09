<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ADOPT-INVENTORY-FIX-001
title: fix inventory: AGENTS.md/pnpm-workspace packages/git remote/stack mal detectados en la corrida real de Aurora
depends_on: []
write_set: ["src/adopt/inventory.ts","src/adopt/inventory.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Fix the adopt inventory detection bugs found on the FIRST real run against aurora-monorepo (a pnpm + turbo TS monorepo). The inventory reported false facts that would make scaffolding act on wrong data, so this must land and the run must be repeated before any Aurora scaffold. Four detections to fix in src/adopt/inventory.ts:
1. AGENTS.md presence — it exists at the Aurora root but was reported missing. Detect the root file reliably (exact path/case, existsSync at repo root).
2. Monorepo packages — `pnpm-workspace.yaml` exists but packages came back empty. Parse `pnpm-workspace.yaml` (`packages:` glob list) in addition to package.json `workspaces`, and resolve each glob to the real package directories.
3. Git remote + default branch — came back unknown. Resolve via `git remote get-url origin` and the default branch (`git symbolic-ref refs/remotes/origin/HEAD` or `git rev-parse --abbrev-ref HEAD`); only report 'unknown' when the command genuinely fails (offline/no remote), not always.
4. Stack — returned 'unknown' for a pnpm/turbo TS monorepo. Detect the stack from root package.json + tsconfig + pnpm-workspace.yaml + turbo.json.

## RED test (write first)
In src/adopt/inventory.test.ts add a test named exactly: "inventory detects AGENTS.md, pnpm-workspace packages, and the git remote". Build a fixture repo dir with an AGENTS.md, a pnpm-workspace.yaml listing a package glob that resolves to a real package dir, and a git remote; run inventoryRepo and assert AGENTS.md shows present, packages contains the resolved package, and the remote is resolved (none of them missing/empty/unknown). Today they are mis-detected → it FAILS.
Expected failure cause (literal string in the output): the test name "inventory detects AGENTS.md, pnpm-workspace packages, and the git remote".

## Reuse
The existing inventoryRepo and its report type; node:fs; a minimal YAML read for pnpm-workspace.yaml (the `packages:` list — a tiny hand parse is fine, no new dep).

## Stop conditions
Reporting 'unknown' when the data is actually detectable; adding a heavy YAML dependency for one field; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
