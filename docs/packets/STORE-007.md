<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: STORE-007
title: roles: collapse catalog from 20 tables to 2-3 (constant is the source)
depends_on: ["FLOW-020"]
write_set: ["src/roles/**","src/db/**","src/gateway/**","docs/packets/**"]
requirements: ["2839 LOC and 15+ aspect tables materialize an immutable constant; consumers use narrow APIs"]
evidence_required: ["RED test failing then passing","table count <=3 with identical public output","~2000 LOC removed"]
---

## Problem

The role catalog keeps its source of truth in an immutable constant (`BUNDLED_ROLE_PROFILE`) but materializes it into 15+ aspect tables with activation, versioning, bootstrap/projection receipts, and a capacity evaluator around it: `src/roles/` is 2.839 LOC across 31 files for what is, semantically, a constant. Justification recorded as IDEA-050 (`unvalidated/scheduled-v2`). Verified in the simplification audit: external consumers go through narrow APIs — `requireActiveRoleCatalog` (`src/gateway/gateway.ts:30`), `requireExecutionProfileModelEvidence` — never through the tables, so the collapse preserves signatures. Timing note from the master plan: cheapest now, before Aurora stores exist.

## Task

Collapse the role catalog from ~20 tables to 2-3 while keeping the public surface byte-identical.

1. New shape: `role_definitions` (all per-aspect data as typed JSON columns) + activation state (+ catalog version digest). Charter rendering becomes a pure function over the definition row — no render-time joins.
2. Migration is DROP + RESEED: the bundled constant is the source of truth, there is no user-authored data to preserve. The migration must still run inside the existing store-migration machinery (versioned, manifest-listed, transactional) and reseed deterministically from `BUNDLED_ROLE_PROFILE`.
3. Public API unchanged: `requireActiveRoleCatalog`, `requireExecutionProfileModelEvidence`, role system check, and the CLI `role` surface keep their signatures and output shape — prove with the existing tests running unmodified against the new schema (only fixture setup may change, never assertions).
4. Receipts for role bootstrap/projection fold into the single `receipts` table IF the receipts-unification packet landed first; otherwise keep the minimal receipt rows this packet needs and leave folding to that packet (explicit dependency at registration time decides).
5. Resolve the fate of `ROLE-CONFIG-001` (blocked packet touching this territory) before or within this packet: re-scope it onto the new shape or drop it with a tombstone note.
6. Delete the dead code: aspect seeders, per-aspect table modules, the capacity evaluator if nothing consumes it. Expected ~2.000 LOC removed — measure the delta in the evidence.

## RED test (write first)

In `src/roles/catalog-collapse.test.ts` add a test named exactly: `role catalog collapses to definition rows with identical public output`. Migrate a fixture store, then assert: (a) role-related table count is at most 3; (b) `requireActiveRoleCatalog` returns a catalog whose digest equals the bundled profile digest; (c) the rendered charter for each bundled role equals the pre-collapse golden string (capture goldens from current main first). Today it fails because the collapsed schema does not exist.
Expected failure cause (literal string in the output): the test name `role catalog collapses to definition rows with identical public output`.

## Mechanism necessity (ENTRY-013)

Removes tables and concepts; adds none. The store's existing migration machinery carries the change; the bundled constant remains the single source. No new module, no new verb, no new config.

## Stop conditions

1. Role-related tables ≤ 3 (`grep` the schema constants for the old table names returns zero live references).
2. The named tests above exist and pass against the built output; existing role/gateway tests pass with assertions unmodified.
3. Net LOC delta for `src/roles/` is negative by ~2.000 (report before/after counts).
4. `npm run verify` passes all four components; debt baselines do not increase.

## Evidence

- The RED test failing before, passing after (literal output).
- Migration log + post-migration table list.
- Before/after LOC and file counts for `src/roles/`.
- ROLE-CONFIG-001 resolution (re-scoped packet id or tombstone note).
- Verify manifest digest.
