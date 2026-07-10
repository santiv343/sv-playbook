<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-PIPELINE-001
title: transition gates as a pipeline of one-file modules — every future gate is write-set-disjoint and parallel-safe
depends_on: ["GATE-VERIFY-001","GATE-WRITESET-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts","src/tasks/gates/**","src/tasks/service.constants.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Break the #2 parallelism bottleneck: every transition gate edits movePacket in src/tasks/service.ts, so all gate packets' write_sets overlap and serialize (measured 2026-07-10: the GATE-* chain runs one at a time only because of this file). Turn transitions into a gate PIPELINE:
1. A gate contract: each gate is one module in src/tasks/gates/<name>.ts exporting { name, appliesTo: {from, to}, check(ctx) } — ctx carries the packet, store readouts, and the git helpers a gate needs.
2. movePacket calls the pipeline ONCE: run every registered gate matching the transition, in a deterministic order (a generated index like REGISTRY-AUTODISCOVER-001's — same convention, same generator ownership).
3. Migrate the EXISTING checks into gate modules (write-set conflict on ready, lease assertion, evidence capture on review, write-set diff, verify-green, merge-close hooks as applicable) with behavior identical — the test suite must stay green unchanged except for relocations.
4. A failing gate refuses the transition with its name + reason (the refusal format the CLI already uses).
Effect: every future gate (deps-at-start, language policy, wip limit, report-required...) is ONE new file — write-set-disjoint, parallel-safe.

## RED test (write first)
In a gates-pipeline test add a test named exactly: "movePacket runs registered gates for the transition and a failing gate blocks it by name". Register a fixture gate for ready->active that fails with a marker reason; assert the move is refused naming the gate, and that removing the fixture lets it pass. Today gates are inlined in movePacket -> it FAILS.
Expected failure cause (literal string in the output): the test name "movePacket runs registered gates for the transition and a failing gate blocks it by name".

## Reuse
movePacket + the existing inline checks (relocate, do not rewrite semantics); the generated-index convention from REGISTRY-AUTODISCOVER-001; the ALLOWED transition map in service.constants.ts (unchanged — the pipeline runs inside allowed transitions, it does not replace the state machine).

## Stop conditions
Changing any existing gate's semantics during the relocation; gate ordering that is not deterministic; a second gate-registration mechanism; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
