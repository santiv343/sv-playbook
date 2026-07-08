---
id: CLI-CONFIG-001
title: config module: playbook.config.json reader with defaults and validation
depends_on: []
write_set: ["src/config.ts","src/config.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Add the config module: src/config.ts reads playbook.config.json from a given repo root. Exported interface PlaybookConfig { productName: string; chatLanguage: string; tier: 'TIER-1' | 'TIER-2' | 'TIER-3'; verifyCommand: string; autonomy: 'strict' | 'standard' | 'high'; } and function loadConfig(repoRoot: string): PlaybookConfig. Missing file returns the documented defaults (productName: repo dir name is NOT available here - use 'unnamed'; chatLanguage 'en'; tier 'TIER-2'; verifyCommand 'npm run verify'; autonomy 'strict'). A present file with invalid JSON or an invalid enum value throws ConfigError (exported) naming the offending field. Unknown extra fields are ignored. Validate WITHOUT type assertions (use runtime narrowing; see src/db/rows.ts style). Pure module: NO CLI wiring, NO registry changes (a later packet wires it).

## RED test (write first, in src/config.test.ts)
Test name: "loadConfig returns defaults when the file is absent".
Call loadConfig on a mkdtemp empty dir; assert the five default values exactly.
Expected failure cause (literal string in the output): "Cannot find module"

Additional tests after green: valid file round-trip; invalid tier value throws ConfigError mentioning 'tier'; malformed JSON throws ConfigError.

## Reuse
src/db/rows.ts (narrowing style), node:fs readFileSync, node:path join.

## Stop conditions
Anything requiring files outside the write_set (especially src/cli/** - this packet has NO CLI surface); any gate failure you cannot fix inside it.

## Evidence required at close
red-test-output, verify-root, final-sha.

closed: done 2026-07-08T13:11:20.812Z