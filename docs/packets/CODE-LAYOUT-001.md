---
id: CODE-LAYOUT-001
title: module layout gate: types/constants/errors files, logic modules stay pure (user directive)
depends_on: ["STORE-BACKUP-001"]
write_set: ["src/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Module layout rule (user directive, reverses an earlier planner decision): NO exported type/interface, NO exported constant, and NO error class may live in a logic module. Layout per module (same directory, same base name):
- <module>.types.ts - every exported type and interface
- <module>.constants.ts - every constant (values, SQL strings, maps like ALLOWED, TTLs, dir names, defaults)
- <module>.errors.ts - every error class
- <module>.ts - ONLY functions and classes with behavior
Two parts:
1. THE GATE (write first - this is the RED): new file src/layout.test.ts. It walks every src/**/*.ts file (skip *.test.ts, *.types.ts, *.constants.ts, *.errors.ts) with readdirSync recursive + readFileSync, and asserts per file: no line matches /^export (interface|type) / ; no line matches /^export const / ; no line matches /^export class \w+Error extends Error/ ; and no top-level const SQL-ish string (line matching /^const [A-Z_]+ = '(INSERT|SELECT|DELETE|UPDATE|CREATE)/). On violation, the assertion message lists file:line for every hit. Test name: "logic modules contain no exported types, constants or error classes".
2. THE REFACTOR: make it pass by extracting across ALL of src: tasks/service -> service.types.ts / service.constants.ts / service.errors.ts; db/store -> store.types.ts / store.constants.ts / store.errors.ts (SCHEMA, SVP_DIR, DB_FILE, SCHEMA_VERSION, StoreVersionError); config -> config.types.ts / config.constants.ts / config.errors.ts; packets/document -> document.types.ts / document.errors.ts (ID_RE to document.constants.ts); cli/command.ts (EXIT to cli/command.constants.ts, Io/Command to cli/command.types.ts). Update every import across src (imports are NOT limited by the no-export rules). Kill the half-applied PACKET_STATUS_DRAFT: replace with a single STATUS object - export const STATUS = { DRAFT: 'draft', READY: 'ready', ACTIVE: 'active', REVIEW: 'review', DONE: 'done', BLOCKED: 'blocked', DROPPED: 'dropped' } satisfies Record<string, PacketStatus> (satisfies is allowed; 'as' is not) - and use STATUS.X everywhere a status literal appears in logic code (ALLOWED map included). Zero behavior change: every existing test passes unmodified except import paths if a test imports moved symbols.

## RED test (write first)
The gate itself (part 1). Run npm test after writing ONLY src/layout.test.ts: it FAILS listing the current violations in service.ts, store.ts, config.ts, document.ts, command.ts.
Expected failure cause (literal string in the output): "logic modules contain no exported types, constants or error classes"

## Reuse
node:fs readdirSync({recursive:true}), existing test file conventions.

## Stop conditions
Anything outside the write_set; ANY behavior change (this is a pure move+rename refactor); weakening the gate patterns to pass.

## Evidence required at close
red-test-output, verify-root, final-sha.
