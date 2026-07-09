---
id: STORE-RECOVERY-GUARD-001
title: no dead-end: CLI nunca borra .svp; mismatch -> recovery nombrado (restore backup / rebuild); reinstaura rebuild
depends_on: []
write_set: ["src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts","src/cli/commands/rebuild.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
The CLI must be incapable of leaving any agent at a destructive dead-end. Incident 2026-07-09: a worker hit a schema version mismatch on the shared `.svp` and DELETED it to "fix" the dead-end, collapsing the board. Agent-agnostic fix (lives in the CLI, not any harness): make deletion unnecessary and named-recoverable.
1. The store version guard AND any corruption/mismatch path must refuse with a NAMED, non-destructive recovery message, exactly: `store unusable (<reason>): restore a verified backup with 'restore state --file <snap>' (primary), or 'rebuild' from git (last resort) — never delete .svp`. The CLI itself must NEVER delete `.svp`.
2. Reinstate `rebuild`: `sv-playbook rebuild` reconstructs the DB from the committed git packet exports under docs/packets/*.md — definitions from frontmatter, and terminal status from each file's `closed: done|dropped` line. This is the LAST-RESORT floor (backups are primary). It refuses if live leases exist unless `--force`, and takes a backup before touching the store.

## RED test (write first)
In src/db/store.test.ts add a test named exactly: "a version mismatch refuses with a named non-destructive recovery and never deletes .svp". Open a store, set `PRAGMA user_version` to a wrong value, run a store-opening command, and assert: it throws/refuses with the recovery message (mentioning both `restore state` and `rebuild`), AND the `.svp/playbook.sqlite` file still exists on disk. Today the guard message does not name both recoveries → it FAILS.
Expected failure cause (literal string in the output): the test name "a version mismatch refuses with a named non-destructive recovery and never deletes .svp".

## Reuse
Existing STORE-VERSION guard in src/db/store.ts; the git .md parser in src/packets/document.ts for rebuild; command registration pattern.

## Stop conditions
Any code path that deletes `.svp`; a recovery message that is not actionable/named; making rebuild the primary (backups are primary); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
