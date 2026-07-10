<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: TASK-AREAS-001
title: task areas: mechanical area-to-write_set expansion for task creation and overlap planning
depends_on: ["TYPED-TASKS-001","TASK-CORE-AMEND-001"]
write_set: ["src/tasks/areas.ts","src/tasks/areas.types.ts","src/tasks/areas.test.ts","src/tasks/service.ts","src/tasks/service.types.ts","src/cli/commands/task.ts","src/cli/commands/task.test.ts","src/config.ts","src/config.types.ts","src/config.constants.ts","src/config.test.ts","content/roles/planner.md","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Make task blast radius declaration mechanical. Today a planner hand-writes `write_set` globs; the CLI can detect overlap once they exist, but it cannot help the task author choose the correct directories or make the declaration reusable. Add task areas: named, configured groups of globs that expand into `write_set`.

Implement a first-class task-area surface:
1. Add a single source of truth for areas:
   - built-in/default areas for sv-playbook, e.g. `config`, `db`, `tasks`, `cli`, `docs`, `roles`, `adopt`, `dispatch`, `status`;
   - per-instance extension in config/constitution once ROLE/OPERATING config lands.
2. Add `task create --area <area>` and `task amend --area <area>`:
   - each area expands to its configured globs and is stored in the packet definition;
   - explicit `--write` may add narrower extra globs, but broad manual globs should be rejected when an area exists;
   - generated markdown still writes the concrete `write_set`, so existing implementer/reviewer rails keep working.
3. Add a read-only command or subcommand to inspect area expansion, e.g. `task areas` or `sv-playbook areas list`, showing area -> globs.
4. Update planner/founder-interface guidance:
   - packet authors choose type + area before writing the task body;
   - write_set overlap and dispatch planning are computed from the concrete expanded globs;
   - if no existing area fits, the planner records that as a config gap instead of inventing a one-off broad glob.
5. `PACKET-AUTHORING-GATE-001` should validate that a packet either uses known areas or has a documented explicit write_set rationale.

## RED test (write first)
Add a task CLI/service test named exactly: "task create with area expands the configured write set".

Create a fixture area map containing `cli -> ["src/cli/**", "content/cli.md"]`. Run task creation with `--area cli`, then assert:
- the stored packet write_set contains those globs;
- the generated packet markdown contains those concrete globs;
- `task areas` (or the chosen read-only command) lists `cli`.

Expected failure cause (literal string in the output): the test name "task create with area expands the configured write set".

## Reuse
`createPacket`, `amendPacket`, packet document generation, config loading, existing write_set conflict check, `TYPED-TASKS-001` for typed task creation, `PACKET-AUTHORING-GATE-001` for validation.

## Stop conditions
Keeping area definitions in more than one authored place; replacing concrete write_set in packet exports (reviewer/worker gates still need concrete globs); silently accepting unknown areas; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
