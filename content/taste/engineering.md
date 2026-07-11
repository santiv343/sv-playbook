# Engineering Taste Ledger

> **Instance**: sv-playbook (NOT an engine default — per-project config).
> **Mechanism**: appendable list. Every entry is a reusable judgment. When a
> reviewer finds a gap, the resolution becomes a new entry (learning loop:
> never asked twice).

## Template (new entries follow this shape)

```md
### ENTRY-xxx: <short rule>
**Scope**: <project area or global>
**Rationale**: <why this judgment exists>
**Date**: YYYY-MM-DD
```

---

## Entries — sv-playbook instance

### ENTRY-001: Determinism first (PRINCIPLE-001)
**Scope**: global
**Rationale**: If something can be validated deterministically, it MUST be.
Every rule is `[gate]` or justified `[criterion]`. Every agent claim is backed
by literal command output. Every requirement maps to at least one executable
acceptance test.
**Date**: 2026-07-10

### ENTRY-002: Generated boilerplate, authored deltas (PRINCIPLE-009)
**Scope**: documentation
**Rationale**: Anything that repeats across documents or sessions is generated
by the CLI or extracted to one source and referenced by ID — never rewritten
by an agent. Agent-facing writing is maximally concise: no restating the
process, reference by ID.
**Date**: 2026-07-10

### ENTRY-003: No dead ends (PRINCIPLE-010)
**Scope**: global
**Rationale**: Every error an agent can encounter must carry a documented,
non-destructive exit: a recovery command, an automatic self-heal, or moving
the packet to blocked. An agent improvising destructively is a SYSTEM bug,
fixed by a new rail, never a scolding.
**Date**: 2026-07-10

### ENTRY-004: No claim without literal command output
**Scope**: reviews
**Rationale**: Every claim in a review or report must be backed by literal
command output. Claims without evidence are an instant REQUEST CHANGES. This
is an anti-hallucination guard — trust command output, never reports.
**Date**: 2026-07-10

### ENTRY-005: Root-cause over local patches (PRINCIPLE-014)
**Scope**: architecture
**Rationale**: Prefer the best durable design over the quickest local patch.
Reviews fail changes that solve only the observed symptom while leaving the
same class of failure open. A repeated correction is a missing rail, schema,
gate, or task — not a reminder.
**Date**: 2026-07-10

### ENTRY-006: No speculative abstractions
**Scope**: code
**Rationale**: Abstractions must be earned. No interfaces, wrappers, or layers
built "just in case." Every abstraction justifies itself by consolidating at
least two concrete users.
**Date**: 2026-07-10

### ENTRY-007: Names say what things are
**Scope**: code
**Rationale**: An outsider must understand each public name at sight. Naming
is a first-class design decision, not an afterthought. Ambiguous names are a
review finding.
**Date**: 2026-07-10

### ENTRY-008: Schema change ⇒ version bump + migration
**Scope**: store
**Roles**: implementer, reviewer
**Rationale**: Any change to SCHEMA content (column, table, or CHECK list)
must bump SCHEMA_VERSION and add an openStore migration case. A
CHECK-constrained enum on an existing table is NOT updated by
`CREATE TABLE IF NOT EXISTS` — fresh test DBs pass while every real store
breaks at runtime (PR #121 round-2 P0).
**Date**: 2026-07-11

### ENTRY-009: Stop conditions are grep-checkable; the reviewer runs the grep
**Scope**: review
**Roles**: reviewer
**Rationale**: A packet's stop conditions are literal claims about the diff.
Approving without grepping them let STORE-001 close done with 14 raw
JSON.parse sites and a 2-file lint ban (BUG-007). Verdicts cite the grep
output, not the implementer's summary.
**Date**: 2026-07-11

### ENTRY-010: Extend guards, never fork them
**Scope**: store, gates
**Roles**: implementer, reviewer
**Rationale**: A new code path that needs an existing guard (backup-first,
write_set check, overlap rule) calls the SAME single source. A second
implementation drifts silently and weakens the rail (PR #124 F2).
**Date**: 2026-07-11

### ENTRY-011: Tests prove behavior on EXISTING state, not just fresh state
**Scope**: store, migrations
**Roles**: implementer, reviewer
**Rationale**: Fixture DBs must include aged/real-shaped states (old schema
versions, populated rows). A suite that only exercises freshly created state
certifies nothing about the store users actually have.
**Date**: 2026-07-11
