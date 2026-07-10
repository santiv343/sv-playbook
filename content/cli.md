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

The reviewer checklist lives at `sv-playbook docs review` and runs in full on every PR.

Taste ledgers are per-project config documents (NOT engine defaults):
- `sv-playbook docs taste/product` — product judgments: priorities, shippable bar, tier philosophy, recurring yes/no calls.
- `sv-playbook docs taste/engineering` — engineering judgments: conventions, quality bar, single-source expectations.
- `sv-playbook docs taste/decisions` — owner decisions as reusable preferences (rule + scope + rationale + date).

Each ledger is an appendable list of entries. The reviewer consults all
three during the taste pass; a finding not covered by any entry escalates,
and resolving it appends a new entry. (v2: `sv-playbook decision` command to
manage entries CLI-only.)

### `sv-playbook task create|amend|list|start|move|show|recover|takeover|note|brief`

When: use `task create` to author a packet before implementation, `task amend` to edit its definition while it is still in `draft` or `ready`, `task list`
to inspect the execution queue, `task start` when a worker claims ready work,
and `task move` when the packet changes lifecycle state. Use `task show` for
packet detail, `task recover` for read-only crash inspection, `task takeover`
to claim a stale lease or intentionally replace a live holder, `task note` to
leave progress breadcrumbs, and `task brief` to assemble the deterministic
worker prompt.

Why: packets have two projections. The SQLite state under `.svp/` coordinates
sessions and leases and is never committed. The markdown projection under
`docs/packets/*.md` is the durable review artifact and is always committed.
Leases become stale when their heartbeat is more than 30 minutes old
(`LEASE_TTL_MS`).

Argument shapes:

```sh
sv-playbook task create --id <ID> --title <T> [--write <glob>]... [--depends <ID>]... [--req <REQ>]... [--evidence <E>]... --body-file <path>
sv-playbook task amend <ID> [--title <T>] [--write <glob>]... [--body-file <path>] [--depends <ID>]... [--req <REQ>]... [--evidence <E>]...
sv-playbook task list [--json]
sv-playbook task start <ID>
sv-playbook task move <ID> <status>
sv-playbook task show <ID> [--json]
sv-playbook task recover <ID> [--json]
sv-playbook task takeover <ID> [--force]
sv-playbook task note <ID> <text...>
sv-playbook task brief <ID>
```

Statuses: `draft ready active review done blocked dropped`.

Refusal matrix for `task start`:

| Condition | Result | Hint |
| --------- | ------ | ---- |
| Packet is not `ready` | Refuse with `wrong state <status>` | For `review`, `done`, or `dropped`: reopening goes through the change bridge |
| Lease held by another session and live | Refuse with `held by session <id>` | pause the holder first, or use `task takeover <id> --force` intentionally |
| Lease held by another session and stale | Refuse with `held by session <id>` | use `task takeover <id>` |
| Lease held by the same session | Return OK | idempotent retry |
| Packet is `ready` and unleased | Acquire lease and move to `active` | |
| Packet does not exist | Refuse with `unknown packet: <id>` | |

### `sv-playbook adopt`

When: on a bare repo that has never been under the playbook. Runs
inventory → gap analysis → scaffold (writes playbook.config.json,
AGENTS.md, and remediation packets under docs/packets/ for every
addressable gap). Use `--force` to overwrite an existing config or
AGENTS.md.

Why: it brings a new repo under the playbook in one step. Without
`--force`, the command refuses to clobber existing playbook artifacts
and reports gaps instead.

Argument shape:

```sh
sv-playbook adopt [--force]
```

### `sv-playbook describe`

When: produce a machine-readable JSON catalog of all registered CLI
commands. Each entry has `name` and `summary` fields. Takes no arguments.

Why: the JSON output feeds the MCP wrapper and harness skills so they
can discover available commands programmatically.

### `sv-playbook check [target]`

When: after authoring a packet, before opening a PR, or to detect instruction
mirror drift. Without a target, runs all checks. Targets: `structure`,
`instructions`.

Why: it gives authored artifacts a deterministic mechanical gate (PRINCIPLE-001)
complementing `verify`. Exit 1 (GATE_FAIL) on any violation; exit 0 when clean.

Structure check and baselines: `check structure` validates that every packet
in `docs/packets/` has the required sections (`## Task`, `## RED test`,
`## Stop conditions`, `## Evidence`). New packets must always pass. Historical
packets with accepted violations can be grandfathered by listing their relative
path (e.g. `docs/packets/OLD-001.md`) under `baseline.fingerprints` in
`playbook.config.json`. A baselined packet's missing sections are reported as
info (not a failure), while any new packet missing sections still causes
GATE_FAIL. Without a `playbook.config.json` or without `baseline.fingerprints`,
every packet is checked strictly.

Argument shape:

```sh
sv-playbook check [structure|instructions]
```

### `sv-playbook doctor`

When: at setup, after a confusing CLI/store error, or before dispatching
workers on a repo you have not touched recently. Use `--json` when another
tool, including `serve`, needs the same checks.

Why: it gives agents and humans one non-destructive health readout for the
local environment: Node version, git root, SQLite store schema, packet
directory, and fresh/stale leases.

Argument shape:

```sh
sv-playbook doctor [--json]
```

### `sv-playbook status`

When: whenever a human, orchestrator, or `serve` needs the current board
without reading SQLite directly.

Why: it is the stable read model for board state: packet counts, packet rows,
leases, last events, and backup age. `serve` should render this contract
instead of inventing its own DB queries.

Use `sv-playbook status --json` as the machine-readable contract for `serve`
and automation.

Argument shape:

```sh
sv-playbook status [--json]
```

### `sv-playbook serve [--port <N>]`

When: whenever a human or orchestrator needs a live, read-only web view
of the board without running the CLI directly.

Why: it starts a local HTTP server (node:http, zero runtime deps) that
exposes `GET /` (self-contained HTML dashboard with auto-refresh) and
`GET /api/board` (the same JSON contract as `status --json`). Mutations
are never available through serve. Default port: 3131.

Argument shape:

```sh
sv-playbook serve [--port <N>]
```

Read-only guarantee: serve reads the board through `readBoardStatus` —
the same contract as `status --json` — and never calls store mutators.
The HTML page polls every 3 seconds and has no control buttons.

### `sv-playbook constitution set|add-principle|show|list`

When: to declare or inspect the instance constitution (vision, product definition, principles).
The constitution is per-instance, CLI-managed, and DB-resident under `.svp/`. Generated exports
land in `docs/constitution/` for git durability; they carry a GENERATED banner and must never be
hand-edited.

Why: the engine's universal invariants live in `content/principles.md`. The instance constitution
is declared on top and consulted by agents, serve, and the reviewer to align with the project's
own vision and principles — not the engine's.

Argument shapes:

```sh
sv-playbook constitution set <section> --body-file <path>
sv-playbook constitution add-principle --rule <text> --rationale <text>
sv-playbook constitution show <section> [--json]
sv-playbook constitution list
```

Sections: `vision`, `product_definition` (prose bodies). `principles` is managed via `add-principle`
and `list-principles` (ordered list). The `show` subcommand only reads prose sections; for principles,
use `list-principles` via a future hook or query the DB directly.

### `sv-playbook decision ask|answer|list|show`

When: to escalate a question to the founder (ask), record a binding ruling
(answer), or inspect the decision ledger (list/show). Use `--pending` with
`list` to see only unanswered questions.

Why: decisions are data, not chat prose. Every escalation and its answer
are persisted in the DB and surfaced by start/digest/serve. Answered decisions
are immutable history — supersede with a new ask instead of mutating.

Argument shapes:

```sh
sv-playbook decision ask <question text...>
sv-playbook decision answer <ID> <answer text...>
sv-playbook decision list [--pending]
sv-playbook decision show <ID>
```

### `sv-playbook handoff [--role <role>] [--force]`

When: before ending a session, before handing off to another model/agent, or
when the orchestrator needs to generate a continuation prompt.

Why: it produces a deterministic cold-start prompt from live state so the
incoming agent can pick up without a hand-written handoff. Uses the same board
data as `status`. Default role: `orchestrator`.

Sections: (1) role pointer to AGENTS.md + charters, (2) board snapshot (counts
+ attention packets), (3) in-flight PRs (via `gh`, graceful degrade),
(4) next-action heuristic.

Pre-flight: warns to stderr if active/blocked packets have stale notes (last
transition after last note). Use `--force` to skip.

### `sv-playbook backup state`

When: before risky operations, before handing off important local state, or
whenever `doctor` reports that the last backup is too old. Takes `--force` to
allow backing up while fresh leases exist.

Why: SQLite is the operational source of truth. Backup checkpoints/copies
`.svp/playbook.sqlite` into `.svp/backups/` and writes sidecar metadata with
the source branch, source SHA, schema version, size, and hash.

Argument shape:

```sh
sv-playbook backup state [--force]
```

### `sv-playbook restore state`

When: local operational state must be recovered from a known SQLite snapshot.
Takes `--force` to allow restore while fresh leases exist.

Why: restore replaces `.svp/playbook.sqlite` from a backup file after first
creating a pre-restore backup of the current store.

After restore, always run `sv-playbook doctor` and `sv-playbook status` before
dispatching workers. Stale leases or active packets without leases are process
state to resolve explicitly, not files to edit by hand.

Argument shape:

```sh
sv-playbook restore state --file <path> [--force]
```

### `sv-playbook rebuild [--force]`

When: all other recovery paths have failed and the store is unrecoverable.
This is the LAST-RESORT floor (backups via `restore state` are primary). Takes
`--force` to proceed when live leases exist.

Why: reconstructs the operational database from committed git packet exports
under `docs/packets/*.md`. Reads packet definitions from frontmatter and
derives terminal status from each file's `closed: done|dropped` line. All
other packets are set to `draft`. Refuses if live leases exist unless
`--force`. Takes a pre-rebuild backup of the current store before touching it.
Never deletes `.svp` — the backup preserves the broken store for forensics.

After rebuild, always run `sv-playbook doctor` and `sv-playbook status` before
dispatching workers. The board state is a floor reconstruction; leases, notes,
and transition history are lost.

#### Store safety

When: if the store schema version does not match the CLI's expected schema,
every command refuses with
`store schema v<found> does not match v<expected>: restore a compatible state backup or run a migration before mutating state`.
`backup state` creates an explicit SQLite snapshot with metadata (schema
version, branch, SHA, size, checksum); `restore state` validates before swap.
The backup directory is configurable and can live outside `.svp/` for durability.

Why: shared clients never mutate an incompatible store in place. Recovery is
always explicit and auditable.

#### Persistence boundary

SQLite under `.svp/playbook.sqlite` is the source of truth for live
work-management state: statuses, transitions, leases, sessions, events,
notes, and evidence records. It is local and gitignored because SQLite is a
binary database and cannot be merged safely on `main`.

Markdown is for semantic, human-reviewable documents: principles, role
charters, specs, plans, and long-form packet context. Agents must not create a
second durable state system in markdown or JSON to mirror SQLite.

Durable state backup is a snapshot problem, not a merge problem. The default
backup target is local and must not add noise to `main`. A dedicated backup
branch or remote target may be configured later when the user has permission
and wants off-machine durability, but it is an adapter, not a core
requirement. Until that command exists, `.svp/backups/` are local safety
copies only.

The store is intentionally shared across worktrees — one unified board is
what `serve` renders, so per-worktree isolation would fragment it. The store
opens in WAL journal mode (`PRAGMA journal_mode = WAL`) so concurrent
readers never block the writer and vice versa. A `busy_timeout` is set so a
writer waiting on another writer retries instead of erroring immediately.
Every mutating operation (`create`, `move`, lease acquire/release, event
insert, amend, takeover, import`) is wrapped in a short `BEGIN IMMEDIATE`
transaction so concurrent writers serialize cleanly and never half-apply.

## Harness skills

Harness skills live in `content/skills/` and teach agents to interact with
sv-playbook repos deterministically. Each skill is a self-contained `.md` file
with YAML frontmatter that Claude Code (and compatible harnesses) can load.

To install a harness skill, copy its `.md` file into the harness skills
directory (e.g. `~/.claude/skills/` or `~/.agents/skills/`).

Canonical skill content is in `content/skills/`. Do not duplicate skill
instructions here; point to the skill file.

| Skill | File | Purpose |
|-------|------|---------|
| `repo-state` | `content/skills/repo-state.md` | Human re-entry — detect `.svp/` and present board status, health, and attention items |

Further commands (`init`, `adopt`, `check`, `agent`,
`upgrade`) are added by later plans; each adds its section
here in the same format. This guide documents only implemented commands.
