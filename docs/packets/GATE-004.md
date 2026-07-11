<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-004
title: review preflight: every deterministic review check runs as code before any reviewer agent is summoned
depends_on: []
write_set: ["src/review/**","src/cli/commands/review*","src/redteam/preflight.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
First enforcement arm of the semantic-kernel principle (constitution 5634be06, founder 2026-07-11: "lo que es determinista lo hacemos por codigo; los agentes se encargan de la parte semantica"). Evidence from tonight's review rounds: reviewer agents spent most of their run on DETERMINISTIC checks — head-sha match, npm run verify in a clean worktree, diff-inside-write_set, RED-test-name verbatim grep, CI status, grep-able stop conditions, deviation-bullet presence. Every one is code. Build the REVIEW PREFLIGHT:
1. `review preflight <ID|PR>` — a command that mechanically produces the preflight report for a PR/packet pair: {head sha + match vs reported, CI checks status per platform, clean-worktree verify result (disposable worktree under .worktrees/review/, auto-cleaned), diff file list vs write_set (violations named), RED test name present verbatim yes/no, grep results for each grep-able stop condition, DEVIATION bullets found}. Output: human table + --json.
2. GATE: `task move <ID> done` (and the reviewer dispatch in FLOW-008) requires a PASSING preflight recorded as an event — an agent reviewer is only summoned AFTER preflight passes, receives the report in its prompt, and judges ONLY semantics: design quality, correctness beyond tests, reuse/taste, whether the tests prove the requirement. The reviewer prompt template shrinks to the semantic questions.
3. Failures short-circuit CHEAPLY: a preflight failure returns the packet to the fixer with the mechanical finding — no reviewer tokens spent on a diff that violates its write_set.
4. Composes with GATE-PIPELINE-001 (preflight as a pipeline stage) and FLOW-010 (the reconciler can re-run preflights when heads move); do not fork the existing gate implementations (write_set check, verify gate) — the preflight CALLS the same single sources and aggregates.
5. Red-team case: a PR whose diff exceeds its write_set must be caught by preflight BEFORE any reviewer dispatch.

## RED test (write first)
In a preflight test add a test named exactly: "review preflight aggregates the mechanical checks and a write_set violation fails it before any reviewer runs". Fixture repo + branch whose diff touches a file outside the packet write_set: assert the report marks the violation naming the file, overall status FAIL, and the preflight event records it; fix the diff and assert PASS with every check populated. Today no preflight exists -> the FIRST failure is the missing module/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing preflight module, OR the test name "review preflight aggregates the mechanical checks and a write_set violation fails it before any reviewer runs".

## Reuse
checkWriteSetConflict / the write_set glob machinery (single source); the verify gate runner; git/gh via child_process; the worktree conventions (WORKTREE-HYGIENE-001, merged); the events table; doctor's table renderers.

## Stop conditions
Re-implementing any existing gate inside the preflight (aggregate, never fork); the preflight making semantic judgments (it reports facts only); blocking on network when CI status is unavailable (report unknown, do not hang); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
