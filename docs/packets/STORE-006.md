<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: STORE-006
title: migrate every application persistence query from plain SQL to typed ORM access
depends_on: ["STORE-005"]
write_set: ["src/**"]
requirements: ["ENG-ENTRY-012@1"]
evidence_required: ["verify-root","final-sha"]
---

## Task
Remove the legacy application SQL inventory exposed by the ORM-only persistence gate. Migrate each application module to the configured ORM and typed Drizzle schemas, preserving transactional behavior and query semantics. Work must be decomposed into bounded dependency-ordered slices before activation; this umbrella packet cannot be dispatched directly with an unresolved module inventory.

This packet is complete only when the gate reports zero direct database handles, `.prepare(...)`, `.exec(...)`, and SQL CRUD literals outside the database-infrastructure boundary. DDL, migrations, PRAGMA configuration, locking, integrity inspection, backup, and restore remain inside their typed infrastructure capabilities.

## RED test
The gate's deterministic legacy inventory is the RED condition. At least one current application module must be named before migration begins, and the final assertion is an empty application-SQL inventory.

## Reuse
Reuse `Store.orm`, `STORE_SCHEMA`, existing Drizzle schemas, and the ORM-only gate. Add missing typed schemas to their owning bounded contexts; do not centralize every table into one unrelated module.

## Stop conditions
Do not activate this umbrella packet before the runtime has materialized bounded module slices with non-overlapping write sets and explicit dependencies. Stop on semantic query drift, lost atomicity, raw `sql` escape hatches for ordinary CRUD, untyped row casts, or permanent baseline entries.

## Evidence
Required at close: zero application-SQL inventory; module regression tests; transaction tests; typecheck; lint; full tests; root verify; final SHA.
