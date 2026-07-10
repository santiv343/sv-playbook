<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-002
title: duties as data: every role's can-do becomes must-do-or-declare — check duties reports triggered unacted duties with idle age
depends_on: ["ROLE-SCHEMA-001"]
write_set: ["src/duties/**","src/cli/commands/check.ts","src/cli/commands/check.test.ts","content/roles/**","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Generalize knowing-vs-doing to EVERY role (founder ruling 2026-07-10: "no puede pasar que no haga las cosas que puede hacer" — reviewed across all roles, not just the orchestrator). Duties become DATA:
1. The role schema (ROLE-SCHEMA-001) gains a DUTIES section: each duty = { trigger: a mechanically-detectable board/event condition; action: the expected CLI action; idle_tolerance: max time triggered-without-action }. Examples seeded in the default charters:
   - orchestrator: dispatchable packet with no lease (FLOW-001's idle-watch becomes one duty instance of this general mechanism);
   - reviewer: open PR with green CI and no review past tolerance;
   - founder-interface: draft whose deps are all done and no promotion decision recorded; pending decision unanswered;
   - worker: active lease with no checkpoint/event past tolerance (staleness — feeds the existing takeover flow).
2. `check duties [--role <r>]` computes, from live state + events ONLY, every currently-triggered duty and its idle age; exit non-zero over tolerance (so it can gate/alert). Surfaced in status, digest and serve (same builder).
3. Acting or explicitly declining (a stated-reason event, composing with AGENT-REPORT-001) clears the duty; silence never does.
4. Opinion-free: duty definitions live in the role config (instances tune triggers/tolerances); the ENGINE provides the trigger vocabulary (board conditions, event ages) — adding a duty is config, not code.

## RED test (write first)
In a duties test add a test named exactly: "check duties reports a triggered unacted duty with its idle age and clears it after the action". Seed a role with a duty (ready packet, no lease, tolerance 0), assert check duties reports it with idle age; take the lease and assert the duty clears. New feature -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing duties module, OR the test name "check duties reports a triggered unacted duty with its idle age and clears it after the action".

## Reuse
ROLE-SCHEMA-001 + ROLE-CONFIG-001 (duties ride the role store); the check command family; the events table for ages; FLOW-001's idle-watch (subsume it as a duty instance, do not duplicate); the status/serve builders.

## Stop conditions
Duties hardcoded in engine instead of role config; a trigger that needs agent self-report to detect (mechanical conditions only); silence clearing a duty; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
