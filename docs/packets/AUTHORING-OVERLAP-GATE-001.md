<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: AUTHORING-OVERLAP-GATE-001
title: authoring gate: overlapping write_set requires a declared dependency or explicit overlap-ok (kills the PR#74 reviewer-finding class)
depends_on: ["GATE-WRITESET-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts","src/cli/commands/task.ts","src/cli/commands/task.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Mechanize the class of failure a reviewer caught by READING on PR #74 (a packet whose write_set overlaps another non-terminal packet, with no declared ordering): catch it deterministically at AUTHORING time, not at review time.
1. `task create` and `task amend` check the new/changed write_set against every non-terminal packet (draft/ready/active/blocked/review) using the same deterministic overlap rule as FLOW-CONFLICT-001 (single source).
2. On overlap with a packet NOT already in depends_on: REFUSE with the exact overlap (which packet, which globs/files), and the two sanctioned resolutions printed verbatim: add `--depends <ID>` (ordering) or pass `--overlap-ok <ID>` (explicit founder-level acknowledgment, recorded as an event).
3. `--overlap-ok` is recorded on the packet (visible in show/brief/serve) so a reviewer sees the acknowledgment instead of re-deriving the overlap.
4. Overlaps with DONE/DROPPED packets are ignored (no ordering needed against terminal work).
This moves the write-set discipline to the earliest possible gate: authoring > ready-promotion > review — each layer already exists except this first one.

## RED test (write first)
In src/cli/commands/task.test.ts add a test named exactly: "task create refuses an overlapping write_set unless the dependency or overlap-ok is declared". Create packet A (draft) with write_set ["src/x.ts"]; assert creating packet B with the same file FAILS naming A and the two resolutions; assert it SUCCEEDS with --depends A and separately with --overlap-ok A, and that the acknowledgment is recorded. Today authoring does no overlap check -> it FAILS.
Expected failure cause (literal string in the output): the test name "task create refuses an overlapping write_set unless the dependency or overlap-ok is declared".

## Reuse
The overlap rule from FLOW-CONFLICT-001 / checkWriteSetConflict (single source — do not reimplement matching); createPacket/amendPacket in src/tasks/service.ts; the events table.

## Stop conditions
A second overlap-matching implementation; blocking overlaps against terminal packets; a silent warning instead of a refusal (warnings get ignored); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
