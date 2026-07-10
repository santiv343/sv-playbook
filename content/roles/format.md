# Role Charter Format (contract for all roles)

Every role charter obeys this contract. Read it once before any role.

## Step types — every step is exactly one of these

- **EXEC** — run exactly the stated command or check, compare the output to
  the stated expectation, take the stated on-mismatch action. Zero
  interpretation. If you cannot run it, report the exact command and error;
  never improvise an alternative.
- **JUDGMENT** — requires reasoning a low-capability session must not
  attempt. If your session is designated `judgment: low` (project config,
  model×role matrix), output `ESCALATE: <role> step <n>` and continue with
  the remaining EXEC steps. Attempting a JUDGMENT step at low capability is
  a contract violation even if the answer happens to be right.

## Universal rules

1. Read ONLY the charter's "Read first" list before acting; everything else
   on demand.
2. All state changes via `sv-playbook task ...`. Editing statuses, packets
   or evidence by hand is a violation the gates will catch.
3. Every claim in your output is accompanied by the literal command output
   that proves it. An unproven claim is worse than no claim.
4. Outputs follow the charter's fixed structure — same sections, same
   order, every time (generated boilerplate, authored deltas).
5. Stopping at a stop condition with evidence is success, not failure.
6. Minimum capability per role: `implementer` — any model; `reviewer`,
   `planner`, `product` — judgment-capable models only (low-capability
   sessions may still execute their EXEC steps and escalate the rest).

## Schema — every role MUST declare ALL of these sections

1. **mission** (`## Mission` or `Mission:` prefix) — one sentence, what the
   role is for. No ambiguity about the role's purpose.

2. **scope + prohibitions** — what the role does AND an explicit list of
   what it must NEVER do. Declared via `## Prohibitions`, `## Scope`, or
   language containing explicit `never` clauses. If a role asserts a
   prohibition, the prohibition must be named exactly (e.g. "never merge",
   "never review own work").

3. **inputs** (`## Read first` or `## Inputs`) — the exact
   reads/commands/files the role must consume before acting. No
   interpretation — a concrete, executable list.

4. **procedure** (`## Steps` or table-based procedure sections) — ordered
   steps in a markdown table with columns `#`, `Type`, `Do`, `Expected`,
   `On mismatch`. Every step type is EXACTLY one of `EXEC` or `JUDGMENT`.
   An EXEC step has a concrete command and expected output;
   a JUDGMENT step has a criterion and an explicit escalation path in the
   `On mismatch` column. `—` (bare dash) is NOT an escalation path.
   No bare verbs — every step must be classifiable.

5. **outputs** (`## Output`) — fixed-structure artifacts the role produces
   after completion. Same sections, same order, every time.

6. **handoffs** (`## Handoffs`) — the exact next role or roles this role
   hands off to, plus the mechanism (e.g. `task move`, PR assignment,
   dispatch). Every named handoff target must correspond to an existing
   role definition file in `content/roles/`.

7. **gates** (`## Gates`) — the mechanical checks this role must pass
   before it is considered complete. Each gate maps to a verifiable
   condition.

8. **decision-authority** (`## Decision Authority` or
   `## decision-authority`) — what the role decides autonomously vs what
   it must escalate. A binary taxonomy: autonomous decisions and
   escalation conditions.

9. **stop-conditions** (`## Stop conditions` or `## Prohibitions`) —
   conditions under which the role halts, waits, or restarts. A stop
   condition with evidence is success, not failure.

10. **capability-floor** — the minimum model capability required for this
    role. Declared as "Minimum capability:" or similar language in the
    role header. Must name the floor AND prescribe what a low-capability
    agent does (skip JUDGMENT steps, escalate, etc.).

11. **responsibility** (`## Responsibility`) — a bullet list of single-word
    action verbs this role OWNS (e.g. `- merge`, `- implement`,
    `- dispatch`). Every responsibility in the union across all roles
    must be owned by EXACTLY ONE role. A responsibility claimed by zero
    roles (gap) or by two or more roles (conflict) is a schema violation.

## Procedure step enforcement

The `check roles` gate mechanically validates every step table:

| Rule | Enforcement |
|------|-------------|
| Type column is `EXEC` or `JUDGMENT` | Violation if any other value |
| JUDGMENT step has non-empty `On mismatch` | Violation if `—`, `-`, or blank |
| EXEC step has concrete command | Warning if heuristic (not gated) |
| Handoff names existing role | Violation if target file absent |
