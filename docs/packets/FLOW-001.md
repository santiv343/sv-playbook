<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-001
title: dispatch run: the CLI executes the plan (worktree+lease+launch via adapters) + idle-watch makes inaction visible — knowing becomes doing
depends_on: ["DISPATCH-PLAN-001","GATE-005"]
write_set: ["src/dispatch/**","src/cli/commands/dispatch.ts","src/cli/commands/dispatch.test.ts","content/dispatch/adapters.md","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Close the founder's exact gap (2026-07-10, verbatim: "de saber que puede hacerlo, a lo hace es otra cosa"): DISPATCH-PLAN-001 computes what CAN be dispatched; nothing makes it HAPPEN. Mechanize the doing:
1. `sv-playbook dispatch run [--batch|--id <ID>] [--adapter <name>]` — executes the plan: for each dispatchable packet it (a) creates the worktree (the standard layout), (b) runs `task start` (lease), (c) launches the configured worker harness with the generated brief (adapters from content/dispatch/adapters.md graduate from prose recipes to CODE: opencode serve API, headless CLI spawn — per-instance config with a capability floor per packet type/role), (d) records a dispatch event (who, adapter, model, packet).
2. The orchestrator's job shrinks from "executor of choreography" to "supervisor of exceptions": it runs dispatch run, then handles only reviews and escalations.
3. IDLE WATCH (the accountability half): the plan/status/serve surface, for every dispatchable packet, its IDLE AGE (time since it became dispatchable with no lease). `doctor` warns when dispatchables sit idle beyond a configured threshold while capacity exists. Inaction becomes visible, not silent.
4. Every skipped dispatchable in a `dispatch run --batch` requires a reason flag or is reported as skipped in the dispatch event — composing with AGENT-REPORT-001's "what I did not do": not dispatching is a stated decision, never an omission.
Windows first-class: process spawning must work on win32 (no POSIX-only tricks).
Opinion-free: adapters/thresholds per instance; an instance may keep dispatch manual (config), but then idle-watch still reports.

## RED test (write first)
In a dispatch-exec test add a test named exactly: "dispatch run starts the packet and records a dispatch event with the adapter". With a fixture adapter (a stub command that the config points at), run dispatch run --id on a ready packet and assert: lease taken, the stub was invoked with the brief content, and the dispatch event recorded adapter+packet. New command -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `dispatch run` export, OR the test name "dispatch run starts the packet and records a dispatch event with the adapter".

## Reuse
DISPATCH-PLAN-001 (the plan is the input — single source, never recompute); task start/brief; content/dispatch/adapters.md recipes (graduate to config-driven code); the events table; MODEL-ROUTING-001 for capability floors when it lands.

## Stop conditions
Recomputing eligibility outside the plan builder; silent skips of dispatchables; POSIX-only process handling; launching without a recorded dispatch event; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
