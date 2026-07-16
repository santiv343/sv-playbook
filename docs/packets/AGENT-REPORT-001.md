<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: AGENT-REPORT-001
title: versioned role reports: schema-validated semantic handoffs with runtime-owned evidence
depends_on: ["DECISION-LOG-001","FLOW-EVIDENCE-001","ROLE-CONFIG-001","STORE-003"]
write_set: ["src/reports/**","src/schema/report*","src/cli/commands/report*","src/cli/commands/task.ts","src/cli/commands/task.test.ts","src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts","content/cli.md"]
requirements: ["reports-not-transcripts","provider-agnostic","runtime-owned-facts","typed-bubbling"]
evidence_required: ["invalid-schema-fixtures","authority-fixtures","attempt-chain-receipt","adapter-equivalence-receipt","content-exclusion-proof","verify-root","final-sha","independent-review"]
---

﻿## Problem

Agent handoffs are currently prose conversations. They repeat context, mix unverifiable mechanical claims with semantic judgment, lose failed attempts, and force downstream roles to read transcripts or ask for another summary.

## Task

Implement versioned, provider/harness/transport-neutral structured reports as the only durable agent-to-agent handoff.

1. Define a stable report envelope: report/attempt id, emitter role/function and version, intended receiver, run/task/candidate references, outcome code, semantic decisions, deviations, risks, open questions, pending decisions, evidence references, source ContextPack digest, output-schema version, and integrity digest.
2. Role-specific payload schemas are referenced from the authoritative Role Catalog. The engine does not hardcode implementer/reviewer names or provider formats. Instances may add schemas but cannot remove envelope integrity or evidence validation.
3. Separate facts from judgment. Runtime supplies candidate SHA, changed paths, test/CI/gate results, timestamps, process state, and evidence existence. Agents may interpret those facts but cannot assert replacements for them. Contradictions are preserved and routed for review.
4. Validate at ingestion: emitter/receiver handoff is allowed; role/run/task binding matches; schema/version is active; referenced evidence exists and is in scope; immutable artifact digests match; mandatory fields are present; content and reference budgets are respected.
5. Preserve every attempt and correction with cause, rejecting receipt, semantic diff, and retry number. A later success never erases failed attempts.
6. Downstream roles receive the validated report plus evidence locators, not the upstream transcript, prompt, reasoning, or tool input/output. Reports are context inputs for BRIEF-CONTEXT-PACK-001.
7. Provide one runtime ingestion/read capability with CLI, UI, and agent-tool adapters as clients. The CLI is not the semantic source and direct database writes are impossible.
8. A report can bubble a typed escalation only along Role Catalog handoff edges. If the emitter lacks amendment authority, it identifies the owning receiver; it never rewrites its contract or expands scope.
9. Apply bounded content and secret/privacy controls before persistence. Raw internal error detail belongs in protected evidence, not the general report.

## RED test

Attempt to ingest a report with an invalid emitter/receiver edge, stale schema, false candidate SHA, and missing evidence. Each case must be rejected with its own stable code before persistence. Before report ingestion and validation exist, the fixture fails because no authoritative rejection receipt can be produced.

## Acceptance

- A valid custom role report round-trips using its catalog schema without engine changes.
- Wrong emitter/receiver, stale schema, wrong task/run/candidate digest, missing evidence, or out-of-scope evidence each return a distinct typed rejection.
- A false agent-provided SHA cannot override the runtime candidate reference.
- Implementer-to-reviewer and reviewer-to-delivery fixtures contain semantic payload plus evidence refs and no transcript/reasoning/tool content.
- A failed attempt followed by correction yields two immutable attempt records linked by cause.
- An implementer requirement conflict bubbles to the declared owner and cannot amend task scope.
- The same canonical report is accepted through fake CLI and agent-tool adapters with the same digest.

## Stop conditions

- No free-text-only completion report.
- No engine branch on bundled role ids.
- No report field that duplicates a runtime-owned mechanical authority fact.
- No transcript storage as handoff evidence.
- No direct store mutation from an agent or adapter.

## Evidence

Provide schema-invalid and authority-invalid fixtures, immutable attempt-chain receipt, adapter-equivalence receipt, transcript/content exclusion proof, full verification, final SHA, and independent report/security review.
