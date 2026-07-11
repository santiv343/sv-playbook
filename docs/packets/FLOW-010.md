<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-010
title: reconciler: convergence loop between the board (desired) and the world (observed) - doctor detects, reconcile acts
depends_on: []
write_set: ["src/reconcile/**","src/cli/commands/reconcile*","src/cli/commands/doctor*"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-11, verbatim): "debemos mecanizar todo lo que se pueda... no puede ser que no coincidan estados de cosas que literalmente se pueden ejecutar comandos. como los merge. y pasa en muchos lados. es muy fragil todo esto." The class: reconciliation between the board (desired state) and the world (observed state: git, GitHub PRs/CI, backups, exports) is done today by a PM in chat, by hand, repeatedly. Tonight's evidence: 6+ manual update-branch rounds to walk an auto-merge cascade; task close after merges; a manual backup to clear a doctor warn; export drift fixed by hand. Every one of those is a derivable diff plus an executable command — machine work.
Build the RECONCILER — one convergence loop, doctor's actuator:
1. OBSERVE: one readout that joins the board with the world: open PRs (state, mergeStateStatus, checks, linked packet), packets in review with merged PRs, backup age/richness, export drift, dirty blessed root (GATE-003 check), stale leases. Reuse doctor's builders — doctor DETECTS, reconcile ACTS; one source.
2. DIFF -> ACTION TABLE (data, not code branches): each divergence maps to {action, safety}. SAFE actions auto-execute under `reconcile --apply` (and on the daemon's timer when STORE-003 lands): gh pr update-branch when BEHIND with auto-merge on; task close <ID> --pr <n> when a review packet's PR is merged; backup state when stale/poorer; export regen for DB->md drift. UNSAFE divergences (conflicting PR, failing CI, rail-file PR pending founder approval) are REPORTED with the exact command, never executed.
3. `reconcile` (dry-run: table of divergence -> action -> safety) and `reconcile --apply` (executes SAFE rows, events every action taken). Serve renders the same table (composes with SERVE/FLOW-009).
4. The merge-cascade leg IS MERGE-QUEUE-001's scope — absorb or depend on it, do not duplicate: one queue walker that keeps updating+merging auto-merge PRs until the set drains, conflict -> loud event.
5. Every applied action is evented (who=reconciler, what, before/after) — the audit trail shows convergence happening mechanically.
Opinion-free: the action table ships as default config; instances can mark rows manual-only.

## RED test (write first)
In a reconciler test add a test named exactly: "reconcile computes divergences as an action table and applies only the safe rows". Fixture world-state (stub gh/git readers): a BEHIND auto-merge PR, a review packet with a merged PR, a stale backup, and a conflicting PR. Assert the dry-run table lists all four with correct safety; assert --apply executes exactly the three safe ones (recorded by stub executors) and events them, and the conflicting PR is only reported. Today no reconciler exists -> the FIRST failure is the missing module.
Expected failure cause (literal string in the output): the compiler/module error for the missing reconciler module, OR the test name "reconcile computes divergences as an action table and applies only the safe rows".

## Reuse
doctor's check builders (single source of observation); MERGE-QUEUE-001 (the PR leg - depend on or absorb); BOARD-SYNC-001; BUG-006 stamps; the events table; gh CLI via child_process (no SDKs); the daemon timer when STORE-003 lands.

## Stop conditions
Executing any UNSAFE row automatically; a second observation source diverging from doctor; polling GitHub aggressively (respect a configurable interval, default lazy); silent actions (everything evented); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
