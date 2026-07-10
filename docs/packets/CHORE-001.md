<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: CHORE-001
title: task list/show --json expose the full definition — agents stop reading generated .md because the CLI omits fields
depends_on: []
write_set: ["src/cli/commands/task.ts","src/cli/commands/task.test.ts","content/roles/**","content/dispatch/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Second occurrence of the same class in one day (the founder-interface's batch script AND the orchestrator both had to parse docs/packets/*.md): the CLI's JSON surfaces omit the packet DEFINITION — `task list --json` and `task show --json` return status but not write_set, depends_on, type, priority, evidence_required. Agents fall back to reading generated files because the sole interface is incomplete.
1. `task show <ID> --json` returns the COMPLETE packet: definition (title, type, priority, write_set, depends_on, requirements, evidence_required, body) + state (status, lease, notes, events refs) — one call, everything.
2. `task list --json` includes per packet: id, type, title, status, priority, write_set, depends_on (no body — list stays light).
3. Contract-tested against the schema layer (STORE-001) when it lands: parse-what-you-print.
4. Grep the content/ charters + adapters for any instruction telling agents to read docs/packets/*.md for definitions and fix them to use the CLI.

## RED test (write first)
In src/cli/commands/task.test.ts add a test named exactly: "task list and show json expose the full definition including write_set and depends_on". Create a packet with deps and write_set, assert list --json carries both fields and show --json additionally carries the body and evidence_required. Today they are omitted -> it FAILS.
Expected failure cause (literal string in the output): the test name "task list and show json expose the full definition including write_set and depends_on".

## Reuse
The list/show builders; the packet row schema; the status --json contract conventions.

## Stop conditions
A second serializer diverging from show's (one builder per shape); breaking existing json consumers (add fields, do not rename); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
