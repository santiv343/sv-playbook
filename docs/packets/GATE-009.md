<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-009
title: plan preflight: typed Plan IR closure before activation and orchestration
depends_on: ["CHECK-SELF-001","FLOW-015"]
write_set: ["src/planning/**","src/schema/plan*","src/check/plan*","src/cli/commands/plan*","src/serve/plan*","content/cli.md"]
requirements: ["machine-first","provider-agnostic","plan-preflight"]
evidence_required: ["red-test-output","plan-preflight-receipt","incident-fixtures","verify-root","final-sha","independent-review"]
---

## Problem

Planner output can satisfy its JSON Schema while still containing derivable
contradictions: reversed dependencies, post-hoc verification, missing ownership,
partial coverage, or projections treated as authority. A later agent or
founder-interface currently has to notice these faults manually.

## Task

Implement a provider-neutral Plan IR and deterministic Plan Preflight gate.

1. Define a versioned Plan IR referencing canonical requirements, packets, artifact
   contracts, responsibilities, capabilities and lifecycle entities. Represent
   `owns`, `produces`, `consumes`, `depends-on` and `verifies-with` as typed relations.
2. Keep relation semantics and validation in one catalog. Instance facets are
   validated versioned data; no engine branch on provider, harness, bundled role,
   framework or product-specific tag.
3. Validate exact active references, compatible endpoints/cardinalities, acyclic
   dependencies, producer-before-consumer order, RED verification ownership/order,
   exactly one accountable owner and verification edge per approved requirement,
   packet/write-set materialization, runtime ownership of deterministic work,
   authority/projection separation, exact disposition of enumerated obligations and
   unambiguous versions.
4. Emit an immutable receipt with Plan IR digest, registry versions, scoped validator
   results, violation codes and recovery owner. It proves structural closure only.
5. Use one closure facade selecting owning validators. Do not copy role, contract,
   context or workflow checks or run unrelated global checks on every edit.
6. Require a passing receipt before activation, packet materialization or delivery
   orchestration. Plan activation evaluates the exact Plan IR digest, preflight and
   policy-required independent refutation/review receipts atomically.
7. CLI, serve and agent tools call the same capability. Expose draft, invalid, valid,
   activated and stale plan states plus violations/recovery through the authoritative
   state projection.

## RED test

- A UI consumer is declared prerequisite of its runtime projection producer.
- A fixture milestone depends on the implementations it must falsify.
- Eight approved obligations are reduced to an arbitrary `at least five`.
- A requirement has no packet owner and the TL would need to invent scope.
- Deterministic retrieval is assigned to planner prose.
- A frontend projection declares its own status/action enum as authority.
- A dangling relation, incompatible artifact contract and dependency cycle.
- CLI, serve and direct application calls try to activate without required receipts.

Each case must fail with a distinct stable violation code before activation.

## Acceptance

- A corrected Plan IR passes without provider/harness-specific code.
- Delivery orchestration receives only activated plan refs and receipts.
- Full verification and independent architecture review pass.

## Stop conditions

- No regex over prose presented as semantic closure.
- No generic graph engine beyond the concrete Plan IR relations.
- No duplicated validator rule, UI-owned legality or manual derivable check.

## Evidence

Provide RED output, Plan Preflight receipts, incident-fixture mapping, provider-neutral
contract fixtures, full verification, final SHA and independent review.
