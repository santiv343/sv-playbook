<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: STORE-008
title: receipts: unify seven receipt tables into one with verified data migration
depends_on: ["STORE-007"]
write_set: ["src/db/**","src/promotion/**","src/roles/**","src/check/**","docs/packets/**"]
requirements: ["Seven tables share one shape (kind, subject, payload, digest, timestamp); audit trail forbids drop+reseed"]
evidence_required: ["RED test failing then passing","per-kind count+digest equality pre/post migration","immutability triggers reject update/delete"]
---

## Problem

Seven receipt-shaped tables store the same shape — activation receipts, bootstrap receipts, projection receipts, catalog versions, projection activation, check attempts, promotion receipts: all are (kind, subject, payload, digest, timestamp). Seven schemas, seven ORM mappings, seven query paths for one concept. The event log is already the append-only spine; the receipts are projections of "something was attested".

CAUTION (mandatory, from the master plan): unlike the role catalog, receipts ARE the audit trail — drop+reseed is FORBIDDEN here. This is the only table family in the simplification program whose loss is irreversible.

## Task

Unify all receipt types into one `receipts` table with payload typed by kind, with a verified data migration.

1. New table `receipts(id, kind, subject, payload_json, digest, created_at)` with a CHECK constraint on kind and immutability triggers matching the existing receipt tables' guarantees.
2. Data migration, NOT reseed: copy every row from the seven legacy tables into `receipts` inside one transaction. Verification is part of the migration itself: pre-migration count + digest per kind, post-migration count + digest per kind, equality asserted; mismatch aborts the transaction (migration fails closed, never partial).
3. Readers migrate to the new table behind their existing function signatures (`findPromotionReceipt`, `listPromotionReceipts`, role projection receipt lookups, check attempt reads) — no caller-visible shape changes.
4. Legacy tables are dropped only AFTER the verified copy commits, in the same migration. Post-migration, legacy table names must not resolve (prove with a query test).
5. Digest rule: per kind, digest = sha256 over the ordered concatenation of (id, subject, payload canonical JSON, created_at) — same rule pre and post, defined once in the migration module and reused by the verification test.

## RED test (write first)

In `src/db/receipts-unification.migrations.test.ts` add a test named exactly: `receipts unification preserves every receipt with per-kind digest equality`. Build a fixture store at the pre-unification schema version, insert receipts of every kind (including at least one with nested JSON payload and one with unicode), run migrations to current, assert: single `receipts` table holds all rows, per-kind counts and digests match the pre-migration snapshot exactly, and the seven legacy tables are gone. Today it fails because the unified table and migration do not exist.
Expected failure cause (literal string in the output): the test name `receipts unification preserves every receipt with per-kind digest equality`.

Additional required tests (after RED):
- Immutability triggers on `receipts` reject UPDATE and DELETE.
- A store at current version with zero legacy rows migrates cleanly (idempotent no-op).
- Promotion close-path E2E still passes reading receipts from the new table.

## Mechanism necessity (ENTRY-013)

Removes six tables and six query paths; adds one table that generalizes a shape the system already had seven times. No new concept: "receipt" already exists as a domain word. The migration machinery and ORM carry it.

## Stop conditions

1. One `receipts` table; the seven legacy tables dropped; zero references to legacy table names in `src/`.
2. The named tests above exist and pass against the built output, including per-kind digest equality.
3. A live-store migration runs against a backup-verified copy with pre/post counts matching (run on the operator store copy, evidence attached).
4. `npm run verify` passes all four components; debt baselines do not increase.

## Evidence

- The RED test failing before, passing after (literal output).
- Pre/post migration count + digest table per kind (live-store copy).
- Immutability trigger test output.
- Verify manifest digest.
