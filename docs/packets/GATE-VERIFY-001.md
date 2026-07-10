<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-VERIFY-001
title: gate: el CLI corre verify en move->review y rechaza si esta rojo (mata 'el agente dice que pasa')
depends_on: ["GATE-WRITESET-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts","src/config.ts","src/config.types.ts","src/config.constants.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Mechanize "don't submit for review unless green" — kill the class of "the agent says verify passed". On `task move <id> review`, the CLI itself runs the project's verifyCommand (from playbook.config.json) in the lease's worktree and REFUSES the transition if it exits non-zero, capturing the pass/fail + a short tail as evidence. The CLI does not trust the agent's word; it runs it. Config flag `enforceVerifyOnReview` (default true) so a project can opt out for a spike.

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "move to review is refused when the project verify command fails". Set up an active packet whose lease worktree has a verifyCommand that exits non-zero (a fixture command), attempt move->review, and assert it throws and the packet stays active. Today move->review never runs verify → it FAILS.
Expected failure cause (literal string in the output): the test name "move to review is refused when the project verify command fails".

## Reuse
loadConfig (verifyCommand, and add enforceVerifyOnReview) in src/config.ts; the execFileSync worktree pattern in captureEvidence; the evidence-event recorder.

## Stop conditions
Trusting a pasted verify result instead of running it; blocking indefinitely (use a timeout); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
