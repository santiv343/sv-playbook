<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-013
title: risk-based reviewer policy: independence, dimensions, disagreement, replacement, and invalidation
depends_on: ["AGENT-REPORT-001","BRIEF-CONTEXT-PACK-001","GATE-006","ROLE-CONFIG-001"]
write_set: ["src/review-policy/**","src/review/**","src/schema/review*","src/cli/commands/review*","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","content/review.md","playbook.config.json"]
requirements: ["risk-based","independent-review","runtime-preflight","provider-agnostic","stale-approval-denied"]
evidence_required: ["risk-plan-fixtures","independence-quorum-receipts","dimension-fixtures","arbitration-receipt","replacement-history","candidate-invalidation","provider-invariance","verify-root","final-sha","independent-refutation"]
---

﻿## Problem

The repository has reviewers, refuters, mechanical preflight, and promotion language, but no single risk-based review policy. Reviewer count, specialization, independence, disagreement, replacement, and required evidence are ambiguous. This either duplicates cost without adding signal or lets risky work pass with a generic approval.

## Task

Define and enforce a provider/model/harness/VCS/forge-neutral review policy driven by risk and change characteristics.

1. Runtime computes observable risk inputs from task class, affected authority/state/security/privacy/process/UI/API surfaces, reversibility, blast radius, dependency depth, migration/data impact, external commitment, and explicit human classification. Agents may recommend a higher class but cannot lower it.
2. Instance policy maps risk/change tags to required review dimensions, reviewer count, capability floor, optional model/provider diversity, refutation/arbitration requirement, and human decision point. Defaults are profile data, not engine constants.
3. Every candidate passes mechanical preflight before semantic reviewers: exact immutable candidate, write-set/scope, build/static/tests/CI, evidence existence/digests, dependency/gate state, secret/content checks, and reviewer independence eligibility. Agents do not re-check deterministic facts.
4. Runtime selects eligible reviewer identities/runs and compiles dimension-specific ContextPacks. Author/implementer, packet author when prohibited, prior failed reviewer where replacement is required, and any identity lacking independence cannot approve.
5. Review dimensions may include requirement correctness, regression/design, test quality, security/threat model, privacy, data/migration, accessibility/UX, operations/recovery, and product intent. A semantic role may cover multiple dimensions only when policy permits and context/budget/capability evidence is sufficient.
6. Reviewer output is structured: verdict, dimension, located findings, requirement/evidence refs, severity, falsifiability class, uncertainty, residual risk, and checked-vs-assumed claims. Reviewer never edits, merges, closes, cleans, changes requirements, or manufactures mechanical evidence.
7. Mechanically falsifiable reviewer findings are checked by runtime and returned for bounded self-correction. Semantic disagreement routes to an independent arbiter/refuter per policy. Unresolved product/value/risk acceptance reaches human-interface; no majority vote silently decides it.
8. Reviewer failure/timeout/malformed report triggers runtime replacement and preserves the attempt. Approval quorum counts only valid independent reports bound to the same candidate/context/policy version.
9. Candidate changes invalidate prior semantic approvals according to affected dimensions; runtime computes the invalidation scope and re-routes reviews. No stale approval follows a new SHA.
10. Promotion consumes the canonical ReviewDecision receipt. Reviewers and delivery-orchestrator cannot promote or merge.

## Bundled profile defaults

- Low, local, reversible: one independent general review after mechanical preflight.
- Shared/API or moderate regression: one general review plus explicit test-quality dimension.
- State/migration/security/privacy/process/authority: specialized dimension review plus independent adversarial refutation; no single reviewer covers authoring and approval.
- Product/external/irreversible risk acceptance: required semantic reviews plus human-interface decision queue for the irreducible choice.

These defaults are configurable only within active constitutional/security minimums.

## RED test

Bind an approval to the implementer run, omit a required specialist dimension, and then change the candidate SHA. Review planning and promotion must reject self-review, incomplete dimension coverage, and stale approval respectively. Before the policy exists, no canonical ReviewDecision can prove these refusals.

## Acceptance

- The same change tags produce the same required review plan across two provider adapters.
- An implementer or same run/session cannot satisfy approval independence.
- A generic reviewer cannot satisfy a required security/privacy dimension without matching capability/eval evidence.
- Green mechanical evidence is supplied once and is not delegated to reviewer prose.
- A false missing-file finding is mechanically refuted and returned for bounded correction with attempt history.
- Two semantic reviewers disagreeing routes to declared arbitration; majority count alone cannot promote.
- Reviewer timeout creates a replacement; the failed attempt remains and does not count toward quorum.
- Candidate SHA change invalidates affected approvals and promotion rejects the stale receipt.
- A low-risk fixture uses the configured minimal review; a high-risk fixture activates all required dimensions without hardcoded provider names.

## Stop conditions

- No reviewer merges, promotes, cleans, or edits.
- No self-review or approval by prompt convention alone.
- No LLM used for deterministic preflight.
- No fixed reviewer count in core.
- No stale/cross-candidate approval.
- No silent human risk acceptance.

## Evidence

Provide risk-plan fixtures, independence/quorum receipts, specialized-dimension fixtures, disagreement/arbitration receipt, replacement history, candidate-invalidation receipt, provider-invariance receipt, full verification, final SHA, and independent review-policy refutation.
