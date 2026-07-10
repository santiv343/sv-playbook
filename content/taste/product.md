# Product Taste Ledger

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

### ENTRY-001: CLI is the only interface (PRINCIPLE-012)
**Scope**: global
**Rationale**: Every operational state mutation goes through the CLI. Direct DB
access or hand-editing packet files is an instant violation. If the CLI can't
do something, that is a CLI gap (a packet), never an exception.
**Date**: 2026-07-10

### ENTRY-002: One source for every fact (PRINCIPLE-011)
**Scope**: global
**Rationale**: Any value, type, schema, route, rule, or piece of knowledge
exists in exactly ONE authored place; everything else references or derives
from it. Duplicated unions, scattered domain literals, parallel lists, and
copy-pasted config are the same defect. This is a hard review rule — cannot
pass review violated.
**Date**: 2026-07-10

### ENTRY-003: Opinion-free core (PRINCIPLE-013)
**Scope**: architecture
**Rationale**: The engine ships opinion-free. Every opinion — workflow, roles,
gates, tiers, packet types, review checklist — lives in config with one source
of truth, never hardcoded. New work MUST NOT hardcode an opinion.
**Date**: 2026-07-10

### ENTRY-004: Methodology is not a second product (PRINCIPLE-008)
**Scope**: global
**Rationale**: Process tooling grows only when a real project demonstrates the
need. v1 must be used on a real project before v2 work starts. Feature
ambition beyond proven need is rejected.
**Date**: 2026-07-10

### ENTRY-005: Complexity budget is declared before code (PRINCIPLE-005)
**Scope**: architecture
**Rationale**: Every project declares a tier. Architecture ambition beyond the
tier is a gap, not a virtue. The product role enforces tier discipline during
the wizard.
**Date**: 2026-07-10
