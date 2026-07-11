<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: WORKTREE-HYGIENE-001
title: higiene de worktrees: WIP cap (maxConcurrentWorkers) + .worktrees/ oculto + auto-cleanup al cerrar
depends_on: []
write_set: ["src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","src/schema/config.constants.ts",".gitignore","content/dispatch/worker.md","content/dispatch/adapters.md","content/roles/orchestrator.md","content/roles/reviewer.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Keep worker worktrees from cluttering the workspace and bloating disk. Note up front: git worktrees SHARE the .git object store, so they are NOT full repo copies — the only per-worktree cost is `node_modules`, which the WIP cap below bounds. Three mechanized changes:
1. WIP CAP — add `maxConcurrentWorkers` (positive integer, default 3) to the config schema (src/config). The orchestrator dispatches at most this many workers/worktrees at once; most packets serialize on write_set conflicts anyway, so a small cap is plenty. Gates/serve can read it.
2. LOCATION — worktrees live under `<repo-root>/.worktrees/<packet-id>`, NOT as siblings in the parent projects folder (which is what left visible `wt-*` clutter). Add `.worktrees/` to .gitignore. State this convention in content/dispatch/worker.md, content/dispatch/adapters.md, and content/roles/orchestrator.md (the harness creates the worktree there).
3. AUTO-CLEANUP — the packet-close step removes the packet's worktree (`git worktree remove <path>`) after its PR merges, so worktrees never accumulate (at rest you have zero; in flight, at most maxConcurrentWorkers). Document this as a required step in content/roles/reviewer.md (M3 close) and content/roles/orchestrator.md.

## RED test (write first)
In src/config.test.ts add a test named exactly: "config defaults maxConcurrentWorkers and rejects a non-positive value". Assert loadConfig without the field returns the default (3), and that a config with `maxConcurrentWorkers: 0` (or a non-integer) throws a ConfigError. Today the field is unknown/ignored → it FAILS.
Expected failure cause (literal string in the output): the test name "config defaults maxConcurrentWorkers and rejects a non-positive value".

## Reuse
The positiveIntegerOr validator and DEFAULTS in src/config.ts / config.constants.ts; the existing dispatch + charter docs.

## Stop conditions
Making the CLI itself create/remove worktrees (the harness/orchestrator does that — the CLI only reads config); per-worktree isolated stores (the store stays shared for serve); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
