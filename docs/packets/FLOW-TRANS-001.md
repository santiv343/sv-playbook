---
id: FLOW-TRANS-001
title: missing transitions: ready->draft demotion, review->ready rejection (releases lease)
depends_on: []
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Add two missing lifecycle transitions to ALLOWED in src/tasks/service.ts (origin: IDEA-026, two real incidents):
1. `ready -> draft` (demotion of a misplanned packet).
2. `review -> ready` (review rejection releases the packet for any agent). This transition must ALSO delete the packet's lease if one exists (the rejected worker no longer owns it) - do this inside movePacket exactly where done/dropped already clear leases: extend that condition to include the review->ready case (a small helper or an extra condition, keep complexity <= 10).
Do NOT add any done-reopen transition (reopening goes through the change bridge by design - cite ADR-in-spec).
Update the echo: moved lines already print from -> to, no change needed there.

## RED test (write first, appended to src/tasks/service.test.ts)
Test name: "ready demotes to draft and review rejection releases the packet".
Body: create packet, move ready, assert movePacket(store, undefined, id, 'draft') does not throw and listPackets shows draft. Then move ready again, ensureSession + startPacket, movePacket(s, id, 'review'), then movePacket(undefined, id, 'ready') must not throw, leaseOf(store, id) must be undefined afterwards, and startPacket by a DIFFERENT session must now succeed.
Expected failure cause (literal string in the output): "illegal transition ready -> draft"
(Producible by construction: current ALLOWED throws exactly that string for the first assertion.)

## Reuse
src/tasks/service.ts (ALLOWED, movePacket, leaseOf), existing service.test.ts helpers (setup, def).

## Stop conditions
Anything outside the write_set; touching the state machine beyond the two named transitions.

## Evidence required at close
red-test-output, verify-root, final-sha.
