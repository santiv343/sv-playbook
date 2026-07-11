<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-011
title: role-scoped taste routing: entries assigned to roles, briefs assemble them, founder recurrence duty
depends_on: []
write_set: ["content/taste/**","content/roles/**","src/taste/**","src/cli/commands/taste*"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-11, verbatim): "fijate que siempre te pregunto las mismas preguntas para ir en profundidad. esto con el rol founder no puede pasar. anda guardando el taste en base a lo que vamos hablando, y asignaselo a los roles correspondientes. y que el founder pueda hacer lo mismo, detectar estas cosas y asignarla donde corresponda." Two mechanisms:
1. ROLE-SCOPED TASTE: every taste-ledger entry gains a `roles:` field (one or more of founder-interface, delivery-orchestrator, implementer, reviewer, or global). The mechanical part: role BRIEFS/charters are ASSEMBLED including that role's taste entries (single source, generated - same pattern as instructions --write); a dispatch prompt for role X automatically carries X's entries. An entry nobody receives is dead knowledge - routing is what makes the ledger alive. Composes with TASTE-LEDGER-001 (the ledger, merged) and its v2 note (CLI-managed entries: `taste add --role <r> --rule <text> --rationale <text>`, refuse hand-edits via check drift).
2. FOUNDER RECURRENCE DUTY: the founder-interface charter gains the duty - when the human founder asks the same deep-dive question or repeats a correction, that is a TRIGGER (FLOW-002 duty semantics): record the answer as a taste entry / principle / charter line assigned to the right role, evented. CHECK-SELF-001 audits: recurring founder corrections without a durable routed artifact are flagged. The founder never explains the same thing twice - to ANY role.
3. Detection aid (mechanical where possible): `taste route <text>` suggests the target role by matching against role charters; the semantic judgment of WHERE it belongs stays with founder-interface (semantic-kernel principle).

## RED test (write first)
In a taste-routing test add a test named exactly: "role briefs include the role's taste entries and a hand-edited ledger fails the drift check". Fixture ledger with entries for reviewer and implementer: assemble both briefs, assert each contains ONLY its entries plus globals; hand-edit the generated section and assert check fails naming the drift. Today entries have no role field -> it FAILS.
Expected failure cause (literal string in the output): the test name "role briefs include the role's taste entries and a hand-edited ledger fails the drift check".

## Reuse
content/taste/*.md (the ledger - extend its entry template with roles:); the instructions --write generator pattern; task brief assembly; FLOW-002 duty semantics; CHECK-SELF-001; the events table.

## Stop conditions
A second taste storage; entries without a role (global must be explicit, not a default fallback); the router making the final assignment decision autonomously (it suggests; founder-interface decides); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
