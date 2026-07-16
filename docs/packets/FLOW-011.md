<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-011
title: role-scoped context policy: classify taste, principles, decisions, and learned corrections once; route them deterministically
depends_on: ["DECISION-DURABILITY-001","ROLE-CONFIG-001"]
write_set: ["src/policy/**","src/taste/**","src/decisions/**","src/schema/context-policy*","src/cli/commands/policy*","src/cli/commands/taste*","src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts","src/check/source*","content/taste/**","docs/decisions/**","content/cli.md"]
requirements: ["deterministic-applicability","one-source-per-fact","authority-aware-precedence","reports-not-transcripts"]
evidence_required: ["migration-inventory","conflict-supersession-fixtures","routing-receipts","explainability-receipts","verify-root","final-sha","independent-review"]
---

﻿## Problem

Taste, principles, decisions, role rules, defaults, and learned corrections currently repeat the same facts in several Markdown ledgers. Because applicability is mostly prose, agents either receive too much context or must remember to look for it. Reliable delivery of a prompt is also being confused with enforcement.

## Task

Create a single context-policy registry that classifies and routes governance facts without turning judgment content into a policy language.

1. Classify every current entry as exactly one of: constitutional invariant, binding decision, role constraint, task requirement/acceptance, human taste, instance default, or learned correction.
2. Store minimal structured metadata: stable id/version, class, status (`active | superseded | deferred | retired`), owner, strength (`mandatory | advisory | reference`), structured selectors, source reference, provenance, supersedes references, and integrity hash. The statement, rationale, examples, and counterexamples remain readable prose.
3. A fact has one authoritative owner. Other artifacts reference its id/version; they never copy the rule. Generated projections carry source ids/hashes. Duplicate ids, multiple active owners, unresolved references, and supersession cycles fail closed.
4. Scope selectors are data: role/function, lifecycle phase, risk class, task/capability tags, project/instance, and optional path domain. Unknown selectors fail. An LLM does not decide which entries another LLM receives.
5. Classifying a newly learned human preference is semantic work owned by human-interface, assisted by planner/refuter when needed. Once classified, applicability and delivery are deterministic.
6. Repeated corrections create a typed LearningCandidate with occurrence references, impact, proposed destination, and evidence. Runtime detects mechanical recurrence where possible; agents may report candidates. Promotion to invariant/policy/taste follows the owning authority and preserves supersession history.
7. Migrate current mirrors and the duplicate DEC-005 without losing provenance. SQLite decision records and generated decision history become one decision system, not parallel authorities.
8. Expose `policy explain`/equivalent machine-readable output showing why an entry applies or does not apply. Context delivery is not enforcement: entries backed by a gate/capability reference are enforced there; advisory taste remains judgment guidance.

## Precedence

1. Active constitutional and authority invariants cannot be overridden by a run/task instruction.
2. Active instance invariants.
3. Human-approved intent and binding decisions within the invariant envelope.
4. Role constraints and task requirements, which may narrow but never grant authority.
5. Scoped taste.
6. Instance defaults.

A human request conflicting with an invariant produces `CONSTITUTION_CHANGE_REQUIRED`; it does not bypass the rule. The human may separately approve a versioned constitutional amendment after impact analysis/refutation. Explicit excludes never remove mandatory entries.

## RED test

Create fixtures with duplicate active ownership, an unknown selector, a supersession cycle, and an explicit exclusion of a mandatory invariant. Compilation must fail with distinct stable codes. Before the registry and selector closure exist, these invalid inputs are accepted or cannot be evaluated.

## Acceptance

- Every current taste/principle/decision entry has one classification and one owner or an explicit supersession tombstone.
- The duplicate DEC-005 and all known principle mirrors are detected by ownership/reference checks, not text equality.
- A reviewer pack receives reviewer/global entries but not implementer-only taste; the inverse also holds.
- An explicit task exclusion of a mandatory invariant is rejected.
- A lower-precedence conflict is excluded with a receipt; an unresolved same-level conflict stops compilation.
- A superseded entry is excluded and replaced by its active successor.
- A learned correction can bubble from implementer to its declared owner without letting the implementer amend policy.
- No test treats prompt inclusion as proof that an effect was enforced.

## Stop conditions

- No semantic similarity, embeddings, or LLM-based applicability routing.
- No schema containing a custom prose policy DSL.
- No second taste/decision store.
- No role may self-expand authority or directly amend a higher-owned artifact.
- Do not delete provenance while deduplicating.

## Evidence

Provide a complete migration inventory, conflict/supersession/selector fixtures, role-routing receipts, explainability receipts, source-ownership receipt, full verification, final SHA, and independent semantic review.
