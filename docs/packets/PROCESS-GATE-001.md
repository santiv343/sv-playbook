---
id: PROCESS-GATE-001
title: durable process rules: AGENTS.md cold-start + mechanized merge gate + backlog v2
depends_on: []
write_set: ["AGENTS.md","content/review.md","docs/backlog.md"]
requirements: []
evidence_required: ["final-sha"]
---

## Context
Founder directive 2026-07-08: "no me gustaria tener que repetir esto a otro agente." Today (1) no AGENTS.md exists in this repo, so cold-starting agents are not oriented to the hard rules; (2) the "no merge to main without review" rule lived only in conversation/memory, not in committed files (violates PRINCIPLE-003) and was not mechanized. This packet makes the process rules durable + mechanized so any agent (any session) inherits them.

## Task
- `AGENTS.md` (new): the cold-start anchor every agent reads. States the hard rules (no direct main merge; reviewer APPROVED before merge; CLI-captured evidence; single source) + role pointers + operate pointers to `npx sv-playbook docs`.
- `content/review.md`: add a `Merge gate [gate] — mechanized` section documenting the rule + its enforcement mapping (GitHub branch protection: enforce_admins, PR required, verify status checks, linear history; review by a separate reviewer agent since GitHub can't enforce independent review on a single-token repo).
- `docs/backlog.md`: add IDEA-046 (configurable state machine) as `scheduled-v2` (founder directive: some teams need other columns/states/steps).
- (This PR also carries the 5 pre-rule local commits to origin/main — pivot 03ff8cc, DROP-ROTATE-001, FLOW-WORKTREE-001 + their done-stamps — syncing the branch under the new gate.)

## RED
- AGENTS.md exists at repo root and states rule #1 (no direct main) + rule #2 (reviewer APPROVED).
- review.md contains a `Merge gate` section tagged `[gate]`.
- backlog.md contains IDEA-046 (configurable state machine).

## Stop conditions
- `npm run verify` green.
- Only AGENTS.md, content/review.md, docs/backlog.md (+ this packet doc) touched by this packet's own changes.

## Evidence
(filled at close)
