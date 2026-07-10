<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: OPINION-FREE-CORE-001
title: PRINCIPLE-013 opinion-free core + escalera prosa->gate->config + audit de opiniones hardcodeadas (shareable)
depends_on: []
write_set: ["content/principles.md","docs/backlog.md"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

## Task
Establish the constraint that makes the playbook SHAREABLE instead of one person's tool: the engine is opinion-free; every project/person opinion is configuration with a single source of truth. Two parts (the build of the config system itself is a v2 program; this packet installs the PRINCIPLE + the audit so no new work hardcodes an opinion).
1. Add PRINCIPLE-013 to content/principles.md: "Opinion-free core. Everything that is a project's or a person's opinion — the workflow/state machine, kanban columns, roles, gates and their thresholds, packet types and id prefixes, tier definitions, the review checklist, the packet-template sections, taste, and agent/harness routing — lives in configuration with one source of truth, never hardcoded in the engine. The engine ships opinion-free; each instance configures its own constitution. Universal invariants (no dead ends, single source, the CLI is the sole interface, backups) stay in the engine — only OPINIONS become config. The target configurator is an AGENT (a person asks an agent to install and configure playbook), so config is CLI-driven, discoverable via describe/docs, validated, and defaulted — never hand-edited. New work MUST NOT hardcode an opinion; if something is an opinion, it gets a config source of truth."
2. Also state the maturity ladder in principles: every rule travels prose (agent remembers) -> gate (CLI enforces) -> config (each instance chooses); only opinions reach the config rung.
3. Audit the current engine and register in docs/backlog.md (as v2 items) each hardcoded opinion to lift to config: the state machine (link IDEA-046, already present), roles, the lint/gate thresholds AND the module-layout rule (.types/.constants/.errors), kanban columns, packet types + id prefixes, tier definitions, the review checklist, the packet-template required sections, and dispatch routing.

## Gate (docs [criterion] packet; no RED unit test)
Reviewer verifies: PRINCIPLE-013 and the maturity ladder are in content/principles.md; a backlog row exists for each hardcoded opinion listed above; `verify` stays green.

## Stop conditions
Turning a universal invariant into config (only opinions move); trying to build the whole config system here (this packet is the principle + audit only); touching files outside the write_set.

## Evidence required at close
verify-root, final-sha.
