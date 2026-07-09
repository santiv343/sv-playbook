---
id: TASK-CORE-DB-001
title: create escribe body+deps en la DB; brief/show leen de la DB (fallback .md pre-import)
depends_on: ["TASK-CORE-SCHEMA-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts","src/tasks/service.types.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Flip the packet DEFINITION authority to the DB. Today `task create` writes the body only to the `.md`, and `task brief`/`task show` `readFileSync` the `.md`. Change that:
1. `task create` writes the body into `packets.body` and the dependencies into `packet_deps` (in addition to still generating the `.md` for now — the export packet handles the `.md` later). The `write_set` column stays as-is.
2. `task brief` and `task show` read the body and deps FROM the DB. Backward-compat fallback: if `packets.body` is empty (a packet created before this change / not yet imported), fall back to reading the `.md` at `path`. This keeps the existing 24 packets working until `task import` backfills them.
After this, the DB is the source of the definition; the `.md` is a projection.

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "task brief reads the body from the DB, not the markdown file". Create a packet, then delete (or overwrite with garbage) its `.md`, and assert `briefPacket` still returns the real body — because it now comes from the DB. Today `briefPacket` reads the `.md` → with the file gone it throws/returns wrong → it FAILS.
Expected failure cause (literal string in the output): the test name "task brief reads the body from the DB, not the markdown file".

## Reuse
createPacket/briefPacket in src/tasks/service.ts; the document parser in src/packets/document.ts for the fallback; the new body/packet_deps columns from TASK-CORE-SCHEMA-001.

## Stop conditions
Making the `.md` authoritative again; dropping the fallback (existing packets must keep working pre-import); changing the `.md` generation format here (that is TASK-MD-EXPORT-001); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
