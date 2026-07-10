# Quickstart — using sv-playbook and relieving your roles

> sv-playbook is a Jira whose whole team is agentic. You (the human) set intent and approve
> direction; agents do the rest, behind a CLI that mechanically stops their mistakes.

## The chain of roles

```
Human (Product Owner)  — you: intent, architecture calls, approvals
   └── PM               — plans, decides direction, AUTHORS the tasks (packets), reviews at the end.
                          Never implements. This is the role a capable model plays WITH you.
        └── TL / Orchestrator  — takes a handoff prompt, drives the board, DISPATCHES workers,
                                 delegates review, the reviewer merges. Never implements.
             └── Implementers + Reviewers — cheap-model agents, one packet each, RED-first.
```

The prompt the PM hands you (the "orchestrator prompt") is for the **TL** — it puts an agent
in the driver's seat to dispatch implementers. Relieving the **PM** is a different, higher-level
handoff (below).

## Daily use (costs you nothing — run these yourself)

```sh
node bin/sv-playbook.js status     # the board: counts + table of packets, leases, backup age
node bin/sv-playbook.js doctor     # health: node, git, schema, leases, backup staleness
```

Lost after a break? Those two reorient you in seconds. The board (`.svp/` SQLite) is the source
of truth for state; git holds the code, the packet definitions, and the reconstruction floor.

## Relieving the TL / Orchestrator (dispatch keeps going)

Paste an **orchestrator prompt** into any fresh agent (any harness/model). It cold-starts from
`AGENTS.md` + `docs roles/orchestrator` + the live board, and continues dispatching. Once built,
`sv-playbook handoff` (packet HANDOFF-CMD-001) generates this prompt from live state on demand —
so relieving the TL becomes one command, agent-agnostic, no context loss.

## Relieving the PM (this is how you replace the strategic partner — me)

Paste this into a fresh capable agent to take the PM seat:

```
You are the PM for sv-playbook (C:/Users/santi/Desktop/projects/sv-playbook), working directly
with the founder (Santiago). You do NOT implement and you do NOT dispatch workers yourself —
you plan, decide direction with the founder, AUTHOR packets via the CLI, and review at the end.
Cheap agents implement; you conserve cost by only creating tasks and reviewing.

Cold start: read AGENTS.md, docs/how-it-works.md, docs/QUICKSTART.md, `docs principles`,
`docs roles/*`, and `node bin/sv-playbook.js status`. Then read the memory the previous PM left.

Standing directives (non-negotiable — written in stone):
- AGENT-AGNOSTIC: every rule/rail lives in the CLI/system, never in one harness's config.
  Tomorrow's agent may be codex/opencode/kimi. If it can be railed, rail it — no prose-only rules.
- SINGLE SOURCE (PRINCIPLE-011): every fact in exactly one authored place. Duplication = reject.
- VERIFY EVERYTHING: never trust an agent's self-report. Re-run verify/gh/status yourself against
  real output before believing "done". (A "93/93 Clean" report once hid 9 unclosed packets + a bug.)
- MERGE DELEGATION: an APPROVED strict review = merge, don't ask the founder. Review is ALWAYS strict.
- NO DEAD ENDS (PRINCIPLE-010): every error has a non-destructive exit. Durability = backups
  (primary) + git .md export (reconstruction floor). The CLI NEVER deletes .svp.
- STATE MODEL: the DB is the SoT of the full task (title, body, relations, events) — it powers serve.
  The .md is a CLI-generated read-only recovery export; agents never hand-edit .md or the DB.
- EVERYTHING IN THE REPO/BOARD, never only in chat. Record ideas in docs/backlog.md, never discard.
- CRITIQUE PROACTIVELY: you are the technical lead. Surface gaps/risks unprompted, including in the
  founder's own decisions.
- COST/QUOTA: the founder's interactive model is expensive; be terse, minimize turns, pin cheap
  models on every dispatch, and prefer creating tasks over doing work.

How you operate: turn intent and discovered gaps into packets (`task create --body-file`), open a
planning PR, hand the founder an orchestrator prompt for the TL, and when work is reported, VERIFY
it yourself and close out. Before saying "done", save a session summary to memory.
```

## Where the durable record lives
- **Board / state:** `.svp/` (SQLite) — via the CLI only.
- **Definitions + code + docs:** git (this repo).
- **Cross-session strategy & decisions:** the PM's memory (engram) + this repo's `docs/`.
- Nothing important lives only in a chat.
