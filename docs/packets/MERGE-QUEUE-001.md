<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: MERGE-QUEUE-001
title: merge queue: serialize merges, re-verify each branch rebased onto current main (kills semantic conflicts + cascade stalls)
depends_on: ["MERGE-CLOSE-001"]
write_set: ["src/merge/**","src/cli/commands/merge.ts","src/cli/commands/merge.test.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Kill the class of failure we lived twice and the industry confirms (parallel agents produce SEMANTIC conflicts git cannot see, and GitHub's auto-merge cascade stalls behind-branches): a mechanical merge queue.
1. `sv-playbook merge queue` — an ordered queue of review-approved packets awaiting merge. Order = dependency order first, then FIFO.
2. `merge next` processes the head: update/rebase the branch onto CURRENT main, re-run the FULL verify against the rebased result (this catches semantic conflicts: code that merges cleanly but breaks together), then merge (via gh) and fire the merge-close path (MERGE-CLOSE-001). On verify failure: the packet goes back to review with the failure captured as evidence — never merged red, never silently skipped.
3. One at a time, always: the queue serializes merges so main moves atomically and every merge was tested against the main it actually lands on. No more manual update-branch cascades.
4. Emit queue events (enqueued, rebased, verified, merged, bounced) for digest/serve.

## RED test (write first)
In a merge-queue test add a test named exactly: "merge next re-verifies the rebased branch and bounces it back to review on failure". Simulate a queued packet whose branch passes verify standalone but fails after rebase onto advanced main (fixture), run merge next, and assert it is NOT merged, moves back to review, and the failure is captured as evidence. New feature -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `merge` command export, OR the test name "merge next re-verifies the rebased branch and bounces it back to review on failure".

## Reuse
MERGE-CLOSE-001 (the close path — this queue feeds it); the verify runner; the evidence capture in movePacket; gh CLI conventions used elsewhere; the events table.

## Stop conditions
Merging without the post-rebase verify (the whole point); parallel merges; scraping PR state instead of recording queue events; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
