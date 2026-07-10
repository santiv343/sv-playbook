<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: DISPATCH-PLAN-001
title: dispatch plan: CLI computes safe parallel batches and hold reasons for delivery TL
depends_on: ["FLOW-CONFLICT-001","HANDOFF-CMD-001"]
write_set: ["src/cli/commands/dispatch.ts","src/cli/commands/dispatch.test.ts","src/cli/registry.ts","src/status/status.ts","src/status/status.types.ts","src/tasks/service.ts","content/cli.md","content/roles/orchestrator.md","content/dispatch/worker.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Eliminate the need for a founder-interface agent to hand-write a prompt or manually decide execution order for the Delivery TL. Add a CLI-generated dispatch plan that a `delivery-orchestrator` can read and execute directly.

Implement `sv-playbook dispatch plan`:
1. Read the live board from the store.
2. List ready packets, active packets, review packets, and blocked packets relevant to dispatch.
3. Compute safe parallel batches from:
   - `depends_on` status;
   - `write_set` overlap using the same deterministic overlap rule as `FLOW-CONFLICT-001`;
   - current ready/active leases;
   - optional model routing when `MODEL-ROUTING-001` exists.
4. Output, in deterministic order:
   - `Batch 1: safe parallel` with packet IDs, title, write_set, and suggested worker capability;
   - `Hold` with exact reason for each non-dispatchable packet: unmet dependency, write_set conflict with `<ID>`, active lease, or awaiting review;
   - `Reviewer queue` for packets in review;
   - `Commands` section with the exact `task brief <ID>` commands and the instruction to use `docs dispatch/worker`.
5. `sv-playbook start --role delivery-orchestrator` must include this dispatch plan once CLI-START-001 lands. Until then, the command is useful standalone.

The dispatch plan is a read-only operational view. It never mutates state and never launches workers. Launching remains the orchestrator/harness layer until an explicit dispatch automation packet exists.

## RED test (write first)
Add a CLI test named exactly: "dispatch plan groups non-overlapping ready packets into a parallel batch".

Create a fixture store with:
- packet A ready, write_set `["src/a/**"]`;
- packet B ready, write_set `["src/b/**"]`;
- packet C ready, write_set `["src/a/inner/**"]`.

Run `dispatch plan` and assert:
- A and B appear in the same safe parallel batch;
- C appears under Hold with a write_set conflict against A;
- the output includes the exact command `task brief`.

Expected failure cause (literal string in the output): the test name "dispatch plan groups non-overlapping ready packets into a parallel batch".

## Reuse
`readBoardStatus` / store access patterns; `overlaps` from `src/tasks/service.ts`; `task list` data shape; `content/dispatch/worker.md`; `content/dispatch/adapters.md`; `CLI-START-001` for later role-specific startup integration.

## Stop conditions
Launching workers from this command; duplicating the overlap algorithm instead of reusing the single source; producing a plan that omits conflict reasons; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
