<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: CONFIG-GATES-001
title: sacar umbrales de lint + regla de layout de eslint a config por-instancia (opinion, no invariante; misalignment de la auditoria)
depends_on: []
write_set: ["eslint.config.js","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","src/layout.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Lift the hardcoded engineering-taste gates out of eslint.config.js into per-instance config (PRINCIPLE-013 — a confirmed misalignment found by audit). These are OPINIONS, not invariants: max-lines (350), max-lines-per-function (60), complexity (10), sonarjs cognitive-complexity (10), and the module-LAYOUT rule (.types/.constants/.errors). A different team has a different bar.
1. Add a `gates` section to playbook.config.json (schema + validation): the thresholds above + a boolean for the layout rule; defaults = the current sv-playbook values.
2. eslint.config.js reads the thresholds FROM the resolved config (import/generate), not hardcoded literals — so an instance changes its bar in one source of truth.
3. The module-layout gate (src/layout.test.ts) becomes config-driven: on when `gates.layout` is true (default on for sv-playbook's instance), off otherwise — because the .types/.constants/.errors split is opinionated, not universal.
State-machine config is out of scope (that is IDEA-046, larger); this packet covers the lint/layout opinions only.

## RED test (write first)
In src/config.test.ts add a test named exactly: "gate thresholds and the layout rule come from config, not hardcoded". Assert loadConfig exposes a `gates` section with the default thresholds, that a custom `gates.maxLines` overrides the default, and that `gates.layout=false` disables the layout gate. Today gates are hardcoded in eslint/layout.test -> it FAILS.
Expected failure cause (literal string in the output): the test name "gate thresholds and the layout rule come from config, not hardcoded".

## Reuse
The config load/validate helpers in src/config.ts (positiveIntegerOr, booleanOr); eslint flat-config JS (it can import the resolved config); src/layout.test.ts.

## Stop conditions
Leaving any threshold or the layout rule hardcoded as the source; turning a universal invariant into config (only these taste gates move); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
