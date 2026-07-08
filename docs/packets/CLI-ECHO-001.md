---
id: CLI-ECHO-001
title: mutating task subcommands echo their result (silence caused two incidents)
depends_on: []
write_set: ["src/cli/commands/task.ts","src/cli/commands/task.test.ts","src/tasks/service.ts","src/tasks/service.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Every mutating task subcommand must ECHO its result on success - silence is ambiguous for agents and caused two real incidents (workers re-running start defensively or working in the wrong state). In src/cli/commands/task.ts, after each successful operation print exactly one line to stdout:
- create: `created <ID> (draft)`
- start: `started <ID>: ready -> active, lease acquired`  (idempotent retry prints `started <ID>: already held by this session`)
- move: `moved <ID>: <from> -> <to>`  (the service must expose the from-status; add a return value to movePacket: it returns the previous status as a string)
- note: `noted <ID>`
- takeover: keep printing the report as today, but prefix with `takeover <ID>: lease transferred`
Write_set includes src/tasks/service.ts ONLY for the movePacket return-type change (and its test); do not restructure anything else.

## RED test (write first, appended to src/cli/commands/task.test.ts)
Test name: "mutating subcommands echo their result".
Drive create then move to ready then start via taskCommand.run with fakeIo; assert io.outLines includes a line containing "created", a line containing "ready -> active", and after a second start call, a line containing "already held".
Expected failure cause (literal string in the output): "mutating subcommands echo their result"
(The test fails because the assertions find no such lines - the literal test NAME appears in the failing npm test output, which is what the check above matches.)

## Reuse
src/cli/commands/task.test.ts (fakeIo, inTempRepo), src/tasks/service.ts (movePacket).

## Stop conditions
Anything outside the write_set; changing any behavior other than adding echoes and the movePacket return value.

## Evidence required at close
red-test-output, verify-root, final-sha.

closed: done 2026-07-08T13:11:20.812Z