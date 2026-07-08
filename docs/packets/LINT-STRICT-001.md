---
id: LINT-STRICT-001
title: zero-tolerance gates: no-nested-ternary, cognitive-complexity, duplicate-string threshold 2
depends_on: []
write_set: ["eslint.config.js","src/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Tighten the graduated gates (zero-tolerance directive, origin: PR #5 review findings on cheap-model output). In eslint.config.js typed block add:
- 'no-nested-ternary': 'error'  (kills the IIFE-in-ternary pattern, F1)
- 'sonarjs/cognitive-complexity': ['error', 10]
- lower 'sonarjs/no-duplicate-string' threshold from 3 to 2 (PRODUCTION code; the existing test-file override already turns it off for tests)
- 'complexity': lower from 12 to 10
Then run npm run verify and fix EVERY violation the tightened gates surface in src/** by improving the code (extract helpers, flatten branches, single-source strings) - never by suppressions, rule weakening, or test-override widening. List each fixed file in the PR description.

## RED test (write first)
Not a unit test - the gate itself is the test. RED = run npm run lint AFTER adding the rules and BEFORE fixing code: it must FAIL listing the new violations. Copy that failing output into the evidence. GREEN = verify exits 0 after the fixes.
Expected failure cause (literal string in the output): "no-nested-ternary"

## Reuse
eslint.config.js (P4 gate block and its taste-origin comments), src/db/rows.ts style for any extracted helpers.

## Stop conditions
A fix that would require touching files outside src/** or eslint.config.js; any rule that cannot pass without a suppression (report it instead - it may need a threshold discussion, not a hack).

## Evidence required at close
red-test-output, verify-root, final-sha.
