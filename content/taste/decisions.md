# Decision Log

> **Instance**: sv-playbook (NOT an engine default — per-project config).
> **Mechanism**: appendable. Each entry records an owner decision as a
> reusable preference. When the same question arises again, the log answers it.
> Not every decision creates a taste entry — only those that encode a
> recurring judgment.
>
> **v2 upgrade noted**: promote to a CLI-managed `decision` command so it is
> CLI-only, not a hand-edited file.

## Template (new entries follow this shape)

```md
### DEC-xxx: <rule>
**Scope**: <project area or global>
**Rationale**: <why this decision was made>
**Date**: YYYY-MM-DD
**Alternatives considered**: <rejected options with reasons>
```

---

## Decisions — sv-playbook instance

### DEC-001: SQLite for operational state, Markdown for durable artifacts
**Scope**: architecture
**Rationale**: SQLite under `.svp/` coordinates sessions and leases and is
never committed (binary merge conflicts). Markdown under `docs/packets/` is
the durable review artifact and is always committed. Two projections, one
system.
**Date**: 2026-07-10
**Alternatives considered**: Single SQLite with git-backed snapshots (rejected:
too complex for merge); JSON-only (rejected: no concurrent-safety).

### DEC-002: Node >=22.13.0 minimum engine
**Scope**: infrastructure
**Rationale**: Native `node --test` runner, ESM by default, and modern
TypeScript tooling. Avoids Jest/Mocha dependency chains.
**Date**: 2026-07-10
**Alternatives considered**: Node 20 LTS (rejected: lacks stable native test
runner features used in verify); Bun (rejected: narrower ecosystem support).

### DEC-003: PRINCIPLE-013 maturity ladder — prose → gate → config
**Scope**: architecture
**Rationale**: Every rule graduates through three rungs: (1) prose (agents
follow from docs), (2) gate (CLI enforces mechanically), (3) config (each
instance chooses its own value). Only opinions reach config. Universal
invariants stop at gate. One-directional.
**Date**: 2026-07-10
**Alternatives considered**: All rules as prose (rejected: no mechanized
enforcement); all rules as config immediately (rejected: premature — rules
must stabilize before configuring).

### DEC-004: No MVL (Minimum Viable Laziness) — tasks carry implicit scope
**Scope**: process
**Rationale**: If a task obviously implies extras, do them or explicitly flag
why not. Silence is a gap. This is part of the universal acceptance rubric
every implementer must consider.
**Date**: 2026-07-10
**Alternatives considered**: Strictly scoped tasks only (rejected: produces
"not my job" gaps between adjacent concerns).

### DEC-005: Merge delegated to reviewer (D25)
**Scope**: process
**Rationale**: On APPROVED, the reviewer performs the merge — update-branch if
needed, green CI check, merge, post-hoc report. Never a question. This
prevents implementers from merging their own work and the premature-close
mistake pattern (PRs #6 and #9).
**Date**: 2026-07-10
**Alternatives considered**: Implementer merges after approval (rejected:
branches go stale, CI drifts); admin-only merge (rejected: bottleneck).

### DEC-005: Machine-first — derivable work never goes to agents or humans
**Scope**: global
**Roles**: all
**Rationale**: Constitution principle cf11bd51 (founder 2026-07-11). Anything
deterministic and derivable by code is done by code (reconciler, merge queue,
preflights). Chat agents doing bookkeeping is a defect. See FLOW-010/GATE-004.
**Date**: 2026-07-11
**Alternatives considered**: agent-operated convergence (rejected: 6/6 prompt
rules violated in 24h; fragile and expensive).

### DEC-006: Agents are semantic kernels without hands
**Scope**: global
**Roles**: all
**Rationale**: Constitution principle 5634be06. Agents receive the mechanical
results as input and contribute judgment only. Roles without iteration needs
(reviewer) become function calls: context in, schema-validated verdict out —
no shell, no process. Subtractive permissions leak; additive I/O surfaces
cannot.
**Date**: 2026-07-11
**Alternatives considered**: operator-agents with subtracted permissions
(rejected: every forgotten surface was found and used — 6 incidents).

### DEC-007: The store is written by exactly one blessed process
**Scope**: store
**Roles**: all
**Rationale**: STORE-003. Workers never open the live .svp: worktree CLIs are
clients of the daemon running default-branch code. Version skew becomes
structurally impossible. Interim regime until it lands: workers run zero
board commands; the PM transitions on their behalf.
**Date**: 2026-07-11
**Alternatives considered**: per-agent discipline (rejected: violated 5/5);
file permissions (rejected: not portable on Windows).
