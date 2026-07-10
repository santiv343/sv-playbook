<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-004
title: event-driven replanning: orchestrator invalidates and rebuilds the dispatch plan on mechanical triggers
depends_on: ["DISPATCH-PLAN-001","FLOW-001","SPRINT-002","DECISION-LOG-001","PROJECT-MODEL-001"]
write_set: ["src/dispatch/**","src/cli/**","src/tasks/**","src/db/**","src/serve/**","content/dispatch/**","content/roles/**"]
requirements: []
evidence_required: ["final-sha"]
---

## Task
Make orchestration re-planning EVENT-DRIVEN and deterministic. The delivery orchestrator must not sit in a blind loop "occasionally recomputing". It must know exactly WHICH state changes invalidate the current dispatch plan and WHEN to rebuild it.

Implement:
1. Define a single "plan invalidation" builder used by `dispatch plan`, `dispatch run`, status/digest and serve. The builder takes live board state + events and returns:
   - current runnable set;
   - current holds with reason;
   - whether the prior plan snapshot is stale;
   - the exact trigger(s) that made it stale.
2. Replan triggers are MECHANICAL, not heuristic. At minimum:
   - task created / amended / moved;
   - sprint membership or order changed;
   - dependency packet transitioned;
   - lease acquired / released / taken over / stale;
   - review verdict recorded;
   - decision asked / answered affecting a packet or sprint;
   - priority/preemption change;
   - worker failure / dispatch failure / adapter abort;
   - notification or duty crossing a configured tolerance that changes what needs attention.
3. `dispatch run` must consume this builder before each dispatch step and after each observed trigger. If the plan became stale mid-batch, it recomputes BEFORE launching the next worker. Never keep dispatching from an invalidated snapshot.
4. Record replan events: source trigger, affected packets, previous plan version, new plan version. Surface them in digest and task/sprint detail so the founder can see why ordering changed.
5. Add a `dispatch watch` or equivalent long-running orchestrator loop that blocks on trigger sources (event table / poll diff in v1), not on a dumb fixed loop. Polling is acceptable in v1 only if the output is still event semantics: "nothing changed" means no replan.
6. Configuration stays per-instance: which triggers are enabled, debounce window, and whether the pipeline auto-runs or just surfaces the stale plan. The ENGINE defines trigger vocabulary; the project profile chooses policy.

## RED test (write first)
Add a dispatch/orchestration test named exactly: "dispatch run replans before the next launch when a dependency or sprint change invalidates the current plan". Seed two ready packets where the second is initially runnable, then inject a mid-run state change (for example a new higher-priority sprint task or a dependency reversal) after the first launch; assert the second launch does NOT use the stale plan, a replan event is recorded, and the recomputed hold/run set is honored.
Expected failure cause (literal string in the output): the test name "dispatch run replans before the next launch when a dependency or sprint change invalidates the current plan".

## Reuse
DISPATCH-PLAN-001 plan builder; FLOW-001 dispatch execution; FLOW-002 duties/events ages; DECISION-LOG-001; PRIORITY-PREEMPT-001; SPRINT-002; PROJECT-MODEL-001; the events table and digest/serve readers.

## Stop conditions
Replanning on agent self-report only; separate eligibility logic inside `dispatch run`; silent plan changes without a recorded trigger; a fixed infinite loop with no notion of invalidation; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
