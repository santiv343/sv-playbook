<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: NOTE-PROMOTION-001
title: scope-changing task notes must be promoted to durable artifacts
depends_on: ["CHECK-001","TASK-CORE-AMEND-001","DECISION-LOG-001"]
write_set: ["src/cli/commands/check.ts","src/cli/commands/check.test.ts","src/cli/commands/task.ts","src/cli/commands/task.test.ts","src/tasks/service.ts","src/tasks/service.types.ts","content/cli.md","content/roles/planner.md"]
requirements: []
evidence_required: ["final-sha"]
---

﻿## Task
Close the meta gap: scope-changing notes are not durable enough. A `task note` is good for event history, but a PM directive, scope add, design ruling, bug discovery, or terminology change must be promoted into an authoritative artifact: packet body/frontmatter, a new packet, config, principle/rubric, or a decision record.

Implement:
1. Define durable-note classes by marker/prefix: `PM DIRECTIVE`, `PM SCOPE ADD`, `DESIGN RULING`, `FOUNDER RULING`, `INCIDENT`, `BUG`, `SUPERSEDED`, `TERMINOLOGY`. These markers indicate the note must not remain only a note.
2. `check notes` (and eventually `check self`) scans recent task notes/events and reports any durable-note marker without a linked promoted artifact.
3. Add a CLI path to resolve it, for example `task note promote <event-id> --amend <packet>` or `--creates <packet>` or `--decision <id>` or `--no-op-rationale <text>`. The resolution is evented.
4. `task brief` and `start` surface unresolved durable notes for the relevant packet/role so implementers do not miss PM changes.
5. Planner/founder-interface guidance: if the note changes acceptance, dependencies, terminology, priority, or user-facing behavior, amend the packet or create a new packet before dispatch.
6. Backfill current board markers as part of close: every recent PM SCOPE/DIRECTIVE/RULING note is either promoted or explicitly linked.

## RED test
Add a check/task test named exactly: "check notes flags a PM scope note that has not been promoted to a durable artifact". Create a task, add a note with `PM SCOPE ADD`, run `check notes`, assert it fails naming the note; mark it promoted to an amended packet or linked packet and assert the check passes.
Expected failure cause (literal string in the output): the test name "check notes flags a PM scope note that has not been promoted to a durable artifact".

## Reuse
The events table; task note command; task amend; DECISION-LOG-001; CHECK-SELF-001; packet authoring gate.

## Stop conditions
Leaving PM directives as notes-only; making the check depend on chat history; forcing every ordinary breadcrumb note through promotion; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
