<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-008
title: agent executor port and adapters: dispatch run launches real agents (opencode first) with mechanical prompts and evented lifecycle
depends_on: ["DISPATCH-PLAN-001"]
write_set: ["src/dispatch/**","src/cli/commands/dispatch*","src/schema/**","content/dispatch/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-10): the whole dispatch cycle the PM just ran BY HAND (compose a dispatch prompt, invoke `opencode run --agent delivery-orchestrator`, monitor output, collect the report) must live in the CLI — "algo hexagonal o port y adapter, y que uno de los posibles dispatchs sea con opencode. todo este proceso, para mecanizarlo". Build the agent-execution port:
1. PORT (hexagonal, in the engine): an `AgentExecutor` interface — `launch(job) -> handle`, `status(handle)`, `stop(handle)` — where a job is {role, packetIds, workdir, promptPath, sessionTitle}. The engine knows NOTHING about vendors; it depends only on this port. Executor calls and results are evented (dispatch-launched, dispatch-exited with exit code) — mechanical capture, no self-report.
2. ADAPTERS (config-selected, zero new runtime deps — child_process only):
   - `opencode`: shells `opencode run --agent <role> --title <t> "<prompt>"` in the right workdir; maps playbook roles to opencode.json agent names via config; captures stdout to .svp/dispatch/<id>.log; exit code -> event.
   - `manual` (default when nothing configured): PRINTS the exact command + generated prompt path for a human/foreign agent to run — dispatch still works with zero integration, keeping the core opinion-free.
   - The adapter surface must make a future claude-code/codex adapter a pure addition (registry pattern, like commands).
3. PROMPT GENERATION IS MECHANICAL (founder: "cuanto menos delegemos a que lo genere la IA, mejor"): `dispatch prompt <batch>` renders the dispatch prompt from DATA — role charter (content/roles), operating rules (single source, the same rules the PM hand-wrote today: CLI-first, closed-world, no destructive, honesty, TDD red-first, one worktree/PR per packet, reviewer greps stop conditions), plus `task brief` output per packet. No free-form prose composed by an LLM.
4. `dispatch run [--batch <ids>|--sprint]` (composes with FLOW-001/DISPATCH-PLAN-001): compute the plan, create worktrees (reuse the worktree flow), generate prompts, launch via the configured executor, event everything; `dispatch status` lists live handles with log tails; `dispatch stop <handle>` (composes with FLOW-005 control plane).
5. Config (validated schema, STORE-001 module): `dispatch.executor: "opencode"|"manual"`, `dispatch.roleMap: {implementer: "implementer", ...}`, `dispatch.logDir`. Per-instance; engine defaults to manual.

## RED test (write first)
In a dispatch-exec test add a test named exactly: "dispatch run launches the configured executor per packet and events the launch and exit mechanically". With a fixture config selecting a stub executor (a test adapter recording calls), run dispatch run on a one-packet batch: assert the adapter received role+workdir+prompt path, the prompt file contains the packet brief and the operating rules, and dispatch-launched/dispatch-exited events exist with the exit code. Today no executor port exists -> the FIRST failure is the missing module/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing dispatch executor module, OR the test name "dispatch run launches the configured executor per packet and events the launch and exit mechanically".

## Reuse
FLOW-001 (dispatch run semantics — this packet supplies its execution leg; do not fork the plan computation from DISPATCH-PLAN-001); the worktree flow (FLOW-WORKTREE-001); task brief as the per-packet context source; the events table; the config schema module (src/schema); content/roles charters as the prompt's rule source; the command registry pattern for adapter registration.

## Stop conditions
Any runtime dependency (opencode invoked via child_process, never an SDK); the engine importing a vendor adapter directly (port only); LLM-composed prompts (template + data only); a second plan computation; silent launch failures (every exit is an event); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
