<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: PLAN-METRICS-001
title: mechanical delivery metrics (DORA for agents): lead time, failure rate, cost per packet — from events+git, zero self-report
depends_on: ["BETS-CORE-001"]
write_set: ["src/metrics/**","src/cli/commands/metrics.ts","src/cli/commands/metrics.test.ts","src/cli/commands/task.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Mechanical delivery metrics (DORA adapted to agents) — measured from events + git, ZERO self-reporting, because an agent's claim about its own performance is worthless.
1. `sv-playbook metrics [--bet <BET>] [--json]` computes, from the events table and git alone: lead time per packet (ready→done), time-in-state breakdown, throughput (packets done per day), failure rate (packets bounced review→active, takeovers, reverts touching a packet's files), and cost per packet.
2. Cost capture: a first-class `task cost <ID> --usd <n> [--tokens <n>]` recorded as an event (the dispatch adapters call it; a human can too). Costs roll up: packet → bet → version.
3. `GET /api/metrics` in serve returns the same builder's output (single source); the Plan view renders bet budget-vs-spent from it.
4. Metrics NEVER become agent-visible targets in briefs (Goodhart guard: an agent told to optimize lead time will skip steps). They are founder/orchestrator instruments; the stop condition below makes this a rule.

## RED test (write first)
In a metrics test add a test named exactly: "metrics computes lead time, failure rate and cost per packet from events only". Seed events for a packet (ready→active→review→active→review→done, plus a cost event), run metrics, and assert lead time spans ready→done, failure rate counts the review bounce, and cost matches the event. New command -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `metrics` command export, OR the test name "metrics computes lead time, failure rate and cost per packet from events only".

## Reuse
The events table + recordEvent; bets rollup (BETS-CORE-001); the serve API pattern (single builder shared CLI/serve); command registration.

## Stop conditions
Any metric sourced from agent free text; injecting metrics/targets into worker briefs; a separate serve query path; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
