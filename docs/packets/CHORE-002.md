<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: CHORE-002
title: chaos suite: fault injection for the playbook infrastructure - recovery paths proven in CI, not in production
depends_on: []
write_set: ["src/chaos/**","content/rubric.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-11, verbatim): "quiero que esto sea super solido... un sistema realmente confiable. que no pasen estas cosas." Tonight every infrastructure failure was learned IN PRODUCTION: agents flatlining after stream errors, a store corrupted by racing writers, a close reporting failure after half-succeeding, backups colliding with leases. The red-team suite covers agents CHEATING; nothing covers infrastructure DYING. Build the CHAOS SUITE - fault injection for the playbook itself:
1. Scenarios (scripted, no LLM, fixture stores/repos - same pattern as redteam):
   - kill an agent process mid-task (lease held): assert takeover adopts, nothing corrupts;
   - kill the CLI mid-transition (simulate by crashing between transact steps in a fixture): assert the store is never half-transitioned (transactions hold);
   - corrupt a lease row / an event row: assert doctor names it and the CLI degrades loudly, never silently;
   - disconnect the network mid-merge-queue/reconcile: assert actions report unknown/refused, never hang, never partial-execute;
   - fill the disk / make backups dir read-only: assert backup failure is LOUD and blocks nothing else;
   - two CLIs racing the same transition: assert exactly one wins, the loser gets a clean refusal.
2. Every scenario asserts the RECOVERY PATH works, not just that failure is detected - recovery is the product.
3. Runs inside verify (fast, deterministic). New infrastructure code MUST add its chaos case (rubric line, same as red-team).
4. Any scenario that reveals a real hole graduates to incident->rail per the standing loop.

## RED test (write first)
Add a test named exactly: "chaos: killing a lease holder mid-task leaves an adoptable packet and an intact store". Fixture store, start a packet from session A, simulate the holder vanishing (no release), assert takeover from session B adopts cleanly and integrity_check passes. If it already passes, the suite still lands as the harness for the remaining scenarios - the FIRST failure is the missing chaos module/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing chaos module, OR the test name "chaos: killing a lease holder mid-task leaves an adoptable packet and an intact store".

## Reuse
src/redteam/** patterns (hostile harness prior art); store fixtures; the recovery guard tests; transact() in service.ts; doctor checks.

## Stop conditions
LLM/network calls in the suite; scenarios that only assert detection without exercising recovery; flaky timing-dependent tests (inject faults deterministically, never sleep-race); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
