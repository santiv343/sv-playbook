<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: CLI-SOLE-INTERFACE-001
title: PRINCIPLE-012 + gate de lint: prohibir acceso directo a la DB fuera de src/db (el CLI es la unica interfaz, mecanizado)
depends_on: []
write_set: ["eslint.config.js","content/principles.md","content/review.md","src/db-access.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Establish and MECHANICALLY enforce that the CLI is the sole interface to operational state (founder hard invariant: zero direct DB access, zero hand-editing packet files — identical for agents AND the orchestrator). Three parts:
1. PRINCIPLE (content/principles.md) — add PRINCIPLE-012: "The CLI is the only interface. Operational state (the SQLite store, packet definitions, the board) is never read or written directly — every create, edit, query, and recovery goes through the CLI. Direct DB access or hand-editing a packet file is an instant violation, identical for agents and the orchestrator. If the CLI cannot do something, that is a CLI gap (a packet), never an exception."
2. THE MECHANIZED GATE (eslint.config.js) — the un-bypassable part, because all code reaches main via PR + required CI. Add a no-restricted-imports (and/or no-restricted-syntax) rule that BANS importing `node:sqlite` / constructing `DatabaseSync` / opening the `.svp` store path ANYWHERE except the sanctioned data-access layer `src/db/**`. Add an override that allows it ONLY under `src/db/**` (store.ts, backup.ts, rows.ts and their tests). Any other file (commands, tasks, adopt, serve, cli, scripts) touching the DB directly fails `lint` -> fails `verify` -> cannot merge.
3. REVIEW HARD RULE (content/review.md) — direct-DB-access and hand-edited packet files are instant REQUEST CHANGES; record it in the hard-rules section.

## RED test (write first)
In a new test src/db-access.test.ts add a test named exactly: "no source file outside src/db opens the sqlite store directly". Walk `src/**/*.ts` (skip `src/db/**` and `*.test.ts`), read each file, and assert none imports `node:sqlite` or references `DatabaseSync`. Run npm test after writing ONLY the test: it PASSES if the codebase is already clean, so to be RED-first ALSO plant a temporary offending line (a `// @ts-expect-error import { DatabaseSync } from 'node:sqlite'` reference) in one non-db fixture the test scans, confirm the test FAILS, then the real deliverable is the eslint rule + removing the plant so both the test and lint enforce it going forward.
Expected failure cause (literal string in the output): the test name "no source file outside src/db opens the sqlite store directly".

## Reuse
The eslint no-restricted-syntax/override pattern already used for single-source in eslint.config.js; the src-walking pattern from src/layout.test.ts.

## Stop conditions
Allowing DB access outside src/db/** (that is the whole point); weakening the ban to pass; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
