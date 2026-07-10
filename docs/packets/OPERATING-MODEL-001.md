<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: OPERATING-MODEL-001
title: operating model configurable: entry role, pipeline mode, founder-led profile without hardcoding Santi's workflow
depends_on: ["CONSTITUTION-001","HANDOFF-CMD-001","ROLE-SCHEMA-001"]
write_set: ["src/config.types.ts","src/config.ts","src/config.constants.ts","src/config.test.ts","src/cli/commands/handoff.constants.ts","src/cli/commands/handoff.test.ts","content/roles/format.md","content/roles/orchestrator.md","content/roles/founder-interface.md","docs/QUICKSTART.md","docs/specs/2026-07-07-sv-playbook-design.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Introduce the operating model as a first-class, configurable concept so sv-playbook can support the founder-led workflow without hardcoding Santi's personal setup into the engine.

Current problem: the repo has roles, handoff, status, and a Quickstart, but the daily entrypoint is still ambiguous. `content/roles/orchestrator.md` currently says the orchestrator is "The human's single interface", while the actual desired model is two-layered:
- a strategic human-facing role: Founder Interface / PM-PO / strategic TL, expensive model, works with the founder on product, priority, backlog, decisions, and escalation policy;
- an operational delivery role: Delivery Orchestrator / TL, cheaper model, supervises implementation, dispatches implementers/reviewers, monitors CI/gates, and escalates only genuine strategic decisions.

This must be modeled as configurable instance data, not an engine assumption. sv-playbook's own instance can default to founder-led TIER-3, but another team must be able to choose a simpler or more enterprise-shaped model.

Implement:
1. Add an operating-model configuration surface to `playbook.config.json`:
   - `operatingModel`: a string enum with at least `solo`, `founder-led`, and `enterprise`.
   - `entryRole`: the default role a fresh agent should assume when the user says "work on this repo".
   - `pipeline`: `off | assist | full`, matching the existing backlog concept; this controls whether dispatch is manual, proposed for confirmation, or autonomous.
   - Defaults preserve current behavior for existing repos unless explicitly configured. For sv-playbook itself, generated guidance should recommend `founder-led` + `entryRole: founder-interface` + strict/TIER-3.
2. Split role semantics in the default constitution:
   - Add or define `founder-interface` as the human-facing strategic role.
   - Rename/reframe the operational `orchestrator` charter as delivery orchestration: it dispatches and monitors, but is not the founder's primary interface.
   - Update `docs/QUICKSTART.md` so the chain is unambiguous: Human founder -> Founder Interface -> Delivery Orchestrator -> Implementers/Reviewers -> gates.
3. Make handoff/start surfaces read the configured entry role instead of hardcoding `orchestrator` as the default role.
   - If no config exists, keep the old default to avoid breaking existing repos.
   - If `entryRole` names an unknown role once ROLE-CONFIG-001 lands, the check/start path must fail with a named, non-destructive error.
4. Add deterministic validation:
   - Config validation rejects invalid `operatingModel`, `entryRole`, or `pipeline`.
   - A role/workflow check verifies the entry role exists and has a handoff path to the delivery role when the model includes delegated delivery.
   - No charter may claim to be the user's single interface unless it is the configured `entryRole`.
5. Keep the engine/profile boundary explicit in docs:
   - Engine: roles, gates, evidence, task lifecycle, handoff/start, config validation.
   - Profile/constitution: which roles exist, which role is the default entrypoint, workflow columns/transitions, model routing, pipeline autonomy, taste/rubric.

## RED test (write first)
Add a config/start-path test named exactly: "configured entry role replaces orchestrator as the default startup role".

The test should create a fixture repo with `playbook.config.json` containing:
```json
{
  "productName": "fixture",
  "tier": "TIER-3",
  "verifyCommand": "npm run verify",
  "chatLanguage": "en",
  "autonomy": "strict",
  "operatingModel": "founder-led",
  "entryRole": "founder-interface",
  "pipeline": "assist"
}
```

Then run the startup/handoff path that chooses a default role and assert the output points to `docs roles/founder-interface`, not `docs roles/orchestrator`.

Expected failure cause (literal string in the output): the test name "configured entry role replaces orchestrator as the default startup role".

## Reuse
Existing config module (`src/config.ts`, `src/config.types.ts`, `src/config.constants.ts`); handoff role pointer/default logic (`src/cli/commands/handoff.constants.ts`); role charters under `content/roles/`; Quickstart's existing Human -> PM -> TL chain; backlog `IDEA-039` for pipeline modes; ROLE-SCHEMA-001 for role ambiguity checks; ROLE-CONFIG-001 for per-instance roles; CLI-START-001 for daily zero-friction startup.

## Stop conditions
Hardcoding Santi's founder-led workflow as the only engine behavior; leaving `orchestrator` documented as the human's single interface; adding a prose-only rule with no planned deterministic check; accepting an unknown `entryRole`; duplicating role lists or pipeline enums across files instead of deriving from one source; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
