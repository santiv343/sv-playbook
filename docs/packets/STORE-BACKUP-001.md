---
id: STORE-BACKUP-001
title: rotating store backups on open (a deleted DB loses minutes, not days)
depends_on: ["STORE-VERSION-001"]
write_set: ["src/db/store.ts","src/db/store.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Rotating store backups (D26): in src/db/store.ts, inside openStore after a successful open, if the newest file in .svp/backups/ is older than 10 minutes (or the dir is empty/missing): copy playbook.sqlite to .svp/backups/playbook-<yyyyMMddHHmmss>.sqlite and delete all but the 10 newest backups. Pure fs operations, no new deps. Echo nothing on the happy path (backups are silent).

## RED test (write first, appended to src/db/store.test.ts)
Test name: "open rotates a backup and keeps at most ten".
Body: temp root; openStore/close once - assert exactly 1 file in .svp/backups/. Pre-create 12 fake backup files with staggered mtimes older than 10 minutes (utimesSync), openStore/close again - assert exactly 10 remain and the newest is the fresh copy.
Expected failure cause (literal string in the output): "open rotates a backup and keeps at most ten"

## Reuse
src/db/store.ts (openStore), node:fs (readdirSync, statSync, copyFileSync, utimesSync, rmSync).

## Stop conditions
Anything outside the write_set; compressing or uploading backups (out of scope).

## Evidence required at close
red-test-output, verify-root, final-sha.
