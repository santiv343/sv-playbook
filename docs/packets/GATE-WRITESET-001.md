<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-WRITESET-001
title: gate: rechazar move->review si el diff del worker toca archivos fuera de su write_set (scope-creep imposible)
depends_on: []
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Mechanize "stay in your write_set" — today only OTHER-packet conflicts are checked (at move-to-ready); nothing verifies the worker's own diff stayed inside its declared blast radius, so scope-creep relies on worker discipline + the reviewer catching it. Make it a hard gate on `task move <id> review`: in the lease's worktree, compute the changed files of the branch (`git diff --name-only <merge-base with default branch>...HEAD`), and REFUSE the transition if ANY changed file does not match the packet's write_set globs. The refusal lists every offending file. Now a worker physically cannot land review with out-of-scope edits.

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "move to review is refused when the branch changed a file outside the write_set". Set up an active packet with a write_set of ["src/a/**"] and a lease whose branch changed a file under src/b/, attempt move->review, and assert it throws naming the offending file. Today no such check exists → it FAILS.
Expected failure cause (literal string in the output): the test name "move to review is refused when the branch changed a file outside the write_set".

## Reuse
The glob matcher already used by checkWriteSetConflict; the execFileSync('git', ...) pattern in captureEvidence; the lease worktree lookup (leaseOf).

## Stop conditions
Checking only against other packets (that already exists); allowing an out-of-scope file through; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
