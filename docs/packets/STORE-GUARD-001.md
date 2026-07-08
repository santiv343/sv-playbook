---
id: STORE-GUARD-001
title: rebuild refuses with live leases unless --force (IDEA-034)
depends_on: []
write_set: ["src/cli/commands/rebuild.ts","src/tasks/service.ts","src/tasks/service.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Rebuild live-lease guard (IDEA-034; origin: an EPERM corruption happened because a destructive op ran while other processes held the DB). In src/cli/commands/rebuild.ts: before deleting the DB, open the store (skipVersionCheck true), read all leases, and compute how many are FRESH (reuse leaseOf/LEASE_TTL logic - import from service or its constants; if the freshness helper is private, export a small leasesFresh(store): number from src/tasks/service.ts). If any fresh lease exists and --force was NOT passed: print `rebuild refused: <n> live lease(s) - workers may be running. Pass --force to override.` and exit 1 (GATE_FAIL). With --force or zero fresh leases: proceed exactly as today. Add --force parsing to the rebuild command (parseArgs pattern from task.ts).

## RED test (write first, appended to src/tasks/service.test.ts or a new rebuild-focused block there)
Test name: "rebuild is refused while a fresh lease exists".
Body: temp git repo root (execFileSync git init + empty commit as in the evidence test); create packet, ready, start (fresh lease). Call the exported rebuild-refusal check (structure the refusal logic as an exported pure function refuseRebuild(store): string | undefined returning the message or undefined) and assert it returns a string matching /live lease/. Move the packet to review then done (lease gone) and assert it returns undefined.
Expected failure cause (literal string in the output): "rebuild is refused while a fresh lease exists"

## Reuse
src/cli/commands/rebuild.ts, src/tasks/service.ts (leaseOf), src/db/store.ts (openStore options).

## Stop conditions
Anything outside the write_set; touching the rebuild-from-files logic itself.

## Evidence required at close
red-test-output, verify-root, final-sha.
