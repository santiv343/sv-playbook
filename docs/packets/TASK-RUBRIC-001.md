<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: TASK-RUBRIC-001
title: rubrica universal que TODA tarea hereda (obvio adyacente, no solo la letra) + learning loop: cada 'deberias haber tambien X' gradua a la rubrica
depends_on: []
write_set: ["content/rubric.md","src/tasks/service.ts","src/tasks/service.test.ts","content/dispatch/worker.md","content/roles/reviewer.md","content/roles/planner.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Kill the recurring gap: implementers do the LETTER of a packet (the minimum to pass the RED), not the SPIRIT, so the founder always has to add the "obvious adjacent" things afterward. Establish a UNIVERSAL acceptance rubric that EVERY packet inherits automatically, plus a learning loop so the founder's recurring additions graduate into it and are never asked twice.
1. A universal rubric `content/rubric.md`: the standing "obvious" requirements a thoughtful builder always considers, beyond the packet's specific body —
   - handle error paths + edge cases, not just the happy path;
   - apply the relevant principles (CLI-only, single-source, no-dead-ends, opinion-free) to THIS change;
   - surface adjacent concerns: what related thing does this touch or break? what is the obvious follow-on?;
   - no minimum-viable-letter-only: if the task obviously implies extras, do them or explicitly flag them;
   - proactively report what you did NOT do that a thoughtful builder would — so an omission is a stated decision, not a silent gap.
2. Inheritance (single source): `task brief` PREPENDS this rubric to every worker prompt, so every implementer gets it without it being rewritten per packet. The reviewer charter checks the diff against the rubric.
3. Learning loop: when the founder (or a reviewer) says "you should have also X", X is appended to the rubric (or the taste ledger) via the CLI, so it applies to ALL future tasks. The rubric GROWS; the founder stops repeating himself.
Opinion-free: a default rubric ships; each instance extends its own (the "obvious" bar is partly universal, partly per-team taste).

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "task brief prepends the universal acceptance rubric to every worker prompt". Assert that briefPacket output for any packet contains the rubric's marker text. Today brief has no rubric -> it FAILS.
Expected failure cause (literal string in the output): the test name "task brief prepends the universal acceptance rubric to every worker prompt".

## Reuse
briefPacket in src/tasks/service.ts (prepend the rubric, stable-prefix first for prompt caching); content/dispatch/worker.md; content/roles/reviewer.md + planner.md.

## Stop conditions
Rewriting the rubric per packet instead of inheriting one source; making it prose the agent may ignore instead of part of the assembled brief; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
