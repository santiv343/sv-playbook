<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-011
title: terminal command result contract: no successful operation can be silent
depends_on: ["CLI-ECHO-001"]
write_set: ["src/runtime/command-result*","src/schema/command-result*","src/cli/main*","src/cli/command.types.ts","src/cli/registry*","src/daemon/**","src/serve/**","src/cli/commands/**","content/cli.md"]
requirements: ["machine-first","observable-by-construction","single-source-of-truth"]
evidence_required: ["missing-result-fixtures","registry-coverage-receipt","cross-surface-parity","verify-root","final-sha","independent-review"]
---

## Problem

`CLI-ECHO-001` fixed silent success only for task mutations. The shared `Command`
contract still returns a numeric exit code and permits `EXIT.OK` after emitting no
observable result. Each command can therefore reintroduce the same ambiguity, while
CLI, daemon forwarding and serve can disagree about whether an effect happened.

## Task

Make terminal command results a runtime invariant rather than a per-command convention.

1. Define a provider-, transport- and presentation-agnostic `CommandResult` contract.
   It identifies the operation, outcome (`changed | unchanged | rejected | failed`),
   stable result/failure code, affected resource refs, evidence refs and an immutable
   receipt id. Stateful effects bind the receipt to the committed event/transaction.
2. Commands return the typed result to the central runner. They do not decide how it is
   rendered. CLI human text, machine JSON, daemon forwarding and serve actions are
   adapters over the same result.
3. The central runner rejects a success with no result, more than one terminal result,
   an invalid result schema, or a result inconsistent with the exit class. Use stable
   failure codes resolved from the authoritative result catalog.
4. Idempotent success is explicit `unchanged`; it must never be represented by silence.
   A compound operation reports the primary commit and every secondary-effect outcome
   without falsely changing the primary result after commit.
5. Register each command's result contract in the command catalog. Adding a command
   without a valid result contract makes canonical verification fail.
6. Preserve concise human output, but always make the terminal state observable. In
   machine mode emit exactly one parseable terminal receipt. Persist stateful receipts
   and expose them in serve history without relying on captured prose.

## RED test

- A fixture command returns success without a `CommandResult`; central execution fails
  with `COMMAND_RESULT_MISSING`.
- A fixture emits/returns two terminal results; execution fails with
  `COMMAND_RESULT_MULTIPLE`.
- Exit/result disagreement and invalid schemas fail with distinct stable codes.
- An idempotent mutation returns `unchanged` with the same resource identity.
- The same result projected through CLI, daemon and serve retains semantic identity.
- Registry coverage fails for a newly discovered command lacking a result contract.

## Acceptance

- No registered command can complete silently on any supported surface.
- Deterministic consumers use typed results and receipts, never parse human prose.
- `CLI-ECHO-001` behavior remains as a human presentation adapter over the new result.
- Canonical verification, focused contract tests and cross-surface parity pass.

## Stop conditions

- No command-name switch in the central runner.
- No provider, harness, transport, storage engine or operating-system special case.
- No timestamp/PID as semantic identity and no stdout capture as effect authority.
- No duplicated result-code list across CLI, daemon and serve.

## Evidence

Provide missing/multiple/invalid result fixtures, registry coverage receipt,
idempotency receipt, cross-surface semantic-identity receipt, full verification,
final SHA and independent architecture review.
