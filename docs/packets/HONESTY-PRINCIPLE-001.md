<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: HONESTY-PRINCIPLE-001
title: truthful capability and claim registry: declared implemented verified activated are mechanically distinct
depends_on: ["QUALITY-PRINCIPLE-001","STORE-003"]
write_set: ["src/capabilities/**","src/claims/**","src/schema/capability*","src/cli/commands/capability*","src/cli/commands/check*","src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts","content/principles.md","content/rubric.md","content/review.md","content/roles/**","content/cli.md"]
requirements: ["machine-first","provider-agnostic","deterministic"]
evidence_required: ["red-test-output","capability-transition-receipt","stale-degraded-receipt","live-capability-matrix","false-claim-incident-receipt","verify-root","final-sha","independent-review"]
---

## Problem

The system repeatedly treats a decision, document, packet or prompt as if the described capability were already present. Agents then claim "protected", "resolved", "reviewed" or "automatic" while the mechanism is missing, unverified, not loaded by the running process, or only detects violations after the fact. Durable specification without activation is still absent behavior.

## Core rule

Every factual claim is either mechanically backed or explicitly labeled as unverified belief. Capability claims additionally reference an executable capability record whose maturity cannot be overstated.

Canonical capability states:

1. `DECLARED`: outcome and contract exist as durable data.
2. `IMPLEMENTED`: code/config artifact exists at an exact revision.
3. `VERIFIED`: required deterministic tests/evidence pass against that exact artifact.
4. `ACTIVATED`: the blessed runtime proves it has loaded that verified artifact/config and exposes its health/coverage receipt.
5. `DEGRADED`: an activated capability has failed health, freshness or coverage and cannot be relied upon.
6. `RETIRED`: no longer available and rejected by new dependencies.

Only `ACTIVATED` may be described or consumed as an existing guarantee. `DECLARED`, `IMPLEMENTED` and `VERIFIED` describe progress, not current protection.

## Task

1. Add a versioned capability registry and claim schema as validated runtime data. Each capability declares:
   - stable id/version and exact behavioral guarantee;
   - enforcement boundary (`precondition`, `pre-write`, `promotion`, `observation`, `context`, etc.);
   - implementation artifact/config revision;
   - required verification receipts and coverage ids;
   - activation probe and running-runtime identity;
   - dependencies on other capabilities and minimum states;
   - owner, degradation conditions and recovery action.
2. Implement legal state transitions. Runtime evidence, not agent prose, advances implementation/verification/activation. A packet becoming done does not automatically activate a capability. Activation requires a probe from the blessed runtime instance proving the verified version is loaded.
3. Add `capability status [--json]`, `capability verify` and the runtime-owned activation path. Human/agent callers may request or inspect activation but cannot forge receipts or force the state.
4. Add dependency enforcement: a session launch, role, workflow or capability that requires another capability refuses when the dependency is below its minimum state or degraded. No fallback may silently substitute a prompt rule.
5. Add typed claim references to structured reports/decisions. Claims distinguish `FACT`, `INFERENCE`, `DECISION` and `BELIEF`; factual capability claims include capability id/version/state receipt. Consumers treat unbacked facts and non-activated guarantees as `UNKNOWN`.
6. Add freshness and drift handling. A change to an implementation artifact, config, role charter, decision bundle or coverage registry invalidates the relevant verified/activated receipt deterministically. Running an older blessed process cannot claim a newer capability.
7. Add a truthful capability matrix for the current product. It must expose, at minimum, the real present state of write-set enforcement, single-writer store, clean promotion, context compilation, session launch, activity wakeup, role capabilities, structured reports and pre-write mediation.
8. Wire the universal discipline into every role through a single referenced protocol:
   - separate fact/inference/decision;
   - cite evidence;
   - refute risky conclusions;
   - never self-approve;
   - never call specified work active;
   - convert repeatable failures to the proper runtime guard/eval/decision layer.
9. A false factual claim contradicted by authoritative evidence creates a typed incident and invalidates the report/decision that consumed it. Correction is systemic, not a scolding.

## RED tests

- `a declared or verified capability cannot be claimed as active`
- `activation requires a probe from the blessed runtime at the verified artifact revision`
- `changing an enforcement artifact degrades its active capability until reverified and reactivated`
- `a launch refuses a required capability that is declared but not activated`
- `an agent report cannot cite prompt text as evidence that a mechanical barrier exists`
- `capability status distinguishes post hoc detection from pre-write prevention`
- `a false backed claim creates an incident and invalidates the consuming decision`

## Acceptance

- The live matrix truthfully reports current gaps; it does not mark the future context/launch/pre-write packets as active.
- A fixture capability progresses through every legal state only with matching exact-revision evidence.
- Tampered, stale, cross-version and agent-authored receipts are rejected.
- All role reports and delivery decisions can reference claims without duplicating claim semantics.
- Full repository verification passes.

## Stop conditions

- No capability state inferred from packet status, documentation presence or agent assertion.
- No `--force active` escape hatch.
- No cryptographic-security claim: hashes bind identity/integrity for this local runtime but do not replace OS isolation.
- No provider-specific field in the capability or claim core.
- No motivational prose presented as enforcement.

## Evidence

RED output, capability-transition receipt, stale/degraded receipt, live truthful matrix, false-claim incident receipt, full verify, final SHA and independent reviewer verdict.
