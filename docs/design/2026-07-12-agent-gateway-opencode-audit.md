# AgentGateway and OpenCode adapter audit

Date: 2026-07-12
Status: closed
Decision: `DEC-027`

## Human summary

The runtime now has one generic way to start, verify, dispatch, observe, reconcile, cancel, resume, collect results, and stop an agent backend. That generic contract contains no OpenCode endpoint, provider, model, operating system, database, or fixed duration.

OpenCode is a separate adapter. Its API routes, event behavior, local database isolation, configuration merge rules, version checks, and known failure modes do not leak into the engine.

## Durable artifacts

- Generic contract: `docs/design/contracts/gateway/agent-gateway.contract.json` v1.0.0.
- OpenCode adapter: `docs/design/contracts/adapters/opencode/opencode-adapter.contract.json` v1.0.0.
- Runtime state dependency: `docs/design/contracts/runtime/runtime-state.contract.json` v1.0.0.

## Decisions

- Runtime controller is the only source-of-truth writer and terminal authority.
- Gateway and adapters return typed observations and receipt proposals.
- Every launch or mutation requires a committed runtime intent first.
- Ambiguous prompt delivery is blocked and never automatically replayed.
- Backend observations never directly mean runtime success, failure, or cancellation.
- Timeouts and grace periods are resolved RunSpec configuration, not engine or adapter constants.
- Adapter capabilities exist only when their exact compatibility tuple passes conformance.
- Declared role output is validated and copied into runtime artifact storage; raw telemetry is not promoted.

## OpenCode measurements

The stable server surface was verified against the installed server. Official OpenCode documentation confirms the loopback server, Basic authentication, session/message routes, abort, status, and SSE event stream: [Server](https://opencode.ai/docs/server/).

OpenCode configuration sources merge rather than replace one another, and later sources have higher precedence: [Config](https://opencode.ai/docs/config/). Permission rules are ordered and the last matching rule wins: [Agents](https://opencode.ai/docs/agents/).

Measured results:

- Server health reported `1.17.18`; the wrapper reported `1.4.3`. Compatibility uses executable digest plus server/OpenAPI identity, never wrapper text alone.
- A normal session emitted live events and completed; idle sessions disappeared from the status map, so absence is not terminal evidence.
- Reusing the same OpenCode `messageID` returned `204`, concatenated prompt text, and started more assistant work. The adapter therefore treats `messageID` as correlation only.
- Abort returned acknowledgement and produced `MessageAbortedError`, but runtime cancellation still depends on owned-tree termination.
- Experimental `/api` durable-session routes were rejected: prompt admission did not execute work and wait returned `503`.
- A per-run `OPENCODE_DB` file started with zero sessions while existing authenticated providers remained available, and an isolated prompt completed. The adapter must prove this behavior for every enabled compatibility tuple and may never fall back to the shared session database.

OpenCode stores provider credentials and local data under its own data directory: [Providers](https://opencode.ai/docs/providers/), [Troubleshooting](https://opencode.ai/docs/troubleshooting/). sv-playbook does not copy credential values.

## Refutation

Early reviews were invalid because file attachments were truncated and reviewers claimed existing sections were missing. A read-only reviewer profile was added so the complete artifacts could be read in chunks with a context receipt.

The final full reads confirmed:

- Generic AgentGateway: 35 falsifiable scenarios, `PASS`, zero blockers.
- OpenCode adapter: 65 falsifiable scenarios, `PASS`, zero blockers.

## Next boundaries

- Privacy, redaction, access, retention, and deletion remain point 5.
- The security promise for local same-user processes remains point 6.
- This design does not enable dispatch by itself. Implementation must pass the conformance suite and issue a CompatibilityReceipt first.
