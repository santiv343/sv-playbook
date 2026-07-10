<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: TASTE-LEDGER-001
title: taste como dato consultable: ledgers product/engineering + decision-log; el reviewer los consulta (per-project config)
depends_on: []
write_set: ["content/taste/**","content/roles/reviewer.md","content/roles/product.md","content/cli.md"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

## Task
Encode the project's judgment (taste) as first-class, consultable, versioned data, so review can enforce it and it stops living in one person's head or an agent's memory.
1. Create two taste ledgers under content/taste/ : `product.md` (product judgment: priorities, what is shippable, tier philosophy, recurring yes/no calls) and `engineering.md` (engineering judgment: conventions, quality bar, single-source expectations). Structured as an appendable list of entries, each with a short rule + rationale + optional scope.
2. A decision log: `content/taste/decisions.md` capturing each owner decision as a reusable preference (rule + scope + rationale + date). (v2 upgrade noted: promote this to a CLI-managed `decision` command so it is CLI-only, not a hand-edited file.)
3. Wire the reviewer + product charters to CONSULT the ledgers as `[criterion]`s: a review checks the diff against the relevant ledger entries; a decision NOT covered by any entry is an escalation, and resolving it appends a new entry (the learning loop — never asked twice).
IMPORTANT (opinion-free core, PRINCIPLE-013): these ledgers are PER-PROJECT CONFIG, not shipped defaults — the engine provides an empty/templated structure; each instance fills its own. Seed sv-playbook's OWN ledgers from the existing knowledge-hub/taste/global-taste.md and the decisions recorded in memory, clearly marked as sv-playbook's instance, not the engine default.

## Gate (docs/mechanism [criterion] packet; no RED unit test)
Reviewer verifies: content/taste/{product,engineering,decisions}.md exist with the appendable structure; the reviewer + product charters reference consulting them; sv-playbook's own ledgers are seeded and marked as instance config; `verify` stays green.

## Stop conditions
Shipping the founder's taste as the engine default (it is instance config); putting a taste fact in more than one place; hand-coding taste into a gate that should read the ledger.

## Evidence required at close
verify-root, final-sha.
