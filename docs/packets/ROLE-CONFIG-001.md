<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ROLE-CONFIG-001
title: instance-owned semantic Role Catalog and configurable operating profiles without engine role constants
depends_on: ["ROLE-SCHEMA-001","STORE-003"]
write_set: ["src/roles/**","src/schema/role*","src/schema/workflow*","src/check/catalog*","src/cli/commands/role*","src/cli/commands/check.ts","src/cli/commands/check.test.ts","src/gateway/gateway.types.ts","src/gateway/profiles.ts","src/gateway/profiles.test.ts","src/gateway/adapters/*projection*","src/gateway/adapters/opencode.ts","src/gateway/adapters/opencode.constants.ts","src/cli/commands/execution-profile.ts","src/cli/commands/execution-profile.test.ts","src/cli/destructive-gate.ts","src/redteam/gate-001.test.ts","src/orchestration/human-intake.ts","src/orchestration/human-intake.test.ts","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","content/roles/**","content/instructions/**","content/cli.md","opencode.json","playbook.config.json"]
requirements: ["provider-agnostic","runtime-owned-effects","single-authority-source","configurable-operating-profile"]
evidence_required: ["red-invalid-fixtures","projection-hash-receipts","cold-start-receipt","effective-permissions-receipt","verify-root","final-sha","independent-review"]
---

﻿## Problem

The repository currently has three divergent role systems: legacy Markdown charters, manually configured harness profiles, and the newer operating model. Role names, permissions, handoffs, and authority are duplicated and drift independently. The engine also hardcodes an orchestrator entry role.

## Task

Create one versioned, instance-owned Role Catalog as the authoritative semantic source. The engine validates role properties but does not hardcode a role count or role names.

1. Define a compact role record with stable semantics: id/version, mission, exclusive judgments, required context references, input/output schema references, prohibited effects, capability-request classes, self-correction scope, stop conditions, escalation classes, and capability floor.
2. Define explicit typed handoff edges where authorization or escalation topology cannot be derived from compatible schemas alone. Every emitter/receiver reference must resolve; retries and cycles are bounded.
3. Reserve deterministic effects to runtime capabilities. A role may request an authorized capability and interpret its result; it never acquires the effect itself.
4. Ship a default operating profile containing the agreed human-interface, planning/refutation/advice/arbitration, delivery-orchestration, investigation, implementation, and review functions. A role is a semantic contract, not a permanently running process or permanent harness profile. Instances may replace the profile if all catalog invariants still pass.
5. Make `human-interface` the entry role of the bundled profile. Custom profiles declare their entry role explicitly. Zero-config startup uses the bundled profile; the core contains no role-name constant.
6. Generate human-readable charters and harness projections from the catalog. Generated artifacts carry source version/hash and fail drift checks. Legacy charters are never simultaneously authoritative.
7. Validate unique judgment ownership where required, prohibited runtime effects, separation requirements, handoff compatibility, reachable escalation, bounded cycles, known schemas, and model-capability evidence policy.
8. Treat capability floor as a dispatch constraint backed by adapter conformance/evaluation evidence, model identity/version, and freshness. A provider label alone is not proof of semantic quality.

## Authority

The human-interface owns approved intent and work-definition changes and may request runtime capabilities to create or amend tasks, sprints, and decisions. It may invoke semantic specialists. It never performs delivery. The delivery-orchestrator chooses bounded operational recovery; the runtime materializes dispatch, state transitions, integration, cleanup, and evidence.

## RED test

Load a catalog whose role claims a reserved runtime effect, whose handoff references a missing schema, and whose generated projection carries a stale catalog digest. Catalog validation and launch must reject all three before session creation. Before the catalog is authoritative, at least one invalid fixture passes or has no check path.

## Acceptance

- A valid custom catalog with different role ids passes without source changes.
- A role claiming a reserved runtime effect is rejected.
- Duplicate exclusive judgment ownership without an explicit collaboration rule is rejected.
- Missing or incompatible handoff schema references fail closed.
- A generated charter/profile with a stale source hash fails the projection check.
- The bundled profile starts at human-interface without requiring user configuration; a custom profile with no entry role is rejected.
- Effective OpenCode permissions are checked after all configuration layers merge; extra authority aborts launch.
- No core module contains the bundled role ids as behavioral branches.

## Bootstrap

Build the catalog in an isolated candidate. The old charters remain explicitly legacy until the new validator and projections pass. Activation atomically selects one authority source and records the catalog hash. The bootstrap exception is one-use, runtime-recorded, SHA-bound, and independently reviewed; neither a cooperative file marker nor a mutable Git tag is sufficient authority by itself.

## Stop conditions

- Do not create separate sources for role authority, separation, and harness permissions.
- Do not infer authorization from prose or schema shape.
- Do not equate a semantic role with a permanent process/profile.
- Do not use provider/model names in core role semantics.
- Do not activate both legacy and catalog role sources.

## Evidence

Provide invalid-fixture receipts for every catalog invariant, generated-projection hash receipts, bundled-profile cold-start receipt, custom-profile receipt, effective OpenCode permission receipt, full verification, final SHA, and independent architecture/security review.
