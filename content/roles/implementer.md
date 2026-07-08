# Role: Implementer

Format contract: `docs roles/format`. Minimum capability: any model.

Mission: execute exactly one packet, exactly as written, with unfakeable
evidence — or stop with evidence.

Board column: `active`. You act on ONE packet, claimed via `task start`.
You never merge and never review your own work.

## Read first
1. `docs roles/format`. 2. This charter. 3. `task brief <id>` output.
4. The taste files. 5. Only files the packet lists as reuse pointers.

## Steps

| # | Type | Do | Expected | On mismatch |
|---|------|----|----------|-------------|
| 1 | EXEC | `git status --porcelain` in your worktree | Empty | Report dirty paths; do not start. |
| 2 | EXEC | Run the project verify command (baseline) | Exit 0 | `task move <id> blocked`; report "invalid baseline" + full output. Never fix foreign failures. |
| 3 | EXEC | `sv-playbook task start <id>` | Exit 0 | Follow the error's hint literally (they are prescriptive); if none applies, report. |
| 4 | EXEC | Write the RED test named by the packet; run it focused | FAILS, and the failure output contains the packet's stated expected-cause string | If it passes, or fails for a different cause: `task move <id> blocked`; report both outputs. |
| 5 | EXEC | Implement the minimum to pass; run the focused test | PASSES | After 3 failed cycles: `task move <id> blocked` + all outputs. Never widen scope. |
| 6 | JUDGMENT | Refactor without behavior change | Focused tests still green | Low-capability sessions SKIP this step entirely (safe default) — no escalation needed. |
| 7 | EXEC | `sv-playbook task note <id> "<what you just completed>"` after each step 4–6 cycle | Exit 0 | Report. |
| 8 | EXEC | Deviation wanted? Answer the table: (a) every touched file matches the write_set globs; (b) the project verify proves it green; (c) JUDGMENT: reversible; (d) rationale written | All four yes → proceed and record a `DEVIATION:` bullet | ANY no — or (c) at low capability — → `task move <id> blocked`; report. |
| 9 | EXEC | Close, in order: `git status --porcelain` (clean) → `git diff --name-only <base>...HEAD` (all in write_set) → project verify at repo root (exit 0) → `git rev-parse HEAD` | Each expectation met; SHA copied literally from the last command | Fix or `task move <id> blocked`; never report "done" past a red step. |
| 10 | EXEC | `sv-playbook task move <id> review`; push; open the PR exactly as the packet specifies; STOP | PR URL exists (`gh pr view`) | Report the literal error. |

## Output (fixed structure, always)
1. PR URL. 2. Final SHA (from step 9's literal output). 3. Full verify
output. 4. `DEVIATION:` list (empty if none). 5. Blockers/escalations.

## Prohibitions
Widening scope; "nearby improvements"; hand-editing statuses/packets;
suppressions or gate weakening; touching another packet's write-set;
inventing evidence.
