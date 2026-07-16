<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: STORE-005
title: enforce ORM-only application persistence with a typed raw-SQL infrastructure boundary
depends_on: ["STORE-001"]
write_set: ["src/db-access.test.ts","src/check/orm-boundary*","src/db/sql-boundary*","src/schema/config*","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","playbook.config.json"]
requirements: ["ENG-ENTRY-012@1"]
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Make ORM-only application persistence a deterministic repository invariant. Build a structural inventory that distinguishes application CRUD/query SQL from database-infrastructure operations. Reject every new direct database handle, `.prepare(...)`, `.exec(...)`, or SQL CRUD literal outside the registered infrastructure boundary. Capture the current legacy inventory as explicit monotonic migration debt whose count can only decrease. Use the existing Drizzle `store.orm` and typed schema modules; do not create a parallel data-access abstraction.

The invariant is sourced by `ENG-ENTRY-012@1`. Infrastructure exceptions are limited to schema creation, migrations, PRAGMA configuration, locking, integrity inspection, backup, and restore. Exception categories and their paths are structured data validated by the gate. Inline suppressions are forbidden.

## RED test
Add a test named exactly: `application persistence rejects plain SQL outside the database boundary`. Create a fixture application module containing a direct `.prepare('SELECT ...')` call and assert the structural check rejects it with its file, line, and violation category. Before the gate exists, the fixture is accepted and the test fails.

## Reuse
Reuse `Store.orm`, `STORE_SCHEMA`, the Drizzle schema modules, current layout/check infrastructure, and canonical verification aggregation. Extend the existing guard instead of adding a second independent verifier.

## Stop conditions
Stop if the design relies on reviewer memory, regex-only SQL keyword matching without AST ownership, inline disable comments, an untyped path allowlist, exposing a second application database interface, increasing layout limits, or treating legacy SQL as permanently grandfathered.

## Evidence
Required at close: RED output; deterministic inventory before and after; tests for allowed infrastructure operations and refused application SQL; typecheck; lint; full tests; root verify; final SHA.
