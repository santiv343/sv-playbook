---
id: FLOW-LEASE-001
title: lease lifecycle: demotion/rejection release the lease + task release command (gap found by claude fail-stop)
depends_on: ["CODE-LAYOUT-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts","src/cli/commands/task.ts","src/cli/commands/task.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Two lease-lifecycle gaps found in production 2026-07-08 (a takeover-then-demote left a fresh foreign lease on a ready packet, refusing all new workers):
1. In src/tasks/service.ts movePacket: releasing transitions must ALSO include any transition whose target is 'ready' or 'draft' from 'blocked' or 'ready' - simplest correct rule: delete the packet's lease on EVERY transition except active->blocked (a blocked worker may resume). Refactor releasesLease accordingly and keep complexity <= 10.
2. New subcommand `task release <ID>`: deletes the packet's lease if held by the CURRENT session (echo `released <ID>`), errors with LifecycleError if held by another session (hint: use takeover) or if none exists. Wire it into the SUBCOMMANDS table and USAGE.

## RED test (write first, appended to src/tasks/service.test.ts)
Test name: "demotion and rejection release the lease; release frees an own lease".
Body: create packet, ready, start (lease mine); movePacket(session, id, 'blocked'); assert leaseOf still defined (blocked keeps it). movePacket(session, id, 'ready'); assert leaseOf(store,id) === undefined (THE fix). Then ready->start again, and exercise the exported release function: releaseLease(store, session, id) deletes it; a second call throws /no lease/.
Expected failure cause (literal string in the output): "demotion and rejection release the lease"

## Reuse
src/tasks/service.ts (movePacket, releasesLease, leaseOf), src/cli/commands/task.ts (SUBCOMMANDS table).

## Stop conditions
Anything outside the write_set; touching takeover semantics.

## Evidence required at close
red-test-output, verify-root, final-sha.
