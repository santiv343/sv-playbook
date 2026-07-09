---
id: TASK-MD-EXPORT-001
title: el .md pasa a export generado read-only (definicion, sin estado); move nunca lo toca (subsume NOSTAMP)
depends_on: ["TASK-CORE-DB-001"]
write_set: ["src/packets/document.ts","src/packets/document.test.ts","src/tasks/service.ts","src/tasks/service.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
With the DB now the source of the definition, the `.md` becomes a GENERATED read-only DEFINITION export — never authored, never holding state. (This subsumes and replaces the deferred TASK-MOVE-NOSTAMP-001.)
1. `task create` and `task amend` regenerate the `.md` from the DB definition (title, body, write_set, deps) with a top banner line: `<!-- GENERATED FROM THE BOARD — do not edit; use \`task amend\` -->`.
2. The export contains DEFINITION ONLY — no status, no leases, no events, no `closed:` stamp.
3. `task move` MUST NOT touch the `.md` at all. Because status is no longer in the export, moving a packet never regenerates or stamps the file. Delete the old terminal-state stamp writer entirely.

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "moving a packet never modifies its generated markdown export". Create a packet, read its `.md` bytes, move it through to `done`, then assert the `.md` bytes are byte-for-byte identical AND that the file contains the GENERATED banner and no `closed:`/status line. Today `task move` appends a `closed:` stamp → the bytes differ → it FAILS.
Expected failure cause (literal string in the output): the test name "moving a packet never modifies its generated markdown export".

## Reuse
generatePacketDocument in src/packets/document.ts (extend it to emit the banner and read from the DB definition); the move/transition path in src/tasks/service.ts (remove the stamp writer there).

## Stop conditions
Putting any mutable state (status/lease/event) into the export; letting `task move` write to the `.md`; hand-authoring instead of generating; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
