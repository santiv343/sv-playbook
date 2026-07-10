<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SERVE-PLAN-001
title: serve Plan view: version -> bets (budget vs spent) -> packets + backlog, per the approved mockup
depends_on: ["SERVE-001","BETS-CORE-001"]
write_set: ["src/serve/**","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
The Plan view in serve — the founder sees version → bets → packets the way the approved mockup shows (artifact "serve-mockup", Plan tab): where the product is going and what is bet vs backlog.
1. `GET /api/plan` returns: the current version/milestone (name, narrative, progress = done/total packets), each bet (goal, budget vs spent from the metrics builder, WIP limit, packets with status), and the backlog (unassigned packets ordered by priority) — all from the bets/metrics/status builders (single sources, no new queries).
2. The Plan page renders: milestone header with progress bar; the open bet ("Apuesta actual") with budget/progress/WIP stats and its packet rows; queued bets ("Próxima apuesta"); the backlog summary; and the last retro summary once RETRO-001 lands (skip gracefully until then).
3. Human-first wording per the approved mockup (es/config chat_language when LANGUAGE-POLICY lands): "Apuesta actual", "Backlog · sin apostar", "X de Y tareas hechas" — technical terms as small secondary labels, never the primary label.
4. Read-only; auto-refresh like the board.

## RED test (write first)
In a serve-plan test add a test named exactly: "serve /api/plan returns the milestone, bets with budget and the backlog". Seed a store with a bet holding packets and unassigned packets, GET /api/plan, and assert the JSON contains the bet's goal/budget/packets and the backlog list. Today serve has no plan endpoint -> it FAILS.
Expected failure cause (literal string in the output): the test name "serve /api/plan returns the milestone, bets with budget and the backlog".

## Reuse
SERVE-001's server + page framing; BETS-CORE-001 stores; PLAN-METRICS-001 builder for spent; the status contract for packet states.

## Stop conditions
New query paths bypassing the bets/metrics/status builders; write paths; hardcoding Spanish strings instead of the language-policy source once it exists (interim: a single copy module, not scattered literals); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
