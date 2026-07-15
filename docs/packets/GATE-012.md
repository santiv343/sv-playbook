<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-012
title: M0 deterministic promotion controller: candidate-bound verify, review, integration and atomic close
depends_on: ["BUG-013","GATE-005","FLOW-013","AGENT-REPORT-001"]
write_set: ["src/promotion/**","src/schema/promotion*","src/cli/commands/promotion*","src/orchestration/*promotion*","src/tasks/service*","src/serve/**","content/cli.md"]
requirements: ["DEC-025","candidate-bound","deterministic-promotion","human-operable","single-operation-contract"]
evidence_required: ["contract-conformance-receipts","candidate-binding-fixtures","recovery-fixtures","manual-workflow-parity","verify-root","final-sha","independent-review"]
---

## Problem

The authoritative bootstrap-promotion contract and DEC-025 define deterministic
promotion, but no executable packet owns the complete controller. Existing preflight,
evidence, review, merge and task-close paths remain separate and can disagree. M0
cannot claim a stable delivery floor while `done` is not the consequence of one
candidate-bound promotion operation.

## Task

Implement the local v1 `PromotionController` from the active promotion contract.

1. Materialize an immutable candidate identity with base SHA, candidate SHA, work
   definition, write-set and applicable contract digests.
2. Run typed mechanical checks and clean verification against that exact candidate.
   `unknown` and unavailable evidence never become pass.
3. Consume only valid independent review decisions bound to the same candidate and
   required review-policy version. Agents may judge; they cannot integrate or close.
4. Recheck every mutable prerequisite immediately before integration. The runtime
   performs or observes an idempotent local Git integration and records resulting SHA.
5. Produce task `done` only after verified integration through the same durable
   operation. Remove every alternate public transition to `done`.
6. Persist intent before each external effect and make crash recovery bounded,
   replay-idempotent and visible. An inconclusive state blocks and routes recovery; it
   never invents success or failure.
7. Expose one typed public Playbook operation. A human may invoke it manually with all
   required inputs; workflows invoke the same operation. CLI and Serve are projections
   and cannot author a parallel close path.
8. Keep forge/provider/harness/OS specifics behind existing ports. M0 requires local
   Git conformance; remote forge integration remains optional.

## RED test

- Closing without a candidate-bound clean verification is rejected.
- Approval from the implementer or for another SHA is rejected.
- A candidate change after approval invalidates promotion.
- Integration failure or inconclusive recovery cannot produce `done`.
- Replaying the same accepted promotion is idempotent and cannot integrate twice.
- Direct `task move <id> done` cannot bypass the controller.
- Manual CLI and workflow callers produce the same promotion receipt.

## Acceptance

- The contract acceptance suite passes against the real controller.
- One local candidate traverses verify, independent review, integration and atomic
  close with receipts all bound to one identity.
- Kill/restart fixtures cover every intent/effect boundary.
- Full verification and independent promotion/security review pass.

## Stop conditions

- No string-presence evidence gate.
- No reviewer, delivery role or implementer merge/close authority.
- No separate manual and automated promotion implementations.
- No GitHub-only requirement for the local M0 path.

## Evidence

Provide contract-conformance receipts, candidate-binding fixtures, recovery fixtures,
manual/workflow parity, full verification, final SHA and independent review.
