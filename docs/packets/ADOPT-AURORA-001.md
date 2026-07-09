<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ADOPT-AURORA-001
title: correr adopt contra aurora-monorepo (inventory+gap read-only) y escalar el reporte al humano antes de escribir nada
depends_on: ["ADOPT-SCAFFOLD-001"]
write_set: ["docs/adopt/**"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

## Task
Run the adopt tooling against the real target and bring back a decision for the human — this is an EXECUTION/ANALYSIS packet (no code change, no RED unit test), gated by human review, per the human-decision taxonomy (adopting a real repo is founder territory).
Target: C:/Users/santi/Desktop/projects/aurora-monorepo.
Steps (READ-ONLY first — write nothing until the human approves):
1. `sv-playbook adopt <aurora-root>` in inventory+gap mode only (do NOT scaffold yet). Aurora is a monorepo — capture the per-package picture.
2. Produce a concise report: detected stack, verify command(s), the ordered gap list, and the remediation packets that adopt WOULD create (title + one-line each). Do not write config/AGENTS.md/packets to Aurora.
3. Escalate to the human with that report and the recommended tier/baseline. Only after explicit approval, re-run adopt with scaffolding to write the config, AGENTS.md, and remediation packets into Aurora.

## Gate (no RED; execution [criterion] packet)
Reviewer/human verifies: the report is real (came from `adopt` output, not prose), nothing was written to aurora-monorepo before approval, and the proposed remediation packets are sane for a monorepo. sv-playbook's own `verify` stays green (no change to this repo).

## Reuse
The adopt command (ADOPT-SCAFFOLD-001 and its inventory/gap/baseline deps).

## Stop conditions
Writing anything into aurora-monorepo before human approval; treating a monorepo as a single package; fabricating the report instead of running the tool.

## Evidence required at close
The adopt inventory+gap report (captured from the CLI), human approval note, final-sha of any Aurora-side scaffolding commit.
