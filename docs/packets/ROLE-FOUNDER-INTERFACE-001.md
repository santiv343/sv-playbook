<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ROLE-FOUNDER-INTERFACE-001
title: human-interface: intent clarification, decision boundary, status/change/start-project contract
depends_on: ["AGENT-REPORT-001","PACKET-AUTHORING-GATE-001","ROLE-CONFIG-001","TASK-RUBRIC-001"]
write_set: ["content/roles/human-interface.md","content/roles/founder-interface.md","content/roles/product.md","content/roles/planner.md","src/human-interface/**","src/schema/human-interface*","src/cli/commands/start*","src/cli/commands/status*","src/cli/commands/digest*","docs/QUICKSTART.md","content/cli.md"]
requirements: ["human-not-founder","intent-before-work","runtime-capabilities-only","provider-agnostic","reports-not-transcripts"]
evidence_required: ["cold-start-receipt","restart-receipt","ambiguity-fixture","authority-receipt","profile-language-fixture","verify-root","final-sha","independent-review"]
---

﻿## Problem

The human currently has to reconstruct context, remember process rules, speak to delivery roles, and repeat corrections. The existing `founder-interface` packet also mixes product clarification, strategic technical judgment, delivery orchestration, and direct CLI work, and hardcodes a founder-led identity.

## Task

Define `human-interface` as the configurable human-facing entry role. It represents the boundary of human influence, not a job title and not a delivery role.

1. Own the evolving Intent Contract: problem, desired outcome, boundaries, constraints, priorities, trade-offs, observable success, and facts marked `human-stated | inferred | proposed`.
2. Clarify ambiguous input with focused questions, concrete examples, alternatives, costs, risks, and a recommendation. Never turn ambiguity into downstream work silently.
3. Answer status/change/start-project interactions using runtime-produced digests and typed capability requests. The role may request deterministic task/sprint/decision creation or amendment after semantic work is approved; it never edits the repository, store, leases, worktrees, processes, or delivery state itself.
4. Invoke planner, advisor, and refuter contracts when their independent judgment is needed. The human-interface owns the approved work definition and decision queue; specialists produce proposals, not authority.
5. Hand approved work to delivery-orchestrator only after authoring gates pass. It never talks directly to implementers/reviewers in the normal path and never chooses their operational dispatch.
6. Receive sprint/project digests, reviewer disagreements, unresolved semantic blockers, product/risk choices, and requested constitutional changes. Hide routine bookkeeping while preserving evidence references and uncertainty.
7. Convert repeated human corrections into LearningCandidates and route them to the correct owner. Do not make the human repeat a captured decision. Do not promote inferred taste without confirmation.
8. Use the human's configured language and communication taste. Default profile: Spanish, plain language, no unexplained jargon, examples and trade-offs proportional to risk, concise status first with expandable evidence.
9. A normal human request cannot weaken active safety/authority invariants. A conflict produces a separate versioned constitutional-change proposal with impact analysis and refutation; only that explicit flow may change future policy.
10. Reconstruct every new session from authoritative state, active Intent Contract, applicable context policy, and current digest. Conversation transcripts are neither authority nor required resume state.

## Outputs

- `IntentContract`
- `ChangeContract`
- `ClarificationRequest`
- `DecisionRecordRequest`
- `WorkDefinitionRequest`
- `StatusDigest`
- `HumanDecisionQueue`
- `ConstitutionChangeProposal`
- `LearningCandidate`

Every output is schema-valid, versioned, scoped, and contains evidence/reference ids rather than transcripts.

## RED test

Submit an ambiguous human request and a request to skip an active invariant. The first must not produce ready work; the second must return CONSTITUTION_CHANGE_REQUIRED. Before the human-interface contract and gates exist, either request can flow downstream without the required typed refusal.

## Acceptance

- A cold start with the bundled profile opens human-interface without user configuration and can clarify a new project before any task exists.
- A restart with no conversation history reconstructs the same active intent/state digest from authoritative artifacts.
- A repeated captured decision is answered from its active record and is not escalated again.
- An ambiguous request cannot produce a ready packet or delivery handoff.
- Status requests use one runtime digest capability and do not route through delivery-orchestrator or shell commands.
- An approved work definition can request deterministic packet creation but cannot dispatch an implementer directly.
- A request to skip independent review returns `CONSTITUTION_CHANGE_REQUIRED`, not a weakened task.
- The default profile speaks plain Spanish; a different instance profile changes language/style without source changes.

## Stop conditions

- Do not rename a hardcoded founder role into another hardcoded role in engine code.
- Do not grant edit/bash/store/process authority to human-interface.
- Do not duplicate planner, delivery-orchestrator, or reviewer judgments.
- Do not persist raw conversation as the resume mechanism.
- Do not infer confirmation from silence.

## Evidence

Provide cold-start/restart fixtures, ambiguity and repeated-decision fixtures, capability-authorization receipt, invariant-conflict fixture, profile-language fixture, full verification, final SHA, and independent product/authority review.
