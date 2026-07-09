---
id: TASK-IMPORT-001
title: task import: migra docs/packets/*.md existentes a la DB (body+deps) — gradua IDEA-002
depends_on: ["TASK-CORE-DB-001"]
write_set: ["src/cli/commands/import.ts","src/cli/commands/import.test.ts","src/cli/registry.ts","src/tasks/service.ts","src/tasks/service.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
`task import` — migrate existing packet definitions from `docs/packets/*.md` INTO the DB so nothing is lost now that the DB is the source (graduates IDEA-002; covers the 24 existing packets whose body lives only in the `.md`). For each `.md` under the packets dir: parse frontmatter + body with the existing document parser, then upsert into the DB — set `packets.body`, refresh `title`/`write_set`, and REPLACE that packet's `packet_deps` rows from the frontmatter `depends_on`. Idempotent: re-running yields the same state. Print a summary (`imported N, updated M`). Never create packets that do not already have a DB row unless the `.md` is a valid full definition (then create it).

## RED test (write first)
In src/cli/commands/import.test.ts add a test named exactly: "import loads a packet body and its deps from markdown into the DB". Write a fixture packet `.md` (frontmatter with a depends_on + a body), run import, and assert the DB row now has that body AND the `packet_deps` rows match the frontmatter. Today there is no import command → the FIRST failure is the missing command export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `import` command export in registry.ts, OR the test name "import loads a packet body and its deps from markdown into the DB".

## Reuse
The frontmatter+body parser in src/packets/document.ts; the DB write path from TASK-CORE-DB-001; the command registration pattern (registry.ts + any existing command).

## Stop conditions
Non-idempotent import (duplicating deps rows on re-run); overwriting DB status/priority (import touches DEFINITION only, never state); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
