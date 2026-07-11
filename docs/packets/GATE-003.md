<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-003
title: protected rail surface: CODEOWNERS generated from a single rail list, blessed-root hygiene check, rail-weakening red-team
depends_on: []
write_set: ["src/railsurface/**","src/cli/commands/doctor*","src/cli/commands/check*",".github/CODEOWNERS","src/redteam/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-11, verbatim): "esto pasa ahora con la db, mañana puede pasar con otra cosa. hay que revisar bien, y arreglar una sola vez y bien. fijate donde mas pueden haber problemas similares." AUDIT — the class is: shared mutable resource + agents holding god credentials + rules living agent-side. Instances found beyond the store (which STORE-003 fixes):
(a) GATE-WEAKENING SURFACE: any worker PR can edit playbook.config.json (already happened: backups silently disabled), .github/workflows/ci.yml (make verify a no-op), eslint.config.js (drop the JSON.parse ban), package.json (add runtime deps), tsconfig.json, opencode.json (its own permissions). Interim fix ALREADY APPLIED: .github/CODEOWNERS + require_code_owner_reviews on main — founder approval on those paths.
(b) BLESSED-ROOT HYGIENE: a worker wrote its implementation into the main checkout (incident 6). Nothing detects a dirty/derailed blessed root.
(c) GIT SURFACE: all agents share one god token — any agent can force-push other agents' branches (happened), delete branches, close others' PRs. Needs per-role credential scoping (founder decision on tokens) + repo rulesets.
Mechanize (a)+(b) durably; leave (c)'s token split as a recorded founder decision item:
1. RAIL LIST AS DATA: the protected-paths list lives in ONE place (config/constants); CODEOWNERS is GENERATED from it (like instructions --write); check/verify fails if CODEOWNERS drifts from the list.
2. Doctor check: blessed root must be on the default branch and CLEAN (untracked/modified files outside docs/packets flag LOUDLY, evented as incident) — closes (b) detection; the dispatch adapter (FLOW-008) refuses to launch agents while the root is dirty.
3. Gate in the review rubric + red-team case: a PR that touches a rail path AND was not approved by a code owner cannot be merged by an agent reviewer (the reviewer checks reviewDecision for rail paths before merging).
4. Red-team: a scripted PR weakening verifyCommand must be refused/flagged at every layer it crosses.

## RED test (write first)
In a rail-surface test add a test named exactly: "the CODEOWNERS file is generated from the rail list and drift fails the check". Generate from a fixture rail list, assert byte match against .github/CODEOWNERS fixture; mutate one path and assert check fails naming the drift. Today no generator exists -> the FIRST failure is the missing module.
Expected failure cause (literal string in the output): the compiler/module error for the missing rail-surface module, OR the test name "the CODEOWNERS file is generated from the rail list and drift fails the check".

## Reuse
The instructions --write generator pattern (single source -> generated artifact); doctor readout builders; check structure machinery; FLOW-008 adapter preflight; the events table.

## Stop conditions
A second source of truth for protected paths; blocking normal (non-rail) PRs; weakening any existing gate; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
