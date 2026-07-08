# CLI Guide — when and why to use each command

This guide is the single source for agent-facing CLI usage. Harness skills
and the MCP wrapper derive from it; do not duplicate its content elsewhere.

## Exit codes (all commands)

| Code | Meaning |
| ---- | ------- |
| 0 | OK |
| 1 | Gate failure — a playbook rule was violated; the output cites the rule ID |
| 2 | Usage error or incomplete input — fix the invocation, do not retry blindly |
| 3 | System error — report it; do not work around it |

## Commands

### `sv-playbook docs [topic]`

When: at session start, or whenever the process for the current phase is
unclear. Without argument, lists topics. With a topic id (e.g.
`principles`, `cli`), prints that document.

Why: process docs live in the package, not in your project. Never copy
them into the repo; read them on demand.

Further commands (`init`, `adopt`, `grill`, `check`, `task`, `agent`,
`describe`, `upgrade`) are added by later plans; each adds its section
here in the same format. This guide documents only implemented commands.
