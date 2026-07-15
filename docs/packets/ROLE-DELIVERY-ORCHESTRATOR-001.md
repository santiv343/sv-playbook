<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ROLE-DELIVERY-ORCHESTRATOR-001
title: delivery-orchestrator: bounded semantic recovery decisions over runtime-owned delivery
depends_on: ["AGENT-REPORT-001","BRIEF-CONTEXT-PACK-001","BUG-014","FLOW-008","ROLE-CONFIG-001"]
write_set: ["content/roles/delivery-orchestrator.md","content/roles/orchestrator.md","src/orchestration/**","src/schema/orchestration*","src/check/orchestrator*","src/cli/commands/check*","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts"]
requirements: ["runtime-owned-effects","bounded-semantic-authority","typed-bubbling","reports-not-transcripts","provider-agnostic"]
evidence_required: ["authority-invalid-fixtures","incident-decision-evals","refutation-fixture","retry-bubbling-receipts","content-exclusion-proof","verify-root","final-sha","independent-review"]
---

﻿## Problem

The current orchestrator charter mixes product planning, shell execution, board mutation, worktree/session management, verification, review routing, and merge authority. That makes the most powerful agent responsible for both judgment and deterministic effects, and causes repeated improvisation when evidence is incomplete.

## Task

Define the `delivery-orchestrator` semantic contract and its decision-quality controls. The role coordinates approved delivery through runtime capabilities; it does not execute delivery mechanics.

1. Unique judgment: choose among runtime-valid dispatch/recovery options within an approved sprint; decide when investigation, additional review, retry, replacement, or replan is semantically warranted; interpret typed subordinate reports; escalate unresolved product/risk/constitutional choices to human-interface.
2. Inputs: approved immutable work definitions; dependency graph and risk class; current RuntimeStatus deltas; configured concurrency/model/review/retry dials; validated ContextPack digests; typed implementer/investigator/reviewer reports; capability results and failure receipts.
3. Outputs: `DispatchRequest`, `InvestigationRequest`, `ReviewRequest`, `RetryDecision`, `ReplacementDecision`, `ReplanRequest`, `OperationalResolution`, and `Escalation`. Every output is bounded by run/task ids, rationale, evidence refs, policy/dial references, and expected next state.
4. Runtime owns worktree/lease/session creation, adapter/profile selection conformance, process launch/resume/abort, timers, liveness classification, state transitions, evidence capture, verification, review independence routing, promotion, integration, cleanup, backup, and recovery execution. The role requests/chooses; runtime validates and performs.
5. The delivery-orchestrator never plans product intent, authors acceptance criteria, implements, investigates by editing, reviews semantic correctness, arbitrates its own disputed decision, merges, or performs cleanup.
6. Runtime filters deterministic impossibilities before asking the role. The role never checks paths, write-set coverage, dependencies, permissions, PIDs, process activity, test exit codes, or evidence existence manually.
7. Self-correction is limited to its own semantic decisions while contract/scope remain unchanged and retry budget remains. Rejected attempts are preserved. Requirement/scope conflicts bubble to human-interface/planner; review disagreement follows the catalog arbitration edge; capability gaps go to runtime owner.
8. Decision quality is evaluated against incident fixtures and counterfactual cases. High-risk recovery/override proposals require independent refutation. The role must state uncertainty and cannot convert missing evidence into success.
9. The role sees compact state transitions and reports, never raw subordinate conversations, reasoning, prompts, or continuous tool output.
10. No provider/model/harness/OS/VCS/storage names appear in the role contract. The instance profile maps capability floors and adapters.

## RED test

Give delivery-orchestrator edit, shell, process, merge, or cleanup capability in a catalog fixture and pass it a deterministic dependency failure as a judgment request. Validation must reject the capabilities and runtime must resolve the dependency failure without invoking the role. Before the contract is enforced, these boundaries are not mechanically provable.

## Acceptance

- The catalog validator rejects any delivery-orchestrator capability granting edit, shell, store, process, worktree, merge, cleanup, or evidence-write effects.
- A ready task produces a DispatchRequest; a fake runtime materializes it. The role does not create the worktree or launch process.
- A deterministic write-set/dependency/profile failure is rejected before invoking the role and returned as a typed RuntimeStatus delta.
- An implementer scope conflict bubbles to planner/human-interface and cannot be solved by expanding scope.
- A silent session timeout is handled by runtime supervisor; the role receives only the terminal/recovery choices and content-free evidence.
- A reviewer request is bound to an independent identity and immutable candidate by runtime; the role cannot select the implementer as reviewer.
- Repeated bad retry choices exhaust a configured budget and escalate with all attempts preserved.
- Incident fixtures cover role mutation, direct implementation temptation, fabricated verification, orphaned abort, and cross-scope repair.

## Stop conditions

- No EXEC/shell steps in the charter.
- No deterministic polling/checking duty assigned to the role.
- No authority inferred from a provider profile.
- No direct implementer/reviewer conversation or transcript handoff.
- No unbounded retry or silent fallback.

## Evidence

Provide catalog authority-invalid fixtures, incident decision evals, independent-refutation fixture, typed bubbling/retry receipts, transcript exclusion proof, full verification, final SHA, and independent orchestration review.
