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

### `sv-playbook task create|list|start|move`

When: use `task create` to author a packet before implementation, `task list`
to inspect the execution queue, `task start` when a worker claims ready work,
and `task move` when the packet changes lifecycle state.

Why: packets have two projections. The SQLite state under `.svp/` coordinates
sessions and leases and is never committed. The markdown projection under
`docs/packets/*.md` is the durable review artifact and is always committed.

Argument shapes:

```sh
sv-playbook task create --id <ID> --title <T> [--write <glob>]... [--depends <ID>]... [--req <REQ>]... [--evidence <E>]... --body-file <path>
sv-playbook task list [--json]
sv-playbook task start <ID>
sv-playbook task move <ID> <status>
```

Statuses: `draft ready active review done blocked dropped`.

Refusal matrix for `task start`:

| Condition | Result | Hint |
| --------- | ------ | ---- |
| Packet is not `ready` | Refuse with `wrong state <status>` | For `review`, `done`, or `dropped`: reopening goes through the change bridge |
| Lease held by another session | Refuse with `held by session <id>` | use takeover (P3) |
| Lease held by the same session | Return OK | idempotent retry |
| Packet is `ready` and unleased | Acquire lease and move to `active` | |
| Packet does not exist | Refuse with `unknown packet: <id>` | |

Further commands (`init`, `adopt`, `grill`, `check`, `agent`,
`describe`, `upgrade`) are added by later plans; each adds its section
here in the same format. This guide documents only implemented commands.
