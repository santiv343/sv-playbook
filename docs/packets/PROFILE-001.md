<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: PROFILE-001
title: instance profile: one validated configuration surface per team
depends_on: ["CONSTITUTION-001","ROLE-CONFIG-001","OPERATING-MODEL-001","STORE-001"]
write_set: ["src/profile/**","src/config.ts","src/config.types.ts","src/config.constants.ts","src/cli/commands/profile.ts","src/cli/commands/profile.test.ts","content/cli.md","content/onboarding.md"]
requirements: []
evidence_required: ["final-sha"]
---

﻿## Task
Consolidate all per-team customization into a first-class Instance Profile. Teams adapt playbook through this profile; the engine remains opinion-free and carries only universal invariants.

Implement an `instance profile` surface:
1. Define the profile schema as the single source of truth for configurable dimensions:
   - product identity and languages;
   - tier/rigor;
   - operating model and entry role;
   - workflow profile (sprint/manual/full pipeline, state labels if configurable later);
   - roles and responsibility ownership;
   - allowed role mutations and duties;
   - gates and thresholds;
   - task types/id prefixes and task areas;
   - model/harness routing;
   - notification/escalation policy;
   - taste/constitution pointers.
2. CLI: `profile show [--json]`, `profile validate`, and `profile export` (generated review artifact). Do not make users hand-edit engine files.
3. Onboard/adopt writes or proposes this profile through CLI-backed commands. A team can accept defaults and still get a complete valid profile.
4. `check self`/`check profile` verifies that every declared configurable opinion has a profile source, and every profile value references existing roles/gates/task areas where applicable.
5. Existing config fields remain compatible; the profile may be composed from `playbook.config.json` + constitution/role stores at first, but callers read one profile builder.
6. Documentation must distinguish: engine invariants vs default agile profile vs team instance profile.

## RED test
Add a profile test named exactly: "profile show returns one validated view of roles workflow gates routing and notifications". Seed a fixture instance with config/roles/gates/routing/notification policy and assert `profile show --json` returns one parsed object; invalid role references fail `profile validate` naming the path.
Expected failure cause (literal string in the output): the compiler/module error for the missing `profile` command export, OR the test name "profile show returns one validated view of roles workflow gates routing and notifications".

## Reuse
`loadConfig`, CONSTITUTION-001, ROLE-CONFIG-001, OPERATING-MODEL-001, MODEL-ROUTING-001, TASK-AREAS-001, LANGUAGE-POLICY-001, SERVE-NOTIFICATIONS-001, STORE-001 schema layer.

## Stop conditions
Creating another parallel config source; hardcoding sv-playbook/Santi defaults as engine behavior; accepting invalid references; making teams edit generated exports; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
