<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-016
title: M0 Stable End-to-End Floor: executable release acceptance and version receipt
depends_on: ["INIT-001","BUG-018","BUG-014","CLI-START-001","FLOW-014","FLOW-001","FLOW-013","GATE-012","GATE-007","ROLE-FOUNDER-INTERFACE-001","ROLE-DELIVERY-ORCHESTRATOR-001","SPRINT-DETAIL-001","BACKUP-OFFSITE-001"]
write_set: ["src/acceptance/**","src/verification/**","src/cli/commands/release*","src/schema/release*","content/cli.md"]
requirements: ["DEC-032","manual-agent-parity","end-to-end","restart-safe","release-gated","real-adapter-dogfood"]
evidence_required: ["manual-black-box-receipt","agent-black-box-receipt","opencode-dogfood-receipt","restart-recovery-matrix","backup-restore-receipt","m0-version-receipt","verify-root","final-sha","independent-release-review"]
---

## Problem

Individual modules and contracts can pass while the product still cannot complete its
one required job. M0 needs one black-box release boundary that proves Playbook works
from a clean local start through completed software delivery, both manually and with
agents, without conversation state or hidden operator choreography.

## Task

Implement the executable acceptance gate for DEC-032, `M0 - Stable End-to-End Floor`.

1. Start from a clean temporary Git project and fresh Playbook state using only the
   documented public installation/start interface.
2. Execute the configured path: human intent, clarification and approval; plan;
   deterministic plan preflight; independent refutation and repair; task
   materialization; delivery coordination; implementation; observable supervision;
   validated structured reports; independent review; deterministic promotion; sprint
   report; configured human approval.
3. Run the same semantic scenario twice:
   - entirely through public manual CLI/Serve operations with no agent;
   - through configured agent workflows using the OpenCode adapter.
   Both paths consume the same operation, role, state and artifact contracts.
4. Prove restart and recovery at representative persisted effect boundaries, including
   an invalid agent output, a retryable adapter failure and a promotion interruption.
5. Prove verified backup and restore without losing decisions, work, runs, reports,
   approvals or terminal state. The instance's configured off-machine backup policy
   must be observable and truthful.
6. Emit one version receipt binding the source SHA, configuration, operation catalog,
   role catalog, workflow definitions, schemas, adapter compatibility, test fixture
   and resulting artifacts.
7. Add a fast deterministic black-box suite using a conformant fake agent adapter and
   a separate real OpenCode dogfood receipt. CI never depends on a paid provider, and
   fake conformance never substitutes for the real adapter receipt.
8. M0 cannot pass with degraded/manual substitutions, unclassified operations,
   missing receipts, stale projections, direct database mutation, transcript handoffs
   or unsupported security claims.

## RED test

- A manual-only implementation without agent workflow parity fails.
- An agent-only implementation without complete manual operation parity fails.
- Missing planning, review, promotion, restart, backup or human-approval evidence each
  fail with distinct codes.
- A fake adapter passes the deterministic scenario while a missing/stale OpenCode
  compatibility receipt keeps the real-adapter acceptance red.
- Any feature packet unrelated to M0 is rejected from an active sprint until the M0
  version receipt exists.

## Acceptance

- A new operator can run the documented local path from zero and inspect every state,
  denial and recovery in CLI or Serve.
- The human needs only product decisions; no delivery choreography or repeated role
  explanation is required.
- The complete scenario is repeatable, restart-safe and receipt-backed.
- M0 version receipt is generated only after every dependency and acceptance dimension
  passes. This receipt unlocks subsequent feature sprints.
- Full verification and independent end-to-end release review pass.

## Stop conditions

- No new product feature inside this packet.
- No mock-only claim of OpenCode support.
- No hand-authored release checklist disconnected from executable receipts.
- No requirement to build a roadmap/milestone subsystem.

## Evidence

Provide manual and agent black-box receipts, real OpenCode dogfood receipt,
restart/recovery matrix, backup/restore receipt, M0 version receipt, full verification,
final SHA and independent release review.
