<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SERVE-UI-MODERN-001
title: local human operations app foundation: shared contracts, Home/Digest, and human-interface
depends_on: ["DOCS-002","SERVE-001"]
write_set: ["serve-ui/**","src/serve/**","src/ui/**","src/status/**","package.json","package-lock.json",".github/workflows/ci.yml","content/cli.md"]
requirements: ["local-offline","channel-agnostic-core","runtime-capabilities-only","accessible","reports-not-transcripts","research-before-build"]
evidence_required: ["sourcing-assessment","packaged-offline-receipt","builder-action-parity","e2e-workflow-receipts","transport-parity","playwright-screenshots","accessibility-results","content-exclusion-proof","verify-root","final-sha","independent-review"]
---

﻿## Problem

The local server has a minimal read-only page and several page-specific follow-ups, but no application foundation that implements the authoritative UI contract, shares view models/capabilities with CLI, or supports the human-interface workflow. The old mockup and a preselected frontend stack must not become hidden product/architecture authority.

## Task

Build the local web application foundation and first complete Home/Digest + global human-interface workflow from DOCS-002.

1. Perform and record a sourcing assessment before selecting the maintained frontend/build/accessibility/test stack. Prefer an existing proven stack; isolate framework/build tooling at the UI adapter boundary. Core view-model/action contracts remain framework-neutral.
2. Ship prebuilt static assets with the package. End users start the local runtime and open the app without installing/building frontend dependencies or using a network. The bundled profile preserves zero runtime npm dependencies unless a separately approved product decision changes it.
3. One local server adapter exposes canonical view models, registered capability requests, and normalized event/state updates. Initial load and real-time/fallback transports carry the same contracts; renderers own no policy or duplicate queries.
4. Implement the actual application shell and navigation from DOCS-002, not a landing page. The first screen is Home/Digest with current project/sprint, progress, risks/blockers, decisions, review queue, notifications, budget, effective security level, and recommended human action.
5. Provide a global human-interface surface that can start/open a project, clarify intent, ask status, and form typed change/decision/work-definition requests. It displays deterministic facts and synthesis provenance separately and never sends direct store/provider mutations.
6. Every action is resolved from the runtime capability registry and shows pending/accepted/rejected receipt and impact. Unsupported or unauthorized actions are absent/disabled with machine-readable reason.
7. Establish reusable accessible components/tokens/layout for dense operational work. Use the configured language/profile; no scattered Spanish/provider strings. Preserve stable dimensions and responsive behavior.
8. Normal payloads/views exclude transcripts, reasoning, raw tool I/O, environment/secret content, and continuous logs. Protected diagnostics remain outside this packet until privacy policy allows them.
9. Follow-up Board/Plan/Runs/Reviews/Decisions/Settings packets extend this shell and shared contracts; they must not create parallel stores, transports, navigation, or UI policy.

## RED test

Run the packaged app offline, request an unauthorized action, and feed identical state through real-time and fallback transports. The app must load without a build/network, refuse the action before effect, and converge to the same view state. Before the shared app foundation exists, at least one fixture cannot pass.

## Acceptance

- Sourcing assessment records adopt/adapt/build/defer evidence and why the chosen stack fits local packaging, accessibility, maintenance, testing, and exit cost.
- Packaged install serves the built app offline with no frontend build step/network and no undeclared runtime dependency.
- Home/Digest and human-interface cold-start/status/change flows work end-to-end against fixture runtime capabilities.
- CLI and web fixture show equivalent deterministic state/action availability from one builder.
- An unauthorized action is rejected before an effect and renders the same typed reason.
- Deterministic fact vs human-interface synthesis provenance is visually and structurally distinguishable.
- Desktop/mobile Playwright flows, screenshots, accessibility checks, and text-overflow checks pass; no blank, overlapping, clipped, or unreachable primary UI.
- Real-time and fallback transports converge to identical view state and do not stream transcripts.
- Content scan proves normal assets/payloads contain no reasoning/transcript/tool/secret fixture.

## Stop conditions

- No old mockup or chosen framework as product authority.
- No marketing/hero first screen.
- No second query/action/event model for web.
- No direct store/provider write from UI/server route.
- No external UI channel/provider assumption in core contracts.
- No implementation of later views by duplicating their policy.

## Evidence

Provide sourcing assessment, packaged-offline receipt, shared-builder/action parity, end-to-end workflow receipts, real-time/fallback parity, Playwright desktop/mobile screenshots and accessibility results, content-exclusion proof, full verification, final SHA, and independent UX/architecture review.
