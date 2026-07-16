<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-020
title: check: per-file debt baselines plus baseline-write ratchet command
depends_on: []
write_set: ["src/check/**","src/cli/**","playbook.config.json","docs/packets/**"]
requirements: ["Global-count baselines allow silent net-zero swaps and force hand-editing"]
evidence_required: ["net-zero swap test failing then passing","migration totals equal 1317/276/278","baseline-write refusal on increased file"]
---

## Problem

Debt baselines (duplicateStrings 1317, literalComparisons 276, ormApplicationSql 278) are frozen by a single GLOBAL count + digest per kind. Three failures follow: (a) touching any counted line re-digests everything — ceremony on every refactor; (b) there is no CLI to re-baseline, so agents hand-edit `playbook.config.json`, violating PRINCIPLE-012; (c) a global count allows silent swap — fix one violation, add one elsewhere, net 0, gate passes. The freeze works; its granularity is wrong.

## Task

Move all three debt baselines from global count to PER-FILE counts, and give re-baselining a mechanical verb.

1. Baseline format in `playbook.config.json`: per kind, a map of file path → violation count (plus a per-kind digest over the sorted map for tamper-evidence). One-time migration from the current global format: the per-file totals at migration time MUST equal the current global counts (1317/276/278) — prove it in the migration test.
2. Check semantics: a file's count may only decrease or stay; any increase fails; a file not in the baseline with violations fails; entries for deleted files are dropped by `--write` (and ignored with a note by the read path). Net-zero swaps across files now FAIL — add a red-team-style test for exactly that attack.
3. New subcommand `check baseline --write`: recomputes all three baselines mechanically and rewrites the config section. It must refuse to write if any per-file count INCREASED (re-baseline is a ratchet, not a reset) — decreases and dropped files only.
4. Keep the three kinds and their counting logic byte-identical; only the aggregation granularity changes.

## RED test (write first)

In `src/check/baseline.test.ts` add a test named exactly: `per-file baseline fails on net-zero swap across files`. Fixture config with per-file baselines, fixture source where one file drops a violation and another gains one (global count unchanged), assert the check FAILS naming the increased file. Today the per-file format is rejected/ignored → the swap passes → FAILS.
Expected failure cause (literal string in the output): the test name `per-file baseline fails on net-zero swap across files`.

Additional required tests (after RED):
- Migration: global 1317/276/278 → per-file map whose totals equal the same numbers.
- `check baseline --write` refuses when any file increased; writes when only decreases/drops exist.
- Deleted file entries are pruned by `--write`.

## Mechanism necessity (ENTRY-013)

The baseline mechanism itself is correct and stays — same config section, same check phase, same three kinds. This packet changes granularity and adds a flag to the existing `check` command. Zero new tables, zero new concepts; it removes the hand-editing path (a PRINCIPLE-012 violation) instead of adding anything.

## Stop conditions

1. All three baselines live in per-file form; the read path enforces per-file monotonicity.
2. `check baseline --write` exists and ratchets (never raises a count).
3. The named tests above exist and pass against the built output; the net-zero swap test fails the gate as designed.
4. `npm run verify` passes all four components with the migrated baselines in place.

## Evidence

- The RED test failing before, passing after (literal output).
- Migration test output proving totals equality (1317/276/278).
- `--write` refusal output on an increased file.
- Verify manifest digest.
