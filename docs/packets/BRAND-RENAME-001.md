<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: BRAND-RENAME-001
title: product rename (BLOCKED on founder's final name; candidate: mechainized): single-source name constant + one-sweep mechanical rename + transition alias
depends_on: []
write_set: ["package.json","src/**","bin/**","README.md","docs/**","content/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Execute the product rename ONCE the founder confirms the final name. Candidate declared 2026-07-10: "mechAInized" (working spelling; npm/CLI reality is lowercase `mechainized` — founder-interface raised readability/pronunciation concerns; alternatives in the same concept family: `mechanized`, rails-family names). The CONCEPT is confirmed and frozen: the product's center is mechanizing AI agents and putting them on rails; only the final spelling/mark is pending.
BLOCKED until the founder answers the naming decision (record it via DECISION-LOG-001 when available; until then, the founder states it in chat and it gets noted here).
Scope when unblocked:
1. Rename in ONE sweep, mechanically: package.json name + bin entry, CLI banner/usage strings (single source — the name must live in ONE constant, find and fix any duplication), repo rename on GitHub (gh api), README/docs/VISION references, AGENTS/CLAUDE generated mirrors (regenerate via instructions --write, never hand-edit), content/ mentions.
2. `sv-playbook` remains as a bin ALIAS for one transition release so existing scripts/agents do not break; deprecation notice printed once per run.
3. The name constant becomes the single source: a test asserts no other file hardcodes the old or new name outside the constant + generated files.
4. npm availability + trademark sanity-check for the final name BEFORE executing (report findings, do not proceed on a taken name).

## RED test (write first)
Add a test named exactly: "the product name has a single source and no stray hardcoded brand strings". Assert a name constant exists and a repo-wide scan (excluding generated files + this test's fixtures) finds no other occurrence of the brand string outside it. Today the name is scattered -> it FAILS.
Expected failure cause (literal string in the output): the test name "the product name has a single source and no stray hardcoded brand strings".

## Reuse
The instructions/mirror regeneration (INSTRUCTIONS-MIRROR-001); the lint/scan gate patterns (CLI-SOLE-INTERFACE-001) for the single-source name check; gh CLI for the repo rename.

## Stop conditions
Executing before the founder confirms the final name; hand-editing generated mirrors; leaving the old bin without the transition alias; scattering the new name instead of the single constant; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
