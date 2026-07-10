<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: BETS-CORE-001
title: bets replace sprints: budget-boxed planning unit (goal + usd appetite + wip limit), backlog = the unbet
depends_on: ["TASK-CORE-DB-001"]
write_set: ["src/bets/**","src/db/store.ts","src/db/store.constants.ts","src/cli/commands/bet.ts","src/cli/commands/bet.test.ts","src/tasks/service.ts","src/tasks/service.test.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Replace time-boxed sprints with BUDGET-boxed bets (founder decision 2026-07-10: "el tiempo no se mide de la misma manera en agentes"). Calendar time is a human pacing device; agents pace by budget. A bet is the planning unit between the version (milestone) and the packet.
1. A `bets` table + CLI: `bet create --goal <sentence> --budget <usd> [--wip <n>]`, `bet add/remove <BET> <PACKET-ID>`, `bet show/list`, `bet close <BET>`. A bet has: goal (one sentence of founder intent), budget cap in USD (the appetite — a CAP, not an estimate), an optional WIP limit (max packets active at once inside the bet), state (open/closed), and its packet set.
2. Backlog = packets not assigned to any bet. Nothing enters work by itself: `task move ready` on an unassigned packet requires an explicit override flag — the betting-table rule (Shape Up): scope is chosen, never leaked.
3. WIP limit enforced mechanically: moving a packet to active fails when the bet already has `wip` packets active (kanban/lean adapted — for agents the point is write-set conflicts + unsupervised parallel burn, not focus).
4. Budget: costs recorded per packet (via task note/evidence now; PLAN-METRICS-001 formalizes capture) roll up to the bet; `bet show` displays budget vs spent. v1 records + displays; hard-stop on budget exhaustion is a follow-up decision.
5. `bet close` requires all packets terminal (done/dropped) or explicitly moved back to backlog; closing triggers the retro hook (RETRO-001) — cool-down rule: the retro's new rails are implemented BEFORE the next bet opens (enforced as prose in the orchestrator charter now; a gate when RETRO-001 lands).
Opinion-free: bets/budgets/WIP are the DEFAULT planning mode; an instance can ignore bets entirely (packets straight from backlog) — the engine must not require them.

## RED test (write first)
In a bets test add a test named exactly: "a bet enforces its wip limit and rolls up packet costs against its budget". Create a bet with wip=1 and two packets, move one to active, assert moving the second to active FAILS naming the wip limit; record costs on the first packet and assert bet show reports spent against budget. New feature -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `bet` command export, OR the test name "a bet enforces its wip limit and rolls up packet costs against its budget".

## Reuse
The packets/packet_deps schema + migration pattern (TASK-CORE-SCHEMA-001); movePacket transition hooks (the wip check composes with the gates); command registration; the events table (bet events must be emitted for digest/serve).

## Stop conditions
Time-boxing anything (no dates as semantics — created_at metadata only); letting packets slip into ready without a bet or explicit override; hardcoding bets as mandatory for every instance; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
