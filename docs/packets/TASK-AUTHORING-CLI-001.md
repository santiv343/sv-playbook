<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: TASK-AUTHORING-CLI-001
title: task authoring: structured CLI flow assembles packets without body files
depends_on: ["TASK-CORE-DB-001","TASK-MD-EXPORT-001","TASK-RUBRIC-001"]
write_set: ["src/cli/commands/task.ts","src/cli/commands/task.test.ts","src/tasks/service.ts","src/tasks/service.test.ts","src/packets/document.ts","src/packets/document.test.ts","content/cli.md","content/roles/planner.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Replace low-level packet authoring via temporary body files with a first-class structured CLI authoring flow.

Today `task create` is technically CLI-only, but it still requires the caller to pre-author a body file and pass `--body-file`. That is too low-level for founder-interface/planner work and encourages temporary markdown workarounds. Keep generated packet `.md` exports for review and git durability, but make the CLI the authoring surface.

Implement structured task authoring:
1. `task create` accepts structured section flags or stdin fields instead of requiring `--body-file`:
   - `--type` / generated ID once `TYPED-TASKS-001` lands;
   - `--title`;
   - `--area` once `TASK-AREAS-001` lands, or explicit `--write` until then;
   - `--depends`;
   - `--task`;
   - `--red-test`;
   - `--expected-failure`;
   - `--reuse`;
   - `--stop-condition`;
   - `--evidence`.
2. The CLI assembles the packet body from a single template. Repeated context such as process instructions, universal rubric, evidence duties, language policy, and role guidance is inherited by `task brief` or checks, not re-authored into every packet.
3. `--body-file` remains only as an escape hatch/import compatibility path, clearly documented as not the normal authoring workflow.
4. A dry-run mode prints the generated packet definition before writing.
5. The generated `.md` remains a read-only projection from DB state. No agent hand-authors packet exports.

This packet should compose with `TYPED-TASKS-001`, `TASK-AREAS-001`, `PACKET-AUTHORING-GATE-001`, and `LANGUAGE-POLICY-001`; do not duplicate their schemas. If they are not implemented yet, add narrow extension points without hardcoding future behavior.

## RED test (write first)
Add a CLI test named exactly: "task create assembles a packet from structured fields without a body file".

Run `task create` with structured flags and no `--body-file`, then assert:
- the DB packet body contains the generated sections in deterministic order;
- the generated markdown export matches the assembled body;
- the output names the created packet;
- omitting a required section fails with a specific missing-field error.

Expected failure cause (literal string in the output): the test name "task create assembles a packet from structured fields without a body file".

## Reuse
`createPacket`, `generatePacketDocument`, `task create` command parser, `TASK-RUBRIC-001` for inherited rubric, `PACKET-AUTHORING-GATE-001` for ready-time validation, `TYPED-TASKS-001` and `TASK-AREAS-001` as future composition points.

## Stop conditions
Removing generated `.md` exports; continuing to require `--body-file` for normal task creation; duplicating inherited process context inside every packet body; hardcoding language or area behavior that belongs to config; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
