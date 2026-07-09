---
id: SKILL-REPO-STATE-001
title: skill 'estado del repo': cualquier agente detecta .svp/ y llama al playbook (re-entrada humana)
depends_on: ["HANDOFF-CMD-001"]
write_set: ["content/skills/**","content/cli.md"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

## Task
Ship a harness skill so a human can open ANY agent, in ANY repo, say "decime el estado de este repo", and the agent knows to consult the playbook instead of guessing. This is the human re-entry path (complements the agent-facing `handoff` command).

Create `content/skills/repo-state.md`: a self-contained Claude-Code-style skill file with YAML frontmatter (`name: repo-state`, a `description` that triggers on "estado del repo / state of this repo / where are we / qué está pasando"). The body instructs the agent, deterministically:
1. Detect the playbook: check for a `.svp/` directory and a `playbook.config.json` at the git root.
2. If present: run `sv-playbook status` and `sv-playbook doctor` (or `node bin/sv-playbook.js ...` when not globally installed) and present the result to the human as a compact TABLE — board counts, packets needing attention, health, backup age. Do NOT dump raw output; summarize.
3. If ABSENT: say the repo is not under sv-playbook and offer `sv-playbook adopt` (note: PLANNED) — never invent a status.
4. Read-only: this skill never mutates the board.

Also: document the skill in content/cli.md under a short "Harness skills" note (one source: the skill file is canonical; cli.md only points to it and says how to install it — copy into the harness skills dir). Add it to the `docs` topic list if docs enumerates content/ (check src; if docs auto-lists content, no code change needed).

## Gate (no RED unit test; content [criterion] packet)
Reviewer verifies: content/skills/repo-state.md exists with valid frontmatter and a trigger description; its steps call the real CLI commands (`status`, `doctor`) and handle both the present and absent cases; it is strictly read-only; cli.md points to it without duplicating its content; `verify` stays green.

## Stop conditions
Duplicating status/doctor logic into the skill instead of calling the CLI; making the skill mutate state; hardcoding a repo path.

## Evidence required at close
verify-root, final-sha.
