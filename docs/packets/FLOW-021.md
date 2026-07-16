<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-021
title: daemon owns observation loops (A1 phase 1)
depends_on: []
write_set: ["src/gateway/**","src/daemon/**","src/serve/**","src/cli/**","docs/packets/**"]
requirements: ["Long-lived loops run in short-lived CLI processes; compensation machinery exists only for placement"]
evidence_required: ["RED test failing then passing (observation survives CLI death)","re-attach scenario output","gateway LOC reduction"]
---

## Problem

All long-lived observation loops (run observation, duration ceilings, promotion recovery) live in `src/gateway/` (~5.000 LOC, 42 files) and execute inside the short-lived CLI process that invoked `dispatch start`; the daemon — the process that already owns the store, the token, and the only blessed write path — has no observation logic. Snapshot-by-poll, re-attach, and "CLI died → next start continues" recovery are placement compensation: extreme durability machinery exists because a short-lived process does long-lived work. The boundary bug classes (IDEA-065 orphan port, IDEA-068 libuv handle, resume mid-observation) all live in that compensation.

Design doc (authoritative for scope and acceptance): `docs/design/2026-07-16-a1-loops-al-daemon.md`. This packet implements PHASE 1 ONLY: observation loops move to the daemon. Duration ceiling and promotion recovery stay for their own phases per the doc.

## Task

1. The daemon owns run observation: when a run is dispatched (via the daemon's exec path), the observation loop registers with the daemon and keeps polling independently of any CLI process lifetime. The CLI's `dispatch start` becomes a thin client: it reports the run's current state from the daemon and exits when the run reaches terminal state if still attached — but attachment is optional.
2. Resume becomes the exception path: observation state lives in the store (daemon-local), so a CLI that dies mid-observation is replaced by ANY later `dispatch start --run <id>` (or none at all — the loop runs regardless). Delete the compensation machinery the doc marks as phase-1-removable (snapshot re-attach code paths), behind the doc's explicit list — nothing more.
3. Adapter contract unchanged: observation still polls the same adapters with the same cadence policy; only the owning process changes. OpenCode server interaction and role checks keep working through the existing gateway client, now invoked daemon-side.
4. The operations console (serve) shows daemon-owned observation state without schema drift: reuse the existing run-state projections.
5. `maxRunDurationMs` enforcement (IDEA-072) keeps working with the loop daemon-side — move the ceiling check with the loop, keeping the same config key.

## RED test (write first)

In `src/gateway/daemon-observation.test.ts` (or the design doc's named location) add a test named exactly: `observation survives CLI death`. Start a run against a fixture adapter whose terminal state arrives after N polls, kill the "CLI" side (drop the client context) after the first poll, then advance the fixture and assert the daemon-side loop drove the run to its terminal state and persisted the outcome — with no client re-attach. Today observation lives in the CLI process, so killing it stops observation → the run never reaches terminal → FAILS.
Expected failure cause (literal string in the output): the test name `observation survives CLI death`.

Additional acceptance (from the design doc, phase 1):
- Re-attaching a later `dispatch start --run <id>` to a daemon-observed run reports live state and terminal outcome.
- The deleted compensation paths listed in the doc no longer exist (`grep` evidence).

## Mechanism necessity (ENTRY-013)

Moves existing loops into the process that already exists for exactly this class of work (the daemon holds the store exclusively and outlives CLIs by design). Deletes machinery (re-attach, snapshot recovery) rather than adding any. No new process, no new port, no new table beyond what the doc specifies for observation state.

## Stop conditions

1. The named tests above exist and pass against the built output.
2. Killing a CLI mid-observation no longer stalls a run (the RED test proves it); re-attach works as a read-only view.
3. Gateway LOC is reduced by the deleted compensation paths (before/after counts in evidence).
4. `npm run verify` passes all four components; debt baselines do not increase.

## Evidence

- The RED test failing before, passing after (literal output).
- Re-attach scenario output.
- Before/after LOC counts for `src/gateway/`.
- Verify manifest digest.
