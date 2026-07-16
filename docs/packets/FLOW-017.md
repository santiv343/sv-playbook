<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-017
title: promotion: close path for already-integrated work
depends_on: []
write_set: ["src/review/**","src/promotion/**","src/roles/bundled-input-policies.ts","src/db/store.constants.ts","src/db/store.migrations.ts","src/db/store.migration-manifest.constants.ts","src/db/promotion.migrations.ts","src/db/promotion-receipt-integration.migrations.test.ts","src/db/schema-vocabulary.constants.ts","src/db/semantic-role-contract.migrations.ts","src/db/work-definition.migrations.ts","src/db/store.ts","src/redteam/**","src/tasks/review-transition.ts","src/tasks/service.types.ts","src/cli/commands/task.ts","playbook.config.json","docs/packets/**"]
requirements: ["Assemble an immutable candidate for already-integrated work (empty diff certifies the SHA)","Persist the integration mode in the promotion receipt (guarded migration, legacy backfill)","Refuse promotion with typed TARGET_STALE when the target ref advances past the certified SHA"]
evidence_required: ["final-sha"]
---

## Problem

`done` is promotion-only (GATE-012) and promotion requires an immutable review candidate, but `assembleReviewCandidate` refuses with "candidate diff is empty" whenever the packet's work is already merged into the target branch. Every packet whose implementation lands outside the candidate flow — squash-merged PRs, bootstrap slices, another session's merged WIP — is stranded with no sanctioned path to `done`. Five packets are stranded today (BUG-015, DOCS-003, GATE-DEPS-001, STORE-005 blocked with finding notes; GATE-006 demoted to ready holding an unmergeable candidate), plus draft BUG-008 (same class, PR #116). The pre-promotion escape hatch (`task close --pr`) was removed; `dropped` mislabels implemented work. The class recurs with every squash merge — including the simplification program's own packets.

## Task

Give already-integrated work a first-class close path by extending the existing candidate/promotion machinery — no new command, no new table (ENTRY-013 justification below).

1. `src/review/review-candidate.ts` (`candidateContent`): when the diff against `baseReference` is empty (HEAD equals the merge base — nothing pending to integrate), do NOT throw. Assemble the candidate with `changedFiles: []`, `diff: ''`, `baseSha = HEAD`, and a new typed field `integration: 'already-integrated'` on the candidate value (non-empty diffs record `integration: 'pending-integration'`). Update the review-candidate contract schema so the field is an OPTIONAL enum; absence means `pending-integration` (back-compat with existing candidates — prove with a legacy-shaped validation test).
2. Promotion already integrates the identity case mechanically: `ensureIntegrationAttempt` accepts `beforeSha == candidate.baseSha` with `isAncestor(x, x)` true, and `fastForwardRef` (`git update-ref ref new old` with new == old) is a no-op success, so `integrationObservation` reports SUCCEEDED with `resultSha == candidateSha`. Prove this end-to-end instead of changing it; only touch `src/promotion/**` if the proof fails.
3. The promotion receipt must expose the integration mode so an auditor can distinguish "integrated a pending diff" from "certified already-integrated" without decoding the diff.
4. Echo: `task move <id> review` output names the integration mode (CLI-ECHO-001: mutating subcommands echo their result).

Safety invariants (must hold mechanically):
- An integrated candidate certifies only the exact SHA it binds: if the target ref advances after candidacy, promotion refuses with typed `TARGET_STALE` (existing check) — red-team it.
- Reviewer verdict still required and bound to the same SHA (existing `validateReviewerRun` unchanged).
- Clean verification still runs immediately before integration with HEAD == candidateSha (existing check unchanged).
- write_set enforcement unchanged (empty changedFiles is trivially within any write_set; non-empty diffs unchanged).

## RED test (write first)

In `src/review/review-candidate.test.ts` add a test named exactly: `review candidate is assembled for already-integrated work (empty diff)`. Set up a fixture repo (use `initTestRepo` from `src/testkit.ts`) where HEAD equals the merge base with the configured base reference, call `assembleReviewCandidate`, and assert it returns a candidate whose value has `integration === 'already-integrated'`, `changedFiles: []`, and `baseSha === HEAD`. Today it throws `candidate diff is empty` → FAILS.
Expected failure cause (literal string in the output): the test name `review candidate is assembled for already-integrated work (empty diff)`.

Additional required tests (after RED):
- End-to-end: integrated candidate + approved reviewer verdict → `PromotionController.promote` closes the task and the receipt records `already-integrated` (extend the existing promotion E2E fixture).
- Legacy candidate value without the `integration` field still validates against the contract.
- Red-team (`src/redteam/`): integrated candidate created, then the target ref advances → `promotion run` refuses with TARGET_STALE and the task is NOT closed.

## Mechanism necessity (ENTRY-013)

Existing mechanisms considered: (a) the normal candidate — refuses empty diffs BY DESIGN (its job is binding a pending diff; none exists here); (b) `dropped` — mislabels implemented work and loses the audit receipt; (c) `task close --pr` — removed when promotion became the only close path. No existing verb closes integrated work. This packet adds zero commands and zero tables: it extends the candidate contract with one optional field and reuses `PromotionController` unchanged.

## Stop conditions

1. The unconditional throw on empty diff in `candidateContent` no longer fires for the HEAD == merge-base case (`grep -n "candidate diff is empty" src/review/review-candidate.ts` shows no live throw path for that case).
2. The named tests above exist and pass against the built output (`npm run build` + `node --test` on the built files).
3. `npm run verify` passes all four components; debt baselines (duplicates/comparisons/ORM) do not increase.
4. `promotion list` output for an integrated promotion exposes the integration mode.

## Evidence

- The RED test failing before, passing after (literal output).
- E2E promotion receipt JSON for an integrated candidate (task closed, mode visible).
- Red-team TARGET_STALE refusal output.
- Verify manifest digest.
