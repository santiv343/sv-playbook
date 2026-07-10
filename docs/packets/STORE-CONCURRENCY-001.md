<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: STORE-CONCURRENCY-001
title: store compartido seguro para workers concurrentes: WAL + busy_timeout + transacciones (gap #6; NO aislar por-worktree)
depends_on: []
write_set: ["src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Make the SHARED .svp store safe for concurrent workers across worktrees. Decision (founder): keep the store SHARED (one unified board is exactly what `serve` renders — per-worktree isolation would fragment it); the 2026-07-09 incident's trigger was a schema migration on shared state, already handled by STORE-MIGRATION-SAFETY-001. This packet handles concurrent NON-migration access:
1. Open the store in WAL journal mode (`PRAGMA journal_mode = WAL`) so concurrent readers never block the writer and vice versa.
2. Set a `busy_timeout` so a writer waiting on another writer retries instead of erroring immediately.
3. Wrap every mutating operation (create, move, lease acquire/release, event insert) in a short transaction so concurrent writers serialize cleanly and never half-apply.
4. Document in content/cli.md's persistence-boundary section that the store is intentionally shared and concurrency-safe (WAL + transactions), NOT per-worktree.

## RED test (write first)
In src/db/store.test.ts add a test named exactly: "the store runs in WAL mode and two concurrent writers both commit". Open two connections to the same store, perform an insert from each, and assert both succeeded AND `PRAGMA journal_mode` reports `wal`. Today the mode is default (rollback journal) → it FAILS.
Expected failure cause (literal string in the output): the test name "the store runs in WAL mode and two concurrent writers both commit".

## Reuse
openStore in src/db/store.ts; the existing mutating helpers (wrap them in transactions); PRAGMA settings alongside the existing schema setup.

## Stop conditions
Switching to per-worktree isolated stores (breaks serve's unified board); leaving any mutating op outside a transaction; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
