---
id: CONSTITUTION-CLEANUP-001
title: single-source cleanup: purge stale rebuild/rotate-on-open/grill refs from cli.md, README, spec
depends_on: []
write_set: ["content/cli.md","README.md","docs/specs/**"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

## Task
Kill every stale reference to retracted/renamed machinery in the authored docs (PRINCIPLE-011 single source: a doc that names a command that no longer exists is a lie the next agent trusts). Three stale facts to remove/repair:

1. **`rebuild`** — the command was removed (SQLite is NOT rebuildable from files). Any authored line that presents `rebuild` as an existing command/recovery path must be rewritten to point at `backup state` / `restore state`. The spec's decision log (docs/specs) may KEEP historical mentions that explicitly record the retraction as history — do not rewrite the past, only fix statements that describe rebuild as if it still exists.
2. **rotate-on-open backups** — dropped in DROP-ROTATE-001. In content/cli.md the "Store safety" text still says "Rotating backups land in `.svp/backups/` and keep the last 10 copies silently" — that mechanism is gone. Rewrite to describe the current backup model (explicit `backup state`, auto-backups on configured events).
3. **`grill`** — renamed to `check` (D18). content/cli.md line listing "Further commands (`init`, `adopt`, `grill`, `check`, ...)" names both — drop `grill`.

Scope: content/cli.md, README.md, docs/specs/2026-07-07-sv-playbook-design.md. Do NOT touch role charters, AGENTS.md, or content/review.md (owned by ROLE-ORCHESTRATOR-HARDEN-001).

## Gate (no RED test; this is a docs [criterion] packet)
This packet has no failing unit test. The reviewer verifies by grepping the write_set for `rebuild`, `rotate`, `grill` and confirming every surviving hit is either (a) a historical decision-log entry recording the retraction, or (b) legitimately the current `check` command — never a live description of removed machinery. `verify` must stay green (docs-only, no code change).

## Stop conditions
Touching code, role charters, AGENTS.md, or review.md; rewriting the decision log's history; introducing a new durability claim not backed by an implemented command.

## Evidence required at close
verify-root, final-sha.
