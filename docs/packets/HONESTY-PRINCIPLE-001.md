<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: HONESTY-PRINCIPLE-001
title: PRINCIPLE-015 backed-or-labeled: every claim references a mechanical source or is labeled belief — wired into every role charter; false claims = incident
depends_on: ["QUALITY-PRINCIPLE-001"]
write_set: ["content/principles.md","content/rubric.md","content/review.md","content/roles/**","src/cli/commands/docs-content.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-10, verbatim intent): honesty must be "100% the way to go for ALL agents, ALL roles. If agents lie to each other we are done." Today verify-not-trust exists as scattered practice (evidence capture, provenance in serve, reviewer discipline); make it a NAMED principle wired into every role, and make its violation a first-class incident.
Add `PRINCIPLE-015 — Claims are worthless; sources are everything` to content/principles.md:
- Every factual statement an agent makes to another agent (or to the human) is either (a) BACKED: it references a mechanical source — an evidence ID, an event, a git sha, a test run — or (b) LABELED: explicitly marked as the agent's unverified belief. There is no third category.
- No agent may present belief as fact: "tests pass" without the captured run is a violation, not a shortcut.
- Consumers (reviewer, orchestrator, founder-interface) must treat unbacked claims as UNKNOWN, never as true — charters updated accordingly.
- A DETECTED false claim (evidence contradicts the statement) is an incident: takeover of the packet + a rail packet for the class, recorded as an event. Not a scolding — a mechanical consequence.
Wire it in (single source, referenced by ID):
1. content/principles.md (the principle).
2. content/rubric.md (every brief inherits: back or label every claim in your report).
3. ALL role charters in content/roles/ (each role's verbatim duty: what it must back, what it must never accept unbacked).
4. content/review.md (reviewer question: "is every claim in the worker's report backed or labeled?").

## RED test (write first)
In src/cli/commands/docs-content.test.ts add a test named exactly: "principle-015 backed-or-labeled is present in principles rubric review and every role charter". Assert content/principles.md contains PRINCIPLE-015, and that rubric, review, and EVERY file under content/roles/ reference PRINCIPLE-015. Today it exists nowhere -> it FAILS.
Expected failure cause (literal string in the output): the test name "principle-015 backed-or-labeled is present in principles rubric review and every role charter".

## Reuse
The docs-content test patterns (QUALITY-PRINCIPLE-001's test lands in the same file — coordinate, don't duplicate); the principles/rubric/review single-source structure; the evidence + events machinery as the "mechanical source" vocabulary.

## Stop conditions
Motivational prose without the backed-or-labeled operational rule; duplicating the principle text across files instead of referencing PRINCIPLE-015; leaving any role charter without its verbatim duty; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
