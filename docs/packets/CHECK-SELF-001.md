<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: CHECK-SELF-001
title: cross-role authority coverage: deterministic runtime operations, bounded judgment and human authority as one executable catalog
depends_on: ["AGENT-REPORT-001","CHECK-001","ROLE-SCHEMA-001","GATE-010"]
write_set: ["src/authority/**","src/schema/authority*","src/check/**","src/roles/**","src/cli/commands/check*","src/cli/registry*","src/dispatch/**","content/roles/**","content/dispatch/**","content/cli.md"]
requirements: ["machine-first","provider-agnostic","deterministic","POLICY-IMPACT-001@1"]
evidence_required: ["red-test-output","authority-coverage-matrix","incident-fixture-receipt","verify-root","final-sha","independent-review"]
---

## Problem

The same failure recurs across roles and workflows: a deterministic fact, transition, validation or side effect is assigned to an agent as prose. The agent then forgets it, interprets it, performs it manually, or discovers the violation after mutation. Existing role schemas classify authored steps, but that classification does not yet control commands, adapters, capabilities or runtime workflows.

## Core invariant

Every responsibility and operation is registered exactly once as one of:

- `DETERMINISTIC`: computable from authoritative inputs. Owned and executed by runtime code. Agents may request it or consume its typed result, but cannot decide, simulate, override or perform it through an alternate path.
- `JUDGMENT`: requires semantic evaluation. Owned by exactly one agent role under a structured decision schema, evidence requirements, authority limits, escalation rules and independent challenge where configured.
- `HUMAN_AUTHORITY`: changes product intent, risk appetite, constitution, budget authority or another explicitly configured human boundary. Agents prepare options and tradeoffs; only the human-interface can record the decision.

Unclassified operations are invalid and cannot be registered, launched or documented as executable responsibilities.

## Task

1. Add a versioned authority/operation catalog as validated data. Each entry declares:
   - stable id and class;
   - authoritative inputs and typed output;
   - owner and allowed requesters;
   - runtime handler id for deterministic operations, or decision schema + escalation target for judgment/human authority;
   - enforcement point, side effects, evidence and failure codes;
   - capability/tool surface and applicable roles/workflows.
2. Extend role validation so every responsibility, duty and handoff references catalog ids. A role cannot own a `DETERMINISTIC` action, and a runtime component cannot claim a `JUDGMENT` or `HUMAN_AUTHORITY` outcome.
3. Derive capability grants, allowed tools, context sections, duties and launch coverage from this catalog. Do not maintain parallel permission lists in prompts, OpenCode config, role docs and adapters.
4. Build `check authority` and include it in `check self`/`verify`. It derives actual commands, lifecycle transitions, adapter launchers, role responsibilities, duties and mutation endpoints from their typed registries and reports:
   - unclassified entrypoints;
   - deterministic actions assigned to agents;
   - agent judgments implemented as unconditional runtime choices;
   - duplicate owners or alternate bypass paths;
   - declared runtime handlers missing from the real registry;
   - role/tool/context grants inconsistent with the catalog;
   - rules present only in prose with no enforcement or decision contract.
5. Generate a coverage matrix from registries, never a hand-written checklist. Adding a command, adapter, role or duty without authority coverage fails CI.
6. Preserve existing self-audits for CLI-only store access, configuration-owned opinions, role schema, authored structure and single-source responsibility.
7. Add a correction ledger link. Every founder correction or production incident must resolve to exactly one of:
   - existing deterministic guard/test;
   - new guard packet;
   - judgment eval/charter correction;
   - durable human decision;
   - explicit no-op rationale with owner and expiry.
   Repeated corrections with no durable target fail `check self`.
8. Dogfood the current incidents as fixtures: wrong worktree lease, write-set mutation, reviewer without executable evidence, one expected test failure, manual process/server launch, TL polling, human-interface delivery choreography and context omitted at cold start.

## RED tests

- `check authority rejects a deterministic responsibility owned by an agent role`
- `check authority rejects a command or adapter entrypoint with no authority classification`
- `check authority rejects a prompt-only prohibition with no runtime guard or judgment contract`
- `capability grants are derived from the authority catalog for every registered role`
- `a repeated founder correction without a durable rail decision or eval fails check self`
- `human authority cannot be satisfied by a TL decision record`

## Acceptance

- The generated matrix accounts for every registered command, lifecycle mutation, adapter launch path, role responsibility and duty.
- No role charter contains an executable deterministic responsibility as its owned judgment.
- OpenCode and future adapters consume derived capability/context profiles; provider changes cannot change authority classification.
- The historical fixtures fail before the gate and pass after the correct catalog/handler/decision linkage is present.
- Full repository verification includes this gate.

## Stop conditions

- No manually maintained duplicate entrypoint list.
- No regex-only scan presented as complete structural coverage when typed registries can provide it.
- No LLM used to classify runtime operations at execution time.
- No prompt text counted as enforcement.
- No universal hardcoded risk appetite; judgment thresholds are validated instance configuration.

## Evidence

RED output, generated authority coverage matrix, historical-incident fixture receipt, verify receipt, final SHA and independent reviewer verdict.
