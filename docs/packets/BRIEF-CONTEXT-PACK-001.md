<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: BRIEF-CONTEXT-PACK-001
title: deterministic context compiler: portable role-scoped ContextPack with explicit applicability and semantic digest
depends_on: ["AGENT-REPORT-001","FLOW-011","ROLE-CONFIG-001","STORE-003"]
write_set: ["src/context/**","src/schema/context*","src/tasks/context-pack*","src/tasks/service.ts","src/tasks/service.types.ts","src/tasks/service.test.ts","src/cli/commands/context*","src/cli/commands/task*","src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","content/cli.md"]
requirements: ["machine-first","provider-agnostic","deterministic","minimum-sufficient-context","reports-not-transcripts"]
evidence_required: ["canonical-semantic-digest-fixtures","role-completeness-receipts","adapter-projection-equivalence-receipts","overflow-replan-receipts","content-exclusion-proof","verify-root","final-sha","independent-review"]
---

﻿## Problem

Agent sessions receive ad-hoc prompts, conversation fragments, and model-selected documents. The runtime cannot prove which authoritative facts were delivered, whether mandatory context fit, or why an item applied. Reports and transcripts are also mixed, wasting context and leaking unrelated information.

## Task

Build the deterministic context compiler used before every agent-session launch. Its output is portable semantic context; execution-specific binding belongs to `GATE-005`.

1. Compile from an approved work definition plus authoritative, versioned snapshots: semantic role/function, workflow/handoff policy, context policy, intent/task contract, capability request contract, dependency reports, project evidence, and instance profile.
2. Produce a canonical `ContextPack` with mandatory items, optional items, references, expected output/report schema, and a receipt containing `semanticDigest`, compiler version, source versions/hashes, and an include/exclude selector log.
3. Use the precedence and applicability rules from FLOW-011. Unknown roles/selectors, stale or conflicting versions, unresolved supersessions, unanswered required decisions, missing reports, or incomplete mandatory context fail closed with typed errors.
4. Mandatory content includes the full applicable role contract, active invariants/authority limits, exact task outcome/acceptance/stop conditions, required decisions, capability request contract, escalation target, and output schema. It is never truncated, excluded by task text, or replaced with an LLM summary.
5. Downstream roles receive structured reports and evidence references, never upstream conversation transcripts. Bundled-profile fixtures demonstrate minimum-sufficient context for implementation, evaluation, delivery coordination, and human interaction, while custom catalog roles compile without engine changes.
6. Stable ordering and canonical serialization produce the same semantic digest independently of provider, model, harness, operating system, storage engine, transport, UI, or vendor framing. Volatile observation and execution-binding fields remain outside the semantic digest.
7. Context capacity is a declared adapter/model-route constraint, not a provider-name assumption. Compute usable input capacity after system/envelope/output reserve and a configured safety margin. If mandatory content does not fit, deterministically try an allowed compatible route with sufficient current conformance evidence; otherwise return `CONTEXT_REPLAN_REQUIRED`. The runtime never invents a semantic task split. An authorized planning role may propose a split, which is refuted and recompiled.
8. Optional content is selected in stable priority order and converted only to pre-authored references when capacity is insufficient. No mid-entry byte/token truncation. The sizing receipt records route identity, capacity evidence, estimator/tokenizer version, and freshness without making those values part of semantic meaning.
9. Record only the ContextPack receipt and durable artifact references. Raw prompts, reasoning, tool input/output, and transcripts are not context evidence.
10. Expose compile, validate, and explain diagnostics without launching an agent. GATE-005 consumes this exact artifact and binds it into a `RunSpec`; adapters may project it but cannot add authority or omit mandatory content.

## RED test

Compile a pack with one unresolved mandatory dependency, one role-inapplicable item, and one adapter projection that drops a mandatory item. The compiler must fail each case with a typed receipt. Before deterministic closure exists, compilation cannot produce those refusals or a stable semantic digest.

## Acceptance

- Identical authoritative inputs produce the same semantic digest before any execution adapter is selected.
- Two fake harness adapters project the same ContextPack without changing its semantic digest or mandatory content.
- Every bundled role/function compiles with all mandatory entries and an explainable selector receipt; a valid custom role does the same without an engine branch.
- Role-scoped fixtures contain only required reports/context and no unrelated transcript content.
- Task exclusion cannot remove an invariant, authority limit, acceptance criterion, or output schema.
- Stale source versions, ambiguous selectors, missing evidence, and same-precedence conflicts return distinct typed failures.
- Mandatory overflow routes only to a verified compatible capacity; with no route it returns `CONTEXT_REPLAN_REQUIRED` and never truncates or invents a split.
- Optional overflow uses stable references and does not change mandatory bytes.
- An applicable decision change alters the semantic digest; an unrelated change and a transport/provider-only change do not.
- Adapter projections that omit or alter a mandatory item fail completeness validation before launch.

## Stop conditions

- No LLM, embedding, semantic match, network lookup, or conversation replay in selection.
- No provider/harness/model/OS/storage/transport/UI/vendor names in compiler behavior.
- No fallback to include everything.
- No launch implementation or execution identity in this packet.
- No direct live-store mutation from a worker.

## Evidence

Canonical semantic-digest fixtures, per-role completeness and exclusion receipts, adapter-projection equivalence receipts, overflow/routing/replan receipts, transcript-content exclusion proof, full verification, final SHA, and independent context/privacy review.
