---
id: HANDOFF-CMD-001
title: sv-playbook handoff: prompt de continuación determinístico desde el estado vivo (relevo de modelo sin perder contexto)
depends_on: []
write_set: ["src/cli/commands/handoff.ts","src/cli/commands/handoff.constants.ts","src/cli/commands/handoff.types.ts","src/cli/commands/handoff.test.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Mechanize model/agent relay: a returning human (or a fresh agent) must be able to pick up the ORCHESTRATOR role without a hand-written handoff and without losing context. Today the handoff is a manually authored prompt — make it a deterministic command generated from live state.

Add `sv-playbook handoff [--role <role>]` (default role: orchestrator). It assembles, from LIVE state, a cold-start continuation prompt with these sections, in this order (stable prefix first for prompt-cache friendliness, variable state last):
1. **Role + cold-start pointers** (STATIC): "You are taking over as <role>. Read first: AGENTS.md, then `sv-playbook docs roles/<role>`, `docs review`, `docs principles`." Do NOT restate the rules themselves — POINT to them (single source, PRINCIPLE-011).
2. **Board snapshot** (LIVE, from the same data as `status`): the inline counts + the packets currently in active/blocked/ready/review (the ones that need attention). Omit the done list.
3. **In-flight external work** (LIVE): open PRs via `gh pr list --json number,title,headRefName,state` if `gh` is available; if not, say so and tell the taker to run it.
4. **Next-action heuristic** (STATIC rules over LIVE state): if any packet is `review` → delegate a reviewer; if `ready` and no lease → dispatch a worker (pin a cheap model); if `active` with a stale lease → takeover; if the board is all done → report to the human for direction.

Layout rule: new command file src/cli/commands/handoff.ts (logic only), src/cli/commands/handoff.constants.ts (the static section text), src/cli/commands/handoff.types.ts if needed, src/cli/commands/handoff.test.ts. Register it in src/cli/registry.ts. Document it in content/cli.md in the same format as the other command sections. Reuse the status report builder (src/status/status.ts) for section 2 — do NOT duplicate board-reading logic (single source).

## RED test (write first)
In src/cli/commands/handoff.test.ts add a test named exactly: "handoff prompt includes the role pointer and the live board snapshot". Build a store with one `ready` packet, run the handoff command, and assert the output contains the string `docs roles/orchestrator` AND the ready packet's id AND the counts header. Today the command does not exist, so the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `handoff` command export (unresolved import in registry.ts), OR the test name "handoff prompt includes the role pointer and the live board snapshot".

## Reuse
src/status/status.ts report builder; existing command registration pattern (see any command in src/cli/commands + registry.ts); `execFileSync('git'/'gh', ...)` pattern already used in src/db/backup.ts.

## Stop conditions
Restating hard rules inline instead of pointing to AGENTS.md/charters; duplicating board-reading logic already in src/status; making `gh` a hard dependency (degrade gracefully if absent).

## Evidence required at close
red-test-output, verify-root, final-sha.
