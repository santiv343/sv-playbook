# Runtime state and effect audit

Date: 2026-07-12
Status: closed
Decision: `DEC-026`
Contract: `docs/design/contracts/runtime/runtime-state.contract.json` v1.0.0

## Question

What durable facts must the local runtime own so that a crash, retry, timeout, cancellation, or provider handoff cannot invent completion, lose an external effect, or require an agent to reconstruct operational state from conversation?

## Boundary

The contract covers deterministic runtime state. It does not claim semantic correctness of agent work, adversarial isolation under the same OS user, or the AgentGateway transport contract. Those are separate review surfaces.

## Required properties

- One append-only SQLite writer, fenced so a stale controller cannot write after restart.
- Gap-free transactional ordering for non-recovery run facts; an independent recovery sequence.
- Intent persisted before an external effect starts.
- Raw provider evidence kept separate from the runtime verdict.
- At most one accepted success per stable effect key, enforced by the store.
- Success, failure, and cancellation require prior typed evidence.
- Silence starts cancellation; it never directly means failure.
- Retry or recovery exhaustion becomes visible blocked escalation, never inferred failure.
- Cancellation is irreversible and works both before and after process launch.
- Process ownership survives controller failure or closes the owned tree atomically.
- Recovery planning is bounded, deterministic from persisted inputs, and replay-idempotent.
- Workflow dependency failure follows an immutable configured policy.

## Refutation history

The first independent refutation found 16 blockers, including recovery mixed into lifecycle, timeout skipping cancellation, provider facts treated as runtime truth, acceptance scoped to attempts instead of effects, ambiguous ordering, unsafe PID identity, and unbounded recovery.

The corrected contract separated recovery, cancellation stages, provider observations, effect acceptance, artifact identity, workflow composition, and supervisor receipts. A second refutation then exposed four remaining contradictions:

1. Pre-launch cancellation could not satisfy an unconditional process-receipt invariant.
2. The shared sequence membership lists disagreed.
3. Recovery records were accidentally included in the run sequence claim.
4. Retry exhaustion was both a failed terminal and a blocked escalation.

It also exposed missing mechanical constraints for concurrent acceptance, operation-key derivation, dependency failure, repeated cancellation, controller fencing, and cross-entity batch ordering. Each was added as a store constraint, invariant, or falsifiable scenario rather than prose guidance.

## Verification

- Contract parses as JSON and is ASCII-only.
- Invariant IDs are unique: 29.
- Acceptance scenario IDs are unique: 46.
- Terminal failure cannot be produced by retry exhaustion, recovery exhaustion, inconclusive probes, or routing failure.
- Pre-launch and post-launch cancellation have separate mechanical evidence paths.
- Concurrent accepted effects, repeated cancellation, stale controllers, replayed recovery, and cross-entity ordering have explicit store constraints and tests.
- Final independent refutation: `PASS`, zero blockers.

## Residual limits

- AgentGateway must still prove stable provider observation identity, resume, abort, and process-tree behavior for OpenCode. That is gap 4.
- Privacy and retention rules must be fixed before raw provider payloads are journaled. That is gap 5.
- Same-user hostile processes remain outside the local v1 security promise. That is gap 6.
