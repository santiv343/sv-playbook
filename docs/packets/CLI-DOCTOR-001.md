---
id: CLI-DOCTOR-001
title: doctor command: self-diagnosis with named recovery exits (IDEA-001)
depends_on: []
write_set: ["src/cli/commands/doctor.ts","src/cli/commands/doctor.test.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
IDEA-001 doctor command (self-diagnosis; agents self-serve when something is off). New top-level command `sv-playbook doctor` (src/cli/commands/doctor.ts as a factory function like the others, registered in src/cli/registry.ts). It checks and prints one line per check, `ok` or `FAIL <reason>`:
1. node version >= 22.13 (process.versions.node)
2. git available (execFileSync git --version)
3. inside a git repo (commonRoot resolves)
4. store opens and schema version matches (openStore try/catch; a StoreVersionError prints its recovery message as the reason)
5. stale leases count (leaseOf semantics over all leases; stale > 0 is a WARN line, not FAIL)
6. orphan worktree dirs: git worktree list entries whose packet (by branch name feature/<ID>) is done/dropped in the DB - WARN listing them
Exit 0 when no FAIL lines (WARNs allowed), 1 otherwise. Echo format: `doctor: <n> ok, <w> warnings, <f> failures`.

## RED test (write first, in src/cli/commands/doctor.test.ts)
Test name: "doctor reports ok checks and exits 0 in a healthy repo".
Body: inTempRepo pattern from task.test.ts (git init); run main(['doctor'], fakeIo); assert exit 0 and io.outLines joined contains 'node' and 'doctor:'.
Expected failure cause (literal string in the output): "doctor reports ok checks and exits 0 in a healthy repo"

## Reuse
src/cli/commands/describe.ts (factory+registry pattern), src/db/store.ts (openStore, StoreVersionError), src/tasks/service.ts (leaseOf), content/cli.md (add section, When/Why format).

## Stop conditions
Anything outside the write_set; auto-FIXING anything (doctor only diagnoses - PRINCIPLE-010 exits are named, not taken).

## Evidence required at close
red-test-output, verify-root, final-sha.
