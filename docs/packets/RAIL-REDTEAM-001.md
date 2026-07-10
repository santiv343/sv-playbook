<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: RAIL-REDTEAM-001
title: red-team suite: scripted cheats against every rail (fake done, out-of-scope diff, stale sha, direct DB write, .svp deletion) — refusals asserted in verify
depends_on: ["GATE-VERIFY-001","GATE-WRITESET-001"]
write_set: ["src/redteam/**","content/rubric.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
The rails have never been tested against an agent TRYING to cheat. Every gate was born from an accidental incident; a deliberate shortcut-seeker will find the holes we have not paid for yet. Add an adversarial suite — the red-team harness for the playbook itself:
1. A test suite (src/redteam/ or test fixtures) that simulates the known cheat classes MECHANICALLY (no LLM needed — each cheat is a scripted sequence of CLI/git actions):
   - claim done without evidence (move review/done skipping capture paths);
   - touch files outside the write_set and try every transition;
   - fabricate/replay a stale sha in a report (AGENT-REPORT-001's validation);
   - write the DB directly (the lint gate catches source, this catches runtime: a foreign writer while the CLI holds the store);
   - delete/corrupt .svp and check the recovery guard's refusal + rebuild path;
   - start work with unmet deps; double-lease; move transitions not in ALLOWED;
   - hand-edit a generated .md and check it is detected/regenerated (export drift check).
2. Each cheat asserts the exact refusal (gate name + reason) — the suite IS the spec of what the rails withstand.
3. Runs inside verify (fast, no network). New rails MUST add their cheat here (rubric note: a gate without its red-team case is half-built) — wire that expectation into content/rubric.md.
4. A failing red-team case that reveals a real hole graduates to an incident->rail packet, per the standing loop.

## RED test (write first)
Add a test named exactly: "red team: moving to done without captured evidence is refused by the evidence gate". Script the cheat (create, ready, start, move review bypassing capture if possible, move done) and assert the refusal names the gate. If today it SUCCEEDS in cheating, the test fails by catching a real hole — either way it FAILS first (GATE-EVIDENCE-001 not yet implemented), which is the point.
Expected failure cause (literal string in the output): the test name "red team: moving to done without captured evidence is refused by the evidence gate".

## Reuse
The whole gate machinery as the system under test; the store test fixtures; the recovery-guard tests (STORE-RECOVERY-GUARD-001) as prior art for hostile scenarios.

## Stop conditions
LLM/network calls in the suite (cheats are scripted); testing implementation details instead of refusals at the CLI boundary; skipping the rubric wiring; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
