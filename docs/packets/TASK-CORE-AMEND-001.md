---
id: TASK-CORE-AMEND-001
title: task amend DB-autoral: edita la definicion en la DB y regenera el export — cierra IDEA-047
depends_on: ["TASK-CORE-DB-001"]
write_set: ["src/cli/commands/task.ts","src/tasks/service.ts","src/tasks/service.test.ts","src/packets/document.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
`task amend <id>` — the SINGLE CLI path to edit a packet DEFINITION after creation, DB-authoritative (replaces the withdrawn CLI-TASK-AMEND-001, which was written under the old `.md`-authoritative model; closes IDEA-047). Today the only post-create writes are status and notes, so fixing a wrong write_set/title/body/dep means hand-editing the `.md` or the DB — both bypass the CLI-single-author rule.

`task amend` updates the DB definition from flags, then regenerates the `.md` export:
- `--write <glob>...` replaces `write_set`; `--title <t>` sets title; `--body-file <path>` replaces `packets.body`; `--depends <id>...` replaces the `packet_deps` rows; `--req`/`--evidence` update those fields. Any omitted flag leaves that field unchanged.
- After updating the DB, regenerate the `.md` export (via the TASK-MD-EXPORT generator) so the file matches the DB. `updated_at` bumps; status/priority/created_at untouched.
- Reuse create's validation (non-empty write_set, id refs). REFUSE with a clear message if status is not `draft` or `ready` (a packet with committed work is frozen — require an explicit lifecycle move first). Refuse on unknown id.
Register it in the task subcommand dispatch (src/cli/commands/task.ts) and document it once in content/cli.md next to `create`.

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "amend updates the body and write_set in the DB and regenerates the export". Create a packet, `amend` its body (via a --body-file equivalent in the test helper) and its write_set, then assert BOTH the DB row (body + write_set) AND the regenerated `.md` export reflect the new values. Today there is no amend function → the FIRST failure is the missing export.
Expected failure cause (literal string in the output): the compiler/module error for the missing `amendPacket` export, OR the test name "amend updates the body and write_set in the DB and regenerates the export".

## Reuse
createPacket's validation in src/tasks/service.ts; the generator in src/packets/document.ts; the task subcommand dispatch pattern in src/cli/commands/task.ts.

## Stop conditions
Making the `.md` authoritative (the DB is); allowing amend on active/review/done/dropped; duplicating create validation; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
