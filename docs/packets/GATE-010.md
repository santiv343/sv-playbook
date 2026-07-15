<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-010
title: bidirectional policy impact closure: no mandatory rule without a real consumer or effect
depends_on: ["FLOW-011","ROLE-CONFIG-001"]
write_set: ["src/context/impact*","src/schema/context-impact*","src/check/policy-impact*","src/cli/commands/check.ts","src/cli/commands/check.test.ts","src/db/orm.constants.ts","src/db/store.migrations.ts","src/serve/**"]
requirements: ["POLICY-IMPACT-001@1"]
evidence_required: ["red-test-output","policy-impact-receipt","verify-root","final-sha","independent-review"]
---

## Problem
The durable context catalog currently proves storage, selection, precedence, and delivery, but not behavioral effect. A mandatory principle can be present in the database and even appear in a prompt while no gate, review contract, decision point, or workflow consumes it. That creates false confidence.

## Task
Implement bidirectional Policy Impact Closure for every active mandatory context item.

1. Add versioned typed impact bindings for deterministic gate/capability effects, semantic role/phase/contract criteria, and human decision-point effects. Mixed items may bind multiple effects.
2. Resolve every referenced gate, capability, role, phase, contract, workflow, and human surface through canonical registries. Prose names are not executable references.
3. Emit an immutable Policy Impact Receipt containing policy ref/version/digest, applicable role/phase/task facets, resolved consumers, enforcement mode, source registry versions, and stable violation codes.
4. Fail closed before plan activation, Context Pack acceptance, dispatch, review acceptance, promotion, or human decision presentation when an applicable mandatory item has no compatible impact binding.
5. Validate the inverse relation: active gates, mandatory semantic criteria, and human decision points require an authoritative active policy source. Reject dead controls and duplicated ownership.
6. Expose orphan policies, dead controls, affected workflows, and named recovery owners in `check` and serve projections. Do not send unrelated catalog detail to agents.
7. Migrate every existing active mandatory context item. A temporary migration state may name unresolved bindings, but it cannot be treated as passing closure or dispatchable production state.

## RED test
Add distinct fixtures for: a mandatory principle delivered but unconsumed; a deterministic rule bound only to reviewer prose; a semantic criterion with no accountable role/contract; a human-only decision with no human surface; a gate with no policy source; a binding to a missing registry entry; and a rule applicable to an implementer whose binding exists only for planner. Each must fail with a stable violation code before the dependent effect.

## Acceptance
Every active mandatory context item has a compatible effect for each applicable role/phase. Every active control has one authoritative source. ORM policy `ENG-ENTRY-012@1` resolves to the ORM boundary gate and semantic review criterion. A new orphan mandatory item makes canonical verification red. Context delivery and behavioral impact remain separate receipts.

## Stop conditions
No claim that prompt inclusion equals enforcement. No string-only consumer names, hand-maintained duplicate role lists, global injection of every rule, generic graph engine, silent grandfathering, or reviewer-memory fallback for deterministically checkable rules.

## Evidence
Provide RED outputs, full catalog migration report, bidirectional closure receipt, missing-reference fixtures, cross-role applicability fixtures, check/serve parity, full verification, final SHA, and independent architecture review.
