<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-012
title: forge port: PR/checks/merge/protection behind an adapter (github first, gitlab/bitbucket as additions) with capability matrix + engine fallbacks
depends_on: []
write_set: ["src/forge/**","src/cli/commands/doctor*"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-11, verbatim): "codeowners esta bien si tiene github, pero si estamos gitlab, bitbucket, que pasa. hay tantas cosas especificas de mi maquina... debe ser un framework, no algo que imponga usar algo especifico." Audit: the engine is GitHub-coupled today — task close verifies merges via gh, the reconciler/merge-queue speak gh, GATE-003 materializes protection as GitHub CODEOWNERS + branch protection. Same hexagonal answer as the executor port (FLOW-008):
1. FORGE PORT: the engine expresses only ABSTRACT capabilities — prIsMerged(id), prState(id), updateBranch(id), mergeWhenGreen(id), checksFor(sha), protectPaths(paths, approverRole), listOpenPrs(). Engine code never mentions a vendor; it depends on the port.
2. ADAPTERS (config-selected: forge.provider): `github` first (gh CLI via child_process — extract every existing gh call into it, they are already inventoried by grep 'execFileSync.*gh\|gh pr'); `gitlab`/`bitbucket` later as pure additions (registry pattern). A `none` adapter for forge-less instances: PR-shaped operations degrade to local-branch checks with LOUD reduced-guarantee warnings.
3. CAPABILITY DECLARATION + FALLBACK (the framework guarantee): each adapter declares which capabilities it provides natively. For every rail capability the forge lacks (e.g., path-protection on a forge without CODEOWNERS semantics), the ENGINE-SIDE fallback covers it: the review preflight (GATE-004) checks rail-path diffs for a recorded founder approval itself — forge-independent. doctor reports the capability matrix: native / engine-fallback / uncovered (uncovered = refuse to arm the gate silently).
4. GATE-003 composes: the rail list (data) materializes through the forge adapter (CODEOWNERS on github, approval rules on gitlab) AND always through the engine-side preflight fallback — double coverage on capable forges, single-but-real coverage everywhere else.
5. MACHINE AGNOSTICISM (same ruling): nothing machine-specific hardcoded — paths, executor binaries, models, temp dirs all come from validated config (audit and migrate any hardcoded remnants found in engine code; instance config is where opinions live).

## RED test (write first)
In a forge-port test add a test named exactly: "engine code reaches the forge only through the port and the capability matrix reports fallbacks". Two parts: (a) a stub adapter records calls - run the close-verification path against it and assert no direct gh invocation happened (grep the engine sources for direct gh calls outside the github adapter = the enforcement part, wired into lint/check); (b) a fixture adapter lacking path-protection: assert doctor's matrix shows engine-fallback for that capability, not silence. Today gh calls are inline -> it FAILS.
Expected failure cause (literal string in the output): the compiler/module error for the missing forge port module, OR the test name "engine code reaches the forge only through the port and the capability matrix reports fallbacks".

## Reuse
The executor port/adapter registry pattern (FLOW-008 - same shape, do not invent a second adapter mechanism); existing gh call sites (inventory by grep); the eslint no-restricted-syntax mechanism for banning direct gh outside the adapter; doctor readout builders; validated config schema (src/schema).

## Stop conditions
Any vendor name in engine (non-adapter) code; a second adapter registry; silently degrading a rail when a capability is missing (matrix + loud warning, or refuse); SDK dependencies (CLI tools via child_process only); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
