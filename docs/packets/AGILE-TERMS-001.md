<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: AGILE-TERMS-001
title: standardize user-facing vocabulary on classic agile terms
depends_on: ["SPRINT-002","CHECK-001"]
write_set: ["content/**","docs/packets/**","docs/design/serve-mockup.html","src/cli/commands/check.ts","src/cli/commands/check.test.ts"]
requirements: []
evidence_required: ["final-sha"]
---

﻿## Task
Standardize user-facing terminology on classic agile words: sprint, retro, task, backlog, roadmap, review, done. Do not use `bet` as a primary product term. If the sprint semantics differ from calendar Scrum, explain the adaptation where needed; do not invent a parallel vocabulary.

Implement a terminology sweep and guard:
1. Replace active/future user-facing references to bet/bets/open bet/bet suggest/bet add with sprint/sprints/open sprint/sprint suggestion/sprint add in content docs, packet definitions, serve mockups, CLI guide, role charters, and planned API names.
2. Historical dropped/superseded packet text may keep old wording only if clearly marked as superseded; active dependencies must point to SPRINT-002.
3. Add a lightweight terminology check that flags new user-facing `bet` terminology outside an allowlist of historical/superseded files.
4. Update `SPRINT-002`, `SERVE-PLAN-001`, `PLAN-METRICS-001`, `FLOW-001`, `DISPATCH-PLAN-001`, and `CLI-START-001` wording/acceptance so the default command is open sprint, not open bet.
5. Keep agile terms configurable for other teams later through PROFILE-001/language policy, but sv-playbook's default profile uses classic agile terms.

## RED test
Add a docs/check test named exactly: "terminology check rejects new user-facing bet vocabulary outside superseded history". Seed a fixture content file with `bet add` and assert the check fails; seed a superseded historical file allowlist entry and assert it passes.
Expected failure cause (literal string in the output): the test name "terminology check rejects new user-facing bet vocabulary outside superseded history".

## Reuse
CHECK-001 check surface; LANGUAGE-POLICY-001; PROFILE-001; packet authoring gate; content topic traversal.

## Stop conditions
Leaving active commands/APIs named `bet`; blanket deleting historical context without a superseded marker; hardcoding one team's vocabulary as non-configurable engine invariant; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
