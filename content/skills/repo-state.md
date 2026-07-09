---
name: repo-state
description: >-
  Detecta el estado de un repo bajo sv-playbook y lo presenta al humano.
  Triggers on "estado del repo", "state of this repo", "where are we",
  "qué está pasando", "how is the project", "board status".
---

# repo-state — human re-entry harness skill

Read-only. Never mutates the board. Always calls the real CLI — never
duplicates `status` or `doctor` logic.

## 1. Detect the playbook

From the git root (run `git rev-parse --show-toplevel`), check that both
`.svp/` exists as a directory and `playbook.config.json` exists as a file.

## 2. If present

Run both commands and present a compact TABLE. Prefer `npx sv-playbook` when
available; fall back to `node <path-to-cli>` when the CLI is not globally
installed.

```sh
npx sv-playbook status  # or: node bin/sv-playbook.js status
npx sv-playbook doctor  # or: node bin/sv-playbook.js doctor
```

### Required table columns

| Column | Source |
|--------|--------|
| Board counts (draft / ready / active / review / done / blocked / dropped) | `status` output |
| Packets needing attention (any pending review, stale lease, or blocked) | `status` output |
| Health (store schema OK, git root found, all checks pass) | `doctor` output |
| Backup age (last backup timestamp, or WARN if > 24h or missing) | `status` output |
| Active PRs (if any — from `status`) | `status` output |

Summarize — do NOT dump raw CLI output. If any warning is present from
`doctor`, surface it prominently.

## 3. If absent

```
This repo is not under sv-playbook (no .svp/ directory or playbook.config.json
found at the git root).

To adopt it:    sv-playbook adopt   (PLANNED — not yet implemented)

Do not guess the state. Run `git status` for a basic repo overview instead.
```

Never invent a status when the playbook is not set up.

## 4. Read-only guarantee

This skill never runs `sv-playbook task start`, `sv-playbook task move`, or any
other mutating command. It only uses `status`, `doctor`, and `git
rev-parse --show-toplevel` — all read-only.
