<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ADOPT-BASELINE-001
title: adopt: baseline mode — grandfathering de violaciones preexistentes; gates fallan solo en lo nuevo
depends_on: []
write_set: ["src/config.ts","src/config.types.ts","src/adopt/baseline.ts","src/adopt/baseline.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Baseline mode so an existing project (Aurora) can adopt without failing on its mountain of pre-existing violations. Record a baseline in playbook.config.json under `baseline`: the adopt commit SHA + timestamp + an optional set of grandfathered violation fingerprints. Gates consult the baseline: a violation present in the baseline is GRANDFATHERED (report as a warning, do not fail); a NEW violation (not in the baseline) fails normally. Add `baseline` to the config schema + validation (optional object; absent = no baseline = strict from the start, the default for `init`ed projects).

## RED test (write first)
In src/adopt/baseline.test.ts add a test named exactly: "a baselined violation is grandfathered while a new one fails". With a baseline recording violation fingerprint X, assert that checking X returns grandfathered (non-failing) and checking a new fingerprint Y returns failing. New function → missing export first.
Expected failure cause (literal string in the output): the compiler/module error for the missing `baseline` export, OR the test name "a baselined violation is grandfathered while a new one fails".

## Reuse
config load/validate helpers in src/config.ts (add the `baseline` field there, types in config.types.ts); baseline logic in src/adopt/baseline.ts.

## Stop conditions
Making baseline the default for new projects (only adopt sets it); letting a NEW violation pass; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
