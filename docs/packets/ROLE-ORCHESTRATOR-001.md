---
id: ROLE-ORCHESTRATOR-001
title: orchestrator role charter from 2026-07-08 battle-tested facts
depends_on: []
write_set: ["content/roles/orchestrator.md"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

﻿## Task
Write content/roles/orchestrator.md - the fifth role charter. It MUST follow the exact format of the existing charters: read content/roles/format.md and content/roles/reviewer.md first and mirror their structure (format contract line, Mission, Board column, Read first, Steps table with |#|Type|Do|Expected|On mismatch|, Output fixed structure, Stop conditions/Prohibitions). Type every step EXEC or JUDGMENT per format.md.

Charter facts (all battle-tested 2026-07-08 - structure them, do not invent new rules):
- Mission: manage the board and dispatch workers; NEVER implements, never reviews, never merges. The human's single interface.
- Board column: none - operates ACROSS columns, dispatching ready packets and relaying results.
- Read first: format.md, this charter, content/dispatch/worker.md, content/dispatch/adapters.md, task list output.
- EXEC steps to structure: (1) poll board with task list; report to human in <=3 lines. (2) For each ready packet: pick harness+model per adapters.md routing and the project matrix; instantiate the worker template (single source: docs dispatch/worker) with PACKET_ID/WORKDIR; long prompts travel as attached FILE, never inline args; positional message BEFORE array flags. (3) Every dispatch arms TWO monitors: board state AND live transcript tail (founder requirement: real data all the time - the same data the agent's own CLI shows). (4) Boot timeout: no sign of life in 120s means kill + diagnose + retry once with a fix; never wait unbounded (PRINCIPLE-010). (5) Monitor hygiene: one monitor per purpose; kill any monitor a better one supersedes. (6) Worker reports done: verify the PR exists yourself (gh pr view); relay to reviewer. Worker blocks: task show, relay the literal blocker + one-line diagnosis; never fix it yourself. (7) opencode backend recipe: serve once, POST /session, POST prompt_async, GET message for live view, POST abort to kill. (8) Record every dispatch as a task note: harness, model, session id.
- JUDGMENT steps: choosing harness/model when the matrix is silent; deciding a retry vs escalation to human.
- Prohibitions: implementing, reviewing own dispatches, editing packets/statuses by hand, dispatching two workers onto overlapping write_sets (the gate refuses ready, but never try), waiting without timeout.

## RED check (content packet - replaces the unit-test RED)
Before writing: run `ls content/roles/` and confirm orchestrator.md is ABSENT (that is RED). After writing: it exists and npm run verify stays green.
Expected failure cause (literal string): "orchestrator.md ABSENT"

## Reuse
content/roles/format.md, content/roles/reviewer.md, content/dispatch/worker.md, content/dispatch/adapters.md.

## Stop conditions
Anything outside the write_set; inventing rules not in the facts above.

## Evidence required at close
verify-root, final-sha.
