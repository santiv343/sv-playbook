<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-006
title: machine-authoritative contract conformance receipt
depends_on: ["FLOW-017"]
write_set: ["src/enforcement/**","src/cli/commands/enforce*","src/cli/registry.ts","src/cli/main.ts","src/cli/command.constants.ts","src/cli/commands/index.gen.ts","package.json","package-lock.json","docs/how-it-works.md","src/db/schema-vocabulary.constants.ts","src/roles/schema.constants.ts","src/orchestration/schema.constants.ts"]
requirements: ["machine-first","semantic-kernel"]
evidence_required: ["conformance-receipts","final-sha","independent-review","verify-receipt"]
tags: []
---

## Context

During DATA-GOVERNANCE contract work, the delivery orchestrator and reviewer twice reported a schema-validation PASS while the exact Ajv validation command exited 1. They also produced duplicate scenario reservations and inconsistent control counts. These are deterministic facts and must never depend on agent prose.

This is the bootstrap tracer slice for the machine-first principle. It does not implement the full runtime. It establishes one authoritative validation path that later workflows must consume.

## Task

Implement a provider-agnostic contract conformance gate exposed through the `sv-playbook` CLI.

The gate accepts explicit contract, JSON Schema, and profile paths. It must:

1. Parse all JSON inputs with typed failures.
2. Validate the profile against the supplied JSON Schema using a pinned in-process validator dependency, never `npx` or an agent-reported command result.
3. Validate the contract's `control_catalog` and `acceptance_scenarios` mechanically:
   - control IDs and scenario IDs are unique;
   - every scenario is referenced by at least one control;
   - every referenced scenario exists;
   - every control contains the required enforcement metadata declared by the contract's mechanization gate;
   - no agent or LLM is an enforcement owner.
4. Emit exactly one structured `ConformanceReceipt` to stdout. The receipt binds input paths, canonical input digests, validator/ruleset versions, counts, individual check results, terminal verdict, and failure codes.
5. Exit 0 only for `conformant`; exit non-zero for invalid input, schema failure, orphan/dangling/duplicate IDs, incomplete controls, or internal error.
6. Write no project or runtime state. The command is a pure read/validate/report operation.

Do not hardcode provider, harness, storage engine, operating system, project-local file names, control counts, scenario ranges, or the current privacy contract. Adapter/profile-specific values remain inputs.

## RED test

- A schema-invalid profile like the current `detector_coverage_note` mismatch produces non-zero exit, `nonconformant`, and a stable schema failure code.
- Duplicate scenario IDs produce non-zero exit and identify the duplicate IDs.
- Orphaned and dangling scenario references each produce non-zero exit with distinct typed failures.
- A control missing owner, enforcement point, deterministic outcome, failure code, receipt, or tests produces non-zero exit.
- An agent/LLM enforcement owner produces non-zero exit.
- A fully valid fixture produces exit 0 and a receipt whose canonical digests and counts are stable across repeated runs.
- Human-readable agent text saying PASS is never an accepted input or evidence source.

## Acceptance

- `npm run verify` passes.
- New focused tests exercise every RED case and the valid case.
- Running the new gate against `.tmp/data-governance.contract.json`, `.tmp/data-policy.schema.json`, and `.tmp/local-reviewable.data-policy.json` rejects the current invalid profile mechanically.
- The reviewer receives the runtime receipt and reviews semantic adequacy only; it does not recalculate or override deterministic results.
- CLI help/describe documentation identifies the command as read-only and machine-authoritative for its declared checks.

## Stop conditions

- Do not repair the privacy artifacts inside this packet; proving their current rejection is required evidence.
- Do not add dispatch, process supervision, promotion, sandbox, provider adapter, UI, notification, or persistence behavior.
- Do not broaden the write set without a typed capability-gap report to the delivery orchestrator.
- Do not claim the full runtime or general semantic correctness is solved by this gate.

## Evidence

- Final SHA.
- `npm run verify` receipt.
- Focused conformance-gate test receipt.
- One valid fixture receipt and one current-privacy rejection receipt.
- Independent reviewer verdict bound to the same final SHA and receipts.
