---
id: TEST-QUIET-001
title: quiet dot reporter for worker-local test loops (thousands of context tokens per mission)
depends_on: []
write_set: ["package.json","content/dispatch/worker.md"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

﻿## Task
Token economy (IDEA-036): workers run tests 4+ times per mission and each run streams ~55 test-name lines into their context for zero information. Add to package.json scripts: `"test:quiet": "npm run build && node --test --test-reporter dot \"dist/**/*.test.js\"`. Do NOT touch the existing test or verify scripts (CI keeps the full reporter). Update content/dispatch/worker.md: STEP 6 and STEP 8 run `npm run test:quiet` instead of `npm test` (STEP 6 note: the dot reporter still prints failure details and test names for FAILING tests, so the RED check works unchanged); STEP 9 stays `npm run verify` untouched.

## RED check (content+config packet)
Before: `npm run test:quiet` exits with an npm error (missing script) - copy that output. After: it runs the suite with dot output and exits 0.
Expected failure cause (literal string): "Missing script"

## Reuse
package.json scripts block, content/dispatch/worker.md STEP 6/8 wording.

## Stop conditions
Anything outside the write_set; changing the full reporter anywhere else.

## Evidence required at close
verify-root, final-sha.
