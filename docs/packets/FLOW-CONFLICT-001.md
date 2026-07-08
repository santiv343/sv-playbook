---
id: FLOW-CONFLICT-001
title: planning-time write_set conflict detection on move to ready
depends_on: ["FLOW-TRANS-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts","src/db/store.ts","src/db/store.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Planning-time write-set conflict detection (origin: IDEA-025, a real planner incident). Two parts:
1. src/db/store.ts: add column `write_set TEXT NOT NULL DEFAULT '[]'` to the packets table schema (JSON array of globs; the DB rebuilds from files, no migration). src/tasks/service.ts: createPacket stores JSON.stringify(def.writeSet) in it.
2. movePacket: when the target status is 'ready', load the write_set of every packet currently in 'ready' or 'active' and refuse with LifecycleError('write_set conflict with <ID>') if any GLOB PREFIX overlaps. Overlap rule (keep it simple and deterministic): strip a trailing '/**' or '/*' from each glob to get its prefix; two globs overlap when one prefix equals the other or one is a path-prefix of the other (compare with '/' boundaries). Implement as a pure exported function overlaps(a: string, b: string): boolean with its own unit tests (at least: 'src/**' vs 'src/cli/**' -> true; 'src/a/**' vs 'src/b/**' -> false; 'eslint.config.js' vs 'eslint.config.js' -> true; 'src/**' vs 'docs/**' -> false).

## RED test (write first, appended to src/tasks/service.test.ts)
Test name: "moving to ready is refused when the write_set conflicts with an in-flight packet".
Body: create packet A (write_set ['src/x/**']), move ready. Create packet B (write_set ['src/x/inner/**']). assert.throws moving B to ready with /write_set conflict/.
Expected failure cause (literal string in the output): "moving to ready is refused when the write_set conflicts"
(Producible by construction: the failing assertion prints the test name in npm test output.)

## Reuse
src/tasks/service.ts (createPacket, movePacket), src/db/store.ts (SCHEMA), src/db/rows.ts (stringColumn).

## Stop conditions
Anything outside the write_set; any glob library (implement the prefix rule by hand, zero deps).

## Evidence required at close
red-test-output, verify-root, final-sha.
