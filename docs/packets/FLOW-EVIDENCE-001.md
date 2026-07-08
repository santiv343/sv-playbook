---
id: FLOW-EVIDENCE-001
title: CLI-captured evidence on active->review (D24: kill the fabricated-SHA class)
depends_on: ["FLOW-CONFLICT-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts","src/db/store.ts","src/db/store.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
CLI-captured evidence (origin: spec D24, a worker fabricated a SHA tail). When movePacket transitions a packet from 'active' to 'review', the service must CAPTURE evidence itself instead of trusting agent transcription:
1. Run `git rev-parse HEAD` and `git rev-parse --abbrev-ref HEAD` (execFileSync, cwd = the lease's worktree - read it from the lease row BEFORE any lease mutation).
2. Record one event per value: command='evidence', detail='head-sha <output>' and 'branch <output>' (use the existing EVENT constants pattern: add EVENT_EVIDENCE='evidence' to the exported constants and include it in the events.command CHECK constraint in src/db/store.ts).
3. Echo both captured values after the existing 'moved' line: `evidence captured: <sha> on <branch>`.
4. If git fails (not a repo, no commits): record detail='head-sha unavailable: <message first line>' and do NOT block the transition (evidence capture is best-effort at this stage; blocking comes later with verify capture).
recoverPacket already lists recent events - no change needed there, but the new events must appear in `task show` output via lastNotes? NO - notes filter on EVENT_NOTE; leave show untouched.

## RED test (write first, appended to src/tasks/service.test.ts)
Test name: "moving to review captures head evidence as events".
Body: in a temp dir, run git init + one empty commit (execFileSync git with ['-c','user.email=t@t','-c','user.name=t','commit','--allow-empty','-m','x'] after init); create packet, ready, start (worktree = that dir), movePacket to review; then query the events table directly for command='evidence' and assert one detail starts with 'head-sha ' followed by 40 hex chars.
Expected failure cause (literal string in the output): "moving to review captures head evidence as events"

## Reuse
src/tasks/service.ts (movePacket, leaseOf, INSERT_EVENT pattern), src/db/store.ts (commonRoot uses execFileSync git - same import style), src/config.ts exists if needed (not required in this slice).

## Stop conditions
Anything outside the write_set; running the project verify inside move (that is a LATER slice - this one captures git facts only).

## Evidence required at close
red-test-output, verify-root, final-sha.

closed: done 2026-07-08T13:11:20.812Z