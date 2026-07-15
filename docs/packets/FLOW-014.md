<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-014
title: planning workflow: coordinated plan, preflight, refutation, repair and escalation
depends_on: ["AGENT-REPORT-001","FLOW-011","GATE-009","ROLE-CONFIG-001"]
write_set: ["src/orchestration/planning-workflow*","src/orchestration/coordinator*","src/orchestration/agent-executor*","src/orchestration/launch-catalog*","src/gateway/run-attempt*","src/gateway/run-spec*","src/cli/commands/dispatch*","src/cli/commands/workflow*","src/serve/server*","src/schema/planning-workflow*","content/cli.md"]
requirements: ["machine-first","provider-agnostic","bounded-retry","typed-bubbling"]
evidence_required: ["invalid-output-fixtures","attempt-chain-receipt","profile-contract-conformance","content-exclusion-proof","verify-root","final-sha","independent-review"]
---

## Problem

WorkflowCoordinator already classifies failures and schedules bounded attempts, but
the launch catalog exposes only `human-intake@1`. Planning/refutation used low-level
`dispatch start`, bypassing coordinator retry. Three refuter runs were mechanically
rejected as `output-invalid` and required manual retry decisions.

## Task

Implement the canonical planning/refutation workflow.

1. Register a versioned plan -> deterministic preflight -> independent refutation ->
   revise/approve workflow. Risk policy may insert advisor, arbiter or human approval;
   routing uses role/contract/capability refs, never provider/model names.
2. The agent effect executor is the sole ordinary RunSpec dispatch caller. CLI, serve
   and agent tools start workflows; low-level dispatch is internal or explicitly
   bootstrap/diagnostic with degraded provenance.
3. Before dispatch, atomically require the active workflow effect, activated Plan IR
   and preflight, required refutation resolution, dispatchable task/dependencies,
   role/profile/adapter/output-contract conformance, pinned least-sufficient Context
   Pack, capabilities and lease/write-set/capacity. A missing prerequisite removes the
   action for TL, CLI, serve and agents.
4. Pin definition, role/profile contract, input artifact, Context Pack and receipt at
   effect birth. Retries create immutable attempt ids under that effect and never fake
   a new phase/task or silently recompile context.
5. Map adapter/output validation failures to typed workflow codes. Feed only the
   rejecting schema receipt and bounded correction instruction to retryable attempts;
   preserve failures and exclude transcript/reasoning.
6. On exhaustion, emit a capability gap with adapter/profile/output-contract tuple and
   receipts, routed through the Role Catalog. Never silently choose an unproven profile.
7. Require deterministic conformance evidence before a tuple is eligible. Serve
   exposes workflow/effect/attempt/activity/failure/recovery states from canonical
   catalogs without child transcript content.

## RED test

- Prose before JSON is rejected and retried within workflow policy.
- JSON missing nested evidence fields receives the exact schema receipt.
- Exhausted repair bubbles automatically with all attempts preserved.
- Changed immutable references on repeated preparation are rejected.
- A corrected attempt advances while failed attempts remain visible.
- One distinct fixture denies dispatch for each missing prerequisite and for a stale
  time-of-check/time-of-use recheck.

## Acceptance

- Planning/refutation completes through WorkflowCoordinator without manual dispatch.
- Invalid output repairs or bubbles automatically on exhaustion.
- TL receives only validated artifacts and typed exceptions.
- Direct dispatch cannot become an alternate ordinary path.
- Full verification and independent workflow/adapter review pass.

## Stop conditions

- No provider-specific retry in coordinator core.
- No transcript injection, parallel dispatch loop, unbounded retry or silent fallback.

## Evidence

Provide invalid-output fixtures, immutable attempt-chain receipt, profile/contract
conformance receipt, transactional eligibility receipts, content-exclusion proof,
full verification, final SHA and independent review.
