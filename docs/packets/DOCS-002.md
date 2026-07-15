<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: DOCS-002
title: human operations UI contract: intent, status, changes, runs, reviews, decisions, and settings
depends_on: ["FLOW-015"]
write_set: ["docs/product/ui/**","src/schema/ui-contract*","src/status/**","src/ui-contract/**","content/taste/**"]
requirements: ["human-first","runtime-capabilities-only","channel-agnostic","accessible","reports-not-transcripts","configurable-profile"]
evidence_required: ["workflow-maps","view-model-action-registry","state-error-matrix","provenance-matrix","accessibility-plan","content-exclusion-review","independent-refutation","contract-digest"]
---

﻿## Problem

The existing serve packets describe individual pages and a prior mockup, but there is no authoritative functional contract for the complete human experience. A local board alone does not support the required workflow: start a project, clarify intent, ask what is happening, change work, review a sprint, make decisions, and understand failures without talking to delivery roles or reading agent transcripts.

## Task

Define the channel-neutral human operations contract. The local web application is the first adapter; CLI and future channels consume the same runtime view models and capabilities.

## Primary workflows

1. Start or open a project and enter through human-interface. Clarify intent before creating approved work.
2. Ask for current state and receive deterministic status first, with human-interface synthesis only where explanation/judgment adds value.
3. Add, remove, reprioritize, pause, resume, stop, or replan work through typed capability requests with impact preview and receipts.
4. Review sprint/project digest, candidate/review results, unresolved decisions, deviations, risks, cost/budget, and next recommendations.
5. Inspect a task/run/review/evidence trail without seeing upstream transcripts by default.
6. Configure operating profile, adapters, review/autonomy dials, notifications, privacy/retention, backup, and minimum security level within declared authority.

## Information architecture

- `Home / Digest`: active project/sprint outcome, progress, blocked/at-risk work, pending human decisions, review queue, budget, notifications, effective security level, and recommended next human action.
- `Plan`: intent, roadmap, sprints/bets, dependencies, backlog, acceptance state, and change history.
- `Delivery`: compact task board/list with filters, ownership/runtime state, dependencies, review/promotion state, and capability-backed actions.
- `Runs`: normalized activity/control/progress/cleanup state from BUG-014/FLOW-009, with no semantic liveness guesses.
- `Reviews`: immutable candidate, mechanical gate receipts, semantic findings, independence, disagreements/arbitration, and residual risk.
- `Decisions`: human decision queue, active/superseded decisions, impact and provenance.
- `Settings`: profiles/dials, adapters/capabilities, notification/privacy/backup policy, and security guarantees.
- `Human-interface`: available globally as the human command/conversation surface, scoped to the current project/view and backed by structured Intent/Change/Decision contracts.

The bundled profile may hide advanced views until needed; the functions remain reachable. Navigation, labels, and defaults are profile/localization data, not core constants.

## Interaction and authority

1. Every displayed fact identifies provenance: deterministic runtime state/evidence, agent judgment/report, human decision, or human-interface synthesis. Synthesis never overwrites facts.
2. Every mutation is a typed runtime capability. The UI submits a request, shows validation/impact, and renders accepted/rejected/pending receipt. It never writes the store or calls provider APIs directly.
3. Destructive, security-weakening, irreversible, external-commitment, and constitutional changes require the configured human confirmation flow. Routine deterministic effects do not ask the human.
4. Default guided profile pauses at sprint review/decision points and presents one generated report. Other profiles can change pause/review behavior without source changes.
5. Notifications deep-link to the exact task/run/review/decision and acknowledge through the notification capability. Unknown/degraded/orphaned states remain explicit.
6. Failure states explain what failed, what is preserved, what recovery the runtime attempted, what remains unsafe, and which authorized choices exist. No generic success after partial failure.

## Experience constraints

- Work-focused, dense but scannable operations UI; no marketing landing page as the first screen.
- Keyboard and screen-reader accessible, visible focus, semantic landmarks, reduced-motion support, responsive desktop/mobile layouts, no overlap or clipped text.
- Stable dimensions for boards, run states, toolbars, counters, and dynamic labels.
- Configured language and terminology; bundled default is plain Spanish with technical terms secondary where useful.
- No raw reasoning/transcript/log stream in normal views or reports. Protected diagnostic content is an explicit privacy-controlled drill-down.
- UI rendering and real-time transport own no policy; one shared view-model builder feeds CLI/web/tests.

## RED test

Register a UI action that has no runtime capability and expose conflicting runtime fact and agent prose through CLI and web fixtures. Contract validation must reject the action and preserve the contradiction. Before the shared operations contract exists, the surfaces cannot prove parity or refusal.

## Acceptance

- End-to-end fixtures cover all six primary workflows from cold start through sprint review without direct TL/implementer/reviewer interaction.
- CLI and web render equivalent state/provenance/action availability from one frozen view model.
- Every action maps to one registered runtime capability and an authorization/receipt state; an unregistered action fails contract validation.
- A runtime fact conflicting with agent prose is displayed as a contradiction, not silently reconciled.
- Guided and autonomous profiles alter pause/review behavior through config while preserving invariant gates.
- Desktop and mobile Playwright flows and screenshots show no overlap, clipping, blank primary scene, or unreachable controls; keyboard/screen-reader checks pass.
- Localization with long labels does not resize fixed controls incoherently.
- Normal UI payload/content scan contains no transcript/reasoning/tool input/output/secret fixtures.

## Stop conditions

- Do not implement page code in this contract packet.
- Do not make an old mockup or framework the authority.
- Do not duplicate runtime queries/policy per view.
- Do not expose a direct store/provider write path.
- Do not require the human to understand delivery internals for routine use.

## Evidence

Provide workflow maps, view-model/action registry, state/error matrix, provenance matrix, accessibility/responsive acceptance plan, content-exclusion/privacy review, independent product refutation, and approved contract digest.
