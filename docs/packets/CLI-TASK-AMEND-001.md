---
id: CLI-TASK-AMEND-001
title: task amend: único camino CLI para editar la definición de un packet (.md autoral, DB índice derivado) — cierra IDEA-047
depends_on: ["TASK-MOVE-NOSTAMP-001"]
write_set: ["src/cli/commands/task.ts","src/tasks/service.ts","src/tasks/service.test.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Add `task amend <id>` — the SINGLE CLI path to change a packet's DEFINITION after creation. Today the only post-create writes are status and notes, so fixing a planning mistake (a too-broad write_set, a wrong title, a missing dependency, a body typo) can only be done by hand-editing the `.md` or the DB — both bypass the CLI-single-author rule (this is the gap logged as IDEA-047).

MODEL — do NOT re-muddy the two planes. The packet `.md` is the SoT of the DEFINITION (frontmatter intent + body). The DB columns `title`/`write_set` are a DERIVED index for cross-worktree conflict queries, authored ONLY by the CLI from the `.md`. So `amend` works in this exact order:
1. Load the packet's current definition (parse its `.md` at the DB `path` via the existing document parser).
2. Apply the requested changes from flags: `--write <glob>...` (replaces write_set), `--title <t>`, `--depends <id>...`, `--req <REQ>...`, `--evidence <e>...`, `--body-file <path>` (replaces the body). Any flag omitted leaves that field unchanged.
3. Re-generate the `.md` with the same generator `task create` uses (generatePacketDocument) — so the file stays canonical.
4. Refresh the DERIVED DB columns (`title`, `write_set`, `updated_at`) to match. Everything else in the DB row (status, priority, created_at) is untouched.
Validation: reuse create's validation (non-empty write_set, valid id refs). REFUSE with a clear message if the packet's status is not `draft` or `ready` — a packet that is active/review/done/dropped has work committed against its definition and must not be silently rewritten (require an explicit lifecycle move first). Refuse on unknown id.

Register the command in the CLI (task subcommand dispatch in src/cli/commands/task.ts). Document it in content/cli.md under the task section (single source: describe amend once, next to create). This closes IDEA-047 — after this, nobody ever hand-edits a `.md` or the DB again.

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "amend rewrites the packet markdown and refreshes the DB write_set index". Create a packet with write_set ["src/a/**"], amend it to ["src/b/**"], then assert BOTH: the packet `.md` frontmatter now reads ["src/b/**"], AND the DB `write_set` column now reads ["src/b/**"]. Today there is no amend function/command, so the FIRST failure is the missing export.
Expected failure cause (literal string in the output): the compiler/module error for the missing `amendPacket`/amend export, OR the test name "amend rewrites the packet markdown and refreshes the DB write_set index".

## Reuse
generatePacketDocument + the frontmatter parser in src/packets/document.ts; createPacket's validation in src/tasks/service.ts; the task subcommand dispatch pattern in src/cli/commands/task.ts.

## Stop conditions
Making the DB the authoritative source of the definition (it is a derived index); allowing amend on active/review/done/dropped packets; duplicating the create validation instead of reusing it; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
