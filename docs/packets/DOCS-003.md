<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: DOCS-003
title: migrate non-baselined packet definitions to the canonical authored structure
depends_on: ["CHECK-001"]
write_set: ["docs/packets/**","playbook.config.json"]
requirements: ["machine-first","no-placeholders","generated-projections"]
evidence_required: ["baseline-diff","before-after-structure-receipts","idempotency-digest","independent-review","semantic-mapping"]
tags: []
---

## Problem

The activated authored-structure check reports non-baselined packets that do not
conform to the required Task, RED test, Stop conditions and Evidence contract. This
debt kept `npm run verify` falsely green until BUG-017 composed the playbook checks.

## Task

Migrate every current non-baselined violation through the authoritative task amendment
capability, never by hand-editing generated packet exports.

1. Capture the exact initial `check structure` violation set and bind it to a digest.
2. For each packet, map existing semantic content into the canonical headings. Do not
   add empty headings or generic placeholder tests.
3. Every executable requirement gets a falsifiable RED fixture/test description. A
   genuinely non-executable criterion packet must use an explicitly registered packet
   class and its own mechanically validated acceptance schema; ordinary prose cannot
   waive RED evidence.
4. Preserve packet ids, dependencies, write sets, requirements, evidence and notes.
5. Regenerate exports from DB and prove a second migration run is a no-op.
6. Do not expand the historical baseline. Existing grandfathered violations remain
   visible and are handled by their own owners.

## RED test

The captured current violation set makes `check structure` fail. A fixture with an
empty inserted heading or a generic placeholder must remain invalid. After migration,
all captured non-baselined packet refs pass and an idempotent rerun changes nothing.

## Acceptance

- No current non-baselined packet is missing a required semantic section.
- No baseline fingerprint is added or broadened.
- DB definitions and generated exports have matching digests.
- Canonical verification consumes the green structure result.

## Stop conditions

- No direct edits to generated packet markdown.
- No empty headings, placeholder RED tests or silent requirement deletion.
- No status/dependency/write-set change unrelated to structural migration.

## Evidence

Provide before/after violation receipts, per-packet semantic mapping, idempotency digest,
baseline diff, generated-export parity and independent documentation/test-quality review.
