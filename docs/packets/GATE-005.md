<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-005
title: single agent-session launch boundary: portable context, execution-specific RunSpec, capability binding, and adapter conformance
depends_on: ["ROLE-DELIVERY-ORCHESTRATOR-001"]
write_set: ["src/dispatch/**","src/schema/dispatch*","src/cli/commands/dispatch*","src/cli/commands/start*","src/cli/commands/handoff*","src/cli/commands/check*","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","content/dispatch/**","content/cli.md"]
requirements: ["machine-first","provider-agnostic","harness-agnostic","deterministic","capability-declared"]
evidence_required: ["red-test-output","bootstrap-coverage-receipt","context-execution-binding-receipt","cold-start-receipts","tamper-rejection-receipts","adapter-conformance-receipts","semantic-invariance-receipt","verify-root","final-sha","independent-review"]
---

## Problem

A correct context compiler has no effect if a CLI command, execution-harness adapter, handoff path, or review launcher can create an agent session without using it. Today role prompts and task messages are advisory, launch state is assembled manually, and a concrete harness can begin sessions without durable proof of the exact semantic context and capabilities delivered.

## Task

Make `AgentSessionLaunch` a single typed runtime capability. Every executable session launch must cross one factory/port. The factory consumes a validated portable `ContextPack` from `BRIEF-CONTEXT-PACK-001` and creates an immutable execution-specific `RunSpec`.

1. Keep two identities separate:
   - `ContextPack.semanticDigest` covers portable semantic input and authoritative source versions. It is independent of provider, model, harness, operating system, storage, transport, and vendor framing.
   - `RunSpec.executionDigest` covers the exact launch binding: ContextPack digest, run/task/role, selected adapter and capability version, provider/model identity when applicable, capability grant, workspace, lease, runtime session identity, and launch policy.
2. Create one launch operation that atomically:
   - resolves the work definition and semantic role;
   - creates or validates the runtime-selected isolated workspace;
   - acquires a lease bound to that workspace and runtime session identity;
   - validates the current `ContextPack` and creates the execution-specific `RunSpec`;
   - derives the adapter capability grant from catalog policy and work scope;
   - records the complete binding and source digests before external execution;
   - launches through the configured adapter and records the returned opaque external session handle.
3. Reject before adapter invocation when context or binding is missing, stale, over budget, work-mismatched, role-mismatched, workspace-mismatched, lease-mismatched, unrecorded, unsupported by declared adapter capabilities, or produced from incompatible source versions.
4. Define a harness-neutral execution adapter port. Provider/model selection and authentication mode are adapter/instance configuration, never core role semantics. Implement and dogfood the OpenCode adapter first; stabilize the port only from observed needs and conformance evidence.
5. Render the adapter input solely from the canonical `ContextPack` and `RunSpec`. Do not append human conversation, upstream transcripts, hidden prior-agent output, or arbitrary files. Adapters may add transport framing but cannot add authority, omit mandatory content, or change semantics.
6. Register every launch-capable command and adapter in one typed registry. A bootstrap-coverage check derives the complete set from that registry and fails if any launch path lacks compilation, validation, durable evidence, or capability attachment.
7. Read-only surfaces may display launch evidence but cannot manufacture a session.
8. Surface compact activity state: launched, observable thinking/working activity timestamp when the adapter exposes it, tool activity timestamp, blocked, completed, aborted, and no-activity duration. Raw streams are not copied into an orchestrator context. Supervision acts on normalized adapter signals and declared capability limits, not absence of prose.
9. Accept completion only as a structured report matching the role output schema and bound to the same run, task, context digest, execution digest, and candidate identity where applicable. Raw final prose cannot advance lifecycle state.

## Capability floor

The Role Catalog declares semantic prohibitions and required capability classes. Runtime policy computes the effective grant; adapters project it and prove enforcement at their declared security level. Core does not branch on bundled role ids. Bundled-profile fixtures must prove at least:

- evaluation-only work cannot obtain mutation effects;
- scoped implementation cannot obtain lifecycle, promotion, or foreign-workspace effects;
- delivery coordination cannot obtain implementation or product-authoring effects;
- intent/product work cannot obtain delivery or implementation effects.

Prompt text is descriptive only and never counted as enforcement. An adapter unable to enforce a required capability fails closed or is admitted only under a lower, truthfully reported security guarantee that policy explicitly allows.

## RED tests

- `agent session launch rejects missing or stale semantic context before adapter invocation`
- `launch atomically binds portable context to an execution-specific run spec`
- `bootstrap coverage rejects a registered adapter that bypasses the launch factory`
- `two harness projections preserve the same semantic digest and mandatory content`
- `changing provider model harness or effective capabilities changes execution identity without changing unchanged semantic context`
- `a role fixture cannot obtain a capability prohibited by catalog policy`
- `structured report with a different context execution or candidate binding is rejected`
- `activity summaries do not copy raw agent streams into upstream context`

## Acceptance

- Cold-start the bundled delivery coordination function using only the runtime launch capability; it receives its applicable contract, decisions, active work state, and allowed requests without manual explanation.
- Launch scoped implementation and independent evaluation fixtures. Each receives different minimum-sufficient semantic context with no raw upstream conversation.
- Tamper independently with role, work id, workspace, context digest, execution binding, source version, adapter capability evidence, and lease; every attempt is rejected before external execution and durably evented.
- The first shipped OpenCode adapter passes the same adapter conformance suite used by fake alternative harness adapters. No core module imports or branches on OpenCode.
- Full verification and bootstrap coverage pass.

## Stop conditions

- No hand-written parallel list of entrypoints.
- No direct adapter invocation outside the launch port.
- No agent-authored semantic digest, execution binding, capability grant, lease, or lifecycle mutation.
- No claim that prompt delivery enforces effects; enforcement guarantees are computed from active runtime and adapter evidence.
- No assumption that provider, model, harness, or subscription mechanism are the same abstraction.
- No silent fallback to manual prompts.

## Evidence

RED output, bootstrap coverage receipt, portable-context and execution-binding receipts, cold-start receipts, tamper-rejection receipts, adapter conformance receipts, semantic-invariance receipt, full verification receipt, final SHA, and independent architecture/security review.
