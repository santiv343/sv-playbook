<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-006
title: task import: sanctioned single-packet import so raw SQL never happens again
depends_on: []
write_set: ["src/cli/commands/task*","src/tasks/**","src/cli/commands/doctor*"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Incident 2026-07-10: SPRINT-002.md existed as a packet export but was never in the DB. The agent needed it in the DB, `task create` correctly refuses --id (TYPED-TASKS), and there was NO sanctioned single-packet import — so the agent inserted it via RAW SQL, violating PRINCIPLE-012 (todo pasa por la CLI). Every time the sanctioned path is missing, agents route around the rails; the fix is the path, not blame:
1. `task import <path|ID>` — import ONE existing packet .md into the DB: parses frontmatter with the same importer rebuild uses (single source — reuse importPackets' per-file logic, do not fork), validates the id matches a known TYPE prefix, refuses if the id already exists in the DB (amend is the path for that), lands as draft, evented as imported (distinct from created).
2. This is the ONLY sanctioned way a pre-existing .md enters the live DB outside rebuild. The refusal message of `task create --id` gains one line pointing at it: "existing packet file? use task import <path>".
3. Doctor check: packets present in docs/packets/ but absent from the DB are reported (drift readout) with the import hint — the SPRINT-002 situation becomes self-explaining instead of a dead end.
4. Red-team case: script the raw-SQL temptation scenario (packet file exists, not in DB) and assert the CLI path works end-to-end so the excuse never exists again.

## RED test (write first)
In a task-import test add a test named exactly: "an existing packet file can be imported into the DB through the CLI and never via SQL". Drop a fixture .md into the packets dir (not in DB), run task import, assert it lands as draft with an imported event and the export stays byte-identical; assert importing an id already in the DB is refused pointing at amend. New command -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `task import` export, OR the test name "an existing packet file can be imported into the DB through the CLI and never via SQL".

## Reuse
The rebuild importer's per-file parse (single source); TYPED-TASKS' prefix validation; doctor's readout builders; the events table.

## Stop conditions
A second frontmatter parser (must reuse the importer's); import silently overwriting an existing DB row; accepting ids with unknown type prefixes; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
