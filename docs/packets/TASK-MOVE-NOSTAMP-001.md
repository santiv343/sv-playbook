---
id: TASK-MOVE-NOSTAMP-001
title: task move deja de estampar estado en el .md (estado solo en DB; dos planos limpios)
depends_on: []
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Keep the two planes clean: STATE belongs only in the SQLite DB, never in the packet `.md`. Today `task move` to a terminal state appends a state stamp (a `closed: <status> <ISO>` line) to the packet's markdown file. That (a) leaks mutable state into the definition file (the `.md` is the SoT of the DEFINITION only), and (b) produces an uncommittable working-tree change on protected `main`.

Remove the stamping entirely. `task move` must mutate ONLY the DB (status row + transition event + lease release as today) and must NEVER write to the packet `.md`. Find the stamp writer (grep the codebase for `closed:` and the writeFileSync in the move/close path in src/tasks/service.ts) and delete it. No other behavior changes: transitions, events, evidence capture and lease handling all stay exactly as they are.

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "moving a packet to a terminal state does not modify its markdown file". Create a packet, read its `.md` bytes, move it through to `done` (or `dropped`), then assert the `.md` bytes are byte-for-byte identical. Today the stamp is appended → the bytes differ → it FAILS.
Expected failure cause (literal string in the output): the test name "moving a packet to a terminal state does not modify its markdown file".

## Reuse
Existing move/transition logic in src/tasks/service.ts; existing test helpers.

## Stop conditions
Changing any DB-side transition/event/lease behavior; touching files outside the write_set; leaving any other path that writes state into a packet `.md`.

## Evidence required at close
red-test-output, verify-root, final-sha.
