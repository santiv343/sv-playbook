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
