<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: STORE-001
title: runtime schema validation at every boundary: zero-dep validator, types inferred from schemas, parse-don't-cast, JSON.parse banned outside src/schema
depends_on: []
write_set: ["src/schema/**","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","src/db/store.ts","eslint.config.js"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-10): "validar todos los esquemas es indispensable — nada laxo". Compile-time is already maximal (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes, zero any). The gap is RUNTIME: 13 JSON.parse sites in production where external data enters CAST, not VALIDATED (config file, packet frontmatter on import/rebuild, JSON columns read from the DB, CLI --json inputs). Types lie at runtime; a bad row explodes far from its cause.
1. A zero-dep schema module (src/schema/): a tiny combinator validator (object/string/number/boolean/array/enum/optional/record) whose schemas are the SINGLE SOURCE — the static types are INFERRED from the schemas (s.Infer<typeof PacketSchema>), so type and validation cannot drift.
2. Define schemas for every boundary: playbook.config.json, packet frontmatter, each DB row shape (packets, deps, events, leases, and new tables as they land), event payloads, and the CLI's own --json output contracts (parse-what-you-print round-trip tests).
3. Parse, don't cast: every boundary goes through schema.parse -> typed value or a refusal naming the exact path and expected shape ("config.gates.maxLines: expected positive integer, got 'many'"). No raw JSON.parse outside src/schema.
4. Enforcement so it stays true: an eslint restriction (same mechanism as CLI-SOLE-INTERFACE-001) forbidding JSON.parse and type assertions on external data outside src/schema; migrate the 13 existing sites.
5. Red-team case (compose with RAIL-REDTEAM-001): corrupt a JSON column in a fixture store and assert the CLI refuses cleanly naming the field, instead of undefined behavior.

## RED test (write first)
In a schema test add a test named exactly: "config and store rows are schema-validated at the boundary and a corrupt field is refused by path". Load a fixture config with a wrong-typed field and assert the refusal names the exact path; read a fixture store row with a corrupted JSON column and assert the same. Today boundaries cast -> it FAILS.
Expected failure cause (literal string in the output): the test name "config and store rows are schema-validated at the boundary and a corrupt field is refused by path".

## Reuse
The config validation helpers in src/config.ts (absorb them into the schema layer, do not duplicate); the eslint no-restricted-syntax pattern from CLI-SOLE-INTERFACE-001; the store read paths.

## Stop conditions
Any runtime dependency (the validator is ours); schemas duplicated from hand-written interfaces (types must be inferred); leaving any JSON.parse outside src/schema; a validator so generic it validates nothing (every field gets a real constraint); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
