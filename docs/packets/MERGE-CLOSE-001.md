<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: MERGE-CLOSE-001
title: mecanizar merge->done: task close verifica PR MERGED antes de cerrar; doctor marca review-ya-mergeado (el bug de hoy)
depends_on: []
write_set: ["src/cli/commands/task.ts","src/cli/commands/doctor.ts","src/db/store.ts","src/db/store.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Mechanize merge -> done so the board can't drift from reality. Incident 2026-07-09: a reviewer merged 9 PRs but never ran the final `task move ... done`, leaving 9 packets stuck in `review` while their work was on main. The manual two-step (merge, then close) is the hole.
1. Add `task close <id> --pr <n>`: it verifies via `gh pr view <n> --json state` that the PR state is `MERGED`, and ONLY then moves the packet review->done (recording the merge as evidence). If not merged, it refuses. This makes "merged" and "done" a single atomic step the reviewer runs — they cannot diverge. Degrade gracefully if `gh` is absent (refuse with a clear message, do not fake).
2. Drift detection: `doctor` (and `status`) flag any packet in `review` whose recorded PR is already MERGED as a distinct non-ok line ("N review packet(s) already merged — run task close"), so a skipped close is visible immediately instead of silently rotting.

## RED test (write first)
In src/db/store.test.ts (or the doctor test file) add a test named exactly: "doctor flags a review packet whose PR is already merged". Set up a packet in `review` with a recorded merged-PR marker, run the doctor readout builder, and assert it reports a distinct drift flag rather than ok. Today no such check exists → it FAILS.
Expected failure cause (literal string in the output): the test name "doctor flags a review packet whose PR is already merged".

## Reuse
The gh invocation pattern (execFileSync 'gh', ...) already used elsewhere; the doctor/status readout builders; the move/transition path.

## Stop conditions
Faking merge verification when gh is absent; auto-closing without a verified MERGED state; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
