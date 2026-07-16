<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-009
title: agent activity in CLI and serve from deterministic supervisor state
depends_on: ["FLOW-008","BUG-014"]
write_set: ["src/cli/commands/dispatch*","src/cli/commands/serve*","src/cli/commands/index.gen.ts","src/schema/**","src/config.ts","src/config.test.ts","src/config.types.ts","src/config.constants.ts","playbook.config.json","bin/sv-playbook.js"]
requirements: ["machine-first","provider-agnostic","runtime-owned"]
evidence_required: ["red-test-output","shared-builder-parity","content-exclusion","verify-root","final-sha","independent-review"]
---

## Task

Expose deterministic agent activity in the CLI and local serve UI. This packet is a consumer of the normalized supervisor from BUG-014 and the durable launch handles from FLOW-008; it does not infer activity independently.

1. Use one activity-status builder for every renderer. It joins launch identity with BUG-014's normalized snapshot and never parses agent prose.
2. CLI:
   - `dispatch status` prints handle, role, packet, adapter, control health, execution phase, progress age/evidence code, deadline remaining, cleanup state, and terminal result;
   - `dispatch watch` updates only changed rows/events and does not stream transcripts.
3. Local serve UI: add an Agents view driven by the same data. Show compact state first. Raw logs are an explicit diagnostic drill-down and are never included in upstream agent context or sprint reports by default.
4. Make stalled, unreachable, errored, and orphaned states visually and machine-readably distinct. A server heartbeat, `busy`, PID existence, or CPU alone cannot display as healthy progress.
5. Emit notification events for stalled, resumed, aborted, orphaned, recovered, and terminal transitions. FLOW-001 consumes those events for retry/escalation; this packet does not ask an agent to poll or decide cleanup.
6. Preserve bounded history so the human can answer: what phase is running, what mechanical evidence last changed, how old it is, what deadline applies, and what recovery the runtime performed.
7. All thresholds, refresh rates, notification routing, and optional log retention are validated configuration. Rendering never owns policy.

## RED tests

- CLI and serve serialize the same normalized fixture to equivalent status fields.
- A server-alive/session-stale fixture is shown as stale, not healthy.
- A running tool fixture shows tool phase, elapsed time, evidence age, and deadline without command/input/output content.
- An OpenCode-aborted session with a surviving child is shown as orphaned until cleanup verification succeeds.
- Watch emits only changed compact states, not repeated full snapshots or transcript parts.
- Notification events fire once per transition and recovery clears the active alert without deleting history.

## Acceptance

- The founder can inspect all live handles from CLI and serve without reading agent transcripts.
- The orchestrator receives only typed transition events and compact receipts.
- CLI/UI state is reproducible from a frozen activity-event fixture.
- Full verification passes and independent review confirms there is one status source and no semantic liveness inference.

## Stop conditions

- Do not implement another liveness state machine, timer, adapter, or process killer here.
- Do not use agent self-report text, transcript tails, or LLM summaries as activity evidence.
- Do not push continuous raw output into the orchestrator or human-interface context.
- Do not silently map unknown activity to healthy.

## Evidence

- RED test output.
- Shared-builder parity receipt for CLI and serve.
- Content-exclusion receipt.
- Full verify receipt.
- Final SHA and independent review.
