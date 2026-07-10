<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: CLI-START-001
title: sv-playbook start: friccion cero — el CLI genera rol+metodo+estado+proxima accion; AGENTS.md apunta ahi (el prompt deja de vivir en tu cabeza)
depends_on: ["HANDOFF-CMD-001","TASK-RUBRIC-001"]
write_set: ["src/cli/commands/start.ts","src/cli/commands/start.test.ts","src/cli/registry.ts","AGENTS.md","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Reduce daily-startup friction to zero. Today, starting an agent to work correctly requires pasting a large role + method + context prompt — the founder cannot hold that in his head every day. Make the CLI generate it, so the daily ritual becomes: open any agent, say "work on this repo", the agent reads AGENTS.md, runs one command, and is fully oriented and working the right way.
1. `sv-playbook start [--role <role>]` emits, from LIVE state, everything an agent needs to begin: the role charter pointer (default: orchestrator) + the universal METHOD/rubric (verify-not-trust; never do the minimum, handle the obvious adjacent concerns; every "must remember" -> a gate; CLI-only; everything in the repo; criticize proactively) sourced from content/rubric.md (TASK-RUBRIC-001, single source) + the live board snapshot + open PRs + the computed next action. It REUSES the handoff generator (HANDOFF-CMD-001) for the state parts — do not duplicate board-reading logic; `start` is the daily-entry framing that also injects the method.
2. Update AGENTS.md so its FIRST actionable line is: "To begin, run `sv-playbook start` and follow its output." — so any agent that reads AGENTS.md (every harness does) self-orients with one command.

## RED test (write first)
In src/cli/commands/start.test.ts add a test named exactly: "start emits the role, the method rubric, the live board and the next action". Run start against a store with a ready packet and assert the output contains the role pointer, the rubric marker, the board counts, and a next-action line. New command -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `start` command export, OR the test name "start emits the role, the method rubric, the live board and the next action".

## Reuse
The handoff generator (HANDOFF-CMD-001); content/rubric.md (TASK-RUBRIC-001); the status/board readouts; command registration.

## Stop conditions
Duplicating the handoff/board generation instead of reusing it; hardcoding the method instead of sourcing content/rubric.md; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
