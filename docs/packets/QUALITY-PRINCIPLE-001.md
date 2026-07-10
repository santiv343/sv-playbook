<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: QUALITY-PRINCIPLE-001
title: principle: quality means durable root-cause rails, not local patches
depends_on: ["TASK-RUBRIC-001"]
write_set: ["content/principles.md","content/review.md","content/rubric.md","src/cli/commands/docs-content.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Add a core quality principle: the playbook optimizes for root-cause, durable system improvements, not local patches that only make the current incident go away.

Add a new principle to `content/principles.md`:

`PRINCIPLE-014 — Quality is the operating mode`

Definition:
- Agents must prefer the best durable design they can justify over the quickest local patch.
- A repeated correction from the founder is not a reminder; it is a missing rail, schema, gate, config, rubric entry, or task.
- If the CLI/process lacks a first-class path for required work, the answer is to add that path, not to normalize manual workaround habits.
- Reviews fail changes that solve only the observed symptom while leaving the same class of failure open.
- Speed and cost matter, but never by making ambiguity, hidden state, hand-authored generated artifacts, or unverifiable claims acceptable.

Update the reviewer guidance and universal rubric so every task inherits this bar. The reviewer should explicitly ask: "Did this change close the class of failure, or only the instance?"

## RED test (write first)
Add a docs/content test named exactly: "quality principle is present in principles review and rubric".

Assert:
- `content/principles.md` contains `PRINCIPLE-014`;
- `content/review.md` contains the class-of-failure review question;
- `content/rubric.md` includes root-cause/durable-design language.

Expected failure cause (literal string in the output): the test name "quality principle is present in principles review and rubric".

## Reuse
Existing docs-content tests; `TASK-RUBRIC-001`; reviewer checklist conventions; principles docs.

## Stop conditions
Adding motivational prose without review/test hooks; weakening speed/cost constraints into perfectionism; duplicating the principle in multiple authored places instead of referencing the principle ID; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
