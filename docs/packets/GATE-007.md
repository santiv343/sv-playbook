<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-007
title: security guarantee levels: truthful local containment, agent isolation, and tenant isolation
depends_on: []
write_set: ["src/security/**","src/schema/security*","src/status/**","src/cli/commands/security*","src/cli/commands/status*","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","docs/security/**","content/cli.md","playbook.config.json"]
requirements: ["threat-model-explicit","maturity-independent","provider-agnostic","fail-closed-claims"]
evidence_required: ["level-computation-fixtures","degraded-control-receipts","cross-surface-parity","adapter-equivalence","verify-root","final-sha","independent-threat-review"]
---

﻿## Problem

The product currently uses words such as safe, isolated, enforced, and cannot without identifying the threat model or activated controls. Local single-user containment and adversarial/multi-tenant isolation are materially different guarantees. Maturity labels also get confused with security strength.

## Task

Define and enforce a provider/harness/OS/storage/transport-neutral security guarantee taxonomy. Security level and delivery maturity are independent dimensions.

## Levels

- `S0-observed`: no authoritative effect boundary. Useful only for diagnostics/prototyping; agent work cannot be promoted as controlled.
- `S1-local-contained`: trusted host and OS user, local single-tenant runtime, accidental or non-adversarial agent failures. Runtime owns shared mutations, deterministic gates, candidate promotion, cleanup, and audit receipts. It does not resist a process under the same OS identity that can directly read/write resources or credentials.
- `S2-agent-isolated`: hostile or compromised agent within one tenant. Per-run unforgeable capability identity, filesystem/process/network isolation, brokered credentials, bounded resources, verified descendant cleanup, and tamper-evident authority/evidence are activated.
- `S3-tenant-isolated`: mutually untrusted tenants/projects/operators. Tenant identity, data/secret isolation, quotas, audit access controls, key rotation, abuse controls, upgrade/rollback, incident response, and isolation conformance are activated.

Levels are cumulative capability sets, not marketing tiers. A deployment advertises the lowest activated level among the capabilities used by that run.

## Required behavior

1. Every security claim names level, threat actors, protected assets/effects, assumptions, explicit non-goals, active control ids, control versions, and activation evidence.
2. Apply the existing maturity ladder independently to each control: declared, implemented, verified, activated, degraded, retired. A declared S2 design does not raise an S1 deployment.
3. Runtime computes the effective level from activated controls and adapter conformance receipts. Models/agents never self-report it.
4. Configuration may require a minimum level for a task/risk class. Dispatch/promotion fails closed when deployment level is lower or evidence is stale/degraded.
5. Every UI/CLI/report/API surface uses the same computed guarantee and standardized wording. It must show explicit limitations, especially same-user bypass at S1.
6. Security downgrade is a versioned human-approved configuration/constitutional change applied only to new runs with impact evidence; a task instruction cannot downgrade it.
7. Provider/harness/OS-specific controls are adapter capabilities with conformance tests. Core rules refer to control semantics, never implementation brands.
8. The current local product may claim only S1 after its exact required controls are VERIFIED and ACTIVATED. S2/S3 remain unavailable until all mandatory controls exist and pass.

## RED test

Activate a deployment fixture missing one mandatory S1 control and request an S2 task on it. Effective security must compute S0 and dispatch/promotion must fail naming the missing controls. Before level computation exists, the runtime cannot produce the refusal receipt.

## Acceptance

- A deployment missing one mandatory S1 control computes S0 and cannot promote controlled work.
- A configured S2 task on an S1 deployment is rejected before launch with missing control ids.
- A same-user direct-file-write scenario appears as an explicit S1 non-goal, never as protected.
- A degraded process-cleanup control lowers the effective run level and blocks affected transitions.
- CLI, UI, report, and machine-readable fixtures render the same level/limitations from one builder.
- Changing provider/OS adapters with equivalent conformance does not alter core level semantics.
- No fixture can set its security level directly through config or agent output.

## Stop conditions

- No enterprise/multi-tenant claim before S3 activation evidence.
- No single `secure: true` flag.
- No mixing maturity and threat-model level.
- No hidden assumptions or adapter names in core taxonomy.
- No fail-open fallback when evidence is missing or stale.

## Evidence

Provide level-computation fixtures, missing/degraded-control receipts, cross-surface parity, adapter-equivalence receipt, wording/security review, full verification, final SHA, and independent threat-model review.
