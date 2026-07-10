<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: REGISTRY-AUTODISCOVER-001
title: append-free command registration: adding a command = one new file — unblocks parallel dispatch of every new-command packet
depends_on: []
write_set: ["src/cli/registry.ts","src/cli/registry.test.ts","src/cli/commands/**","src/layout.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Break the #1 parallelism bottleneck: src/cli/registry.ts is a hotspot every new-command packet must edit, so their write_sets all overlap and the conflict gate correctly serializes them (measured 2026-07-10: 6+ queued packets held by registry.ts alone). Make command registration append-free:
1. Commands self-describe: each src/cli/commands/<name>.ts exports a command descriptor (name, run, help) under a single conventional export.
2. The registry builds itself from a directory scan of src/cli/commands/ (static import via a generated index is fine — but the GENERATOR owns that file, no packet ever edits it by hand; regenerating is idempotent and happens in build/verify).
3. Adding a command = adding ONE new file. registry.ts (or its generated successor) leaves every future command packet's write_set.
4. Migrate the existing commands to the convention in this packet; the layout test enforces the descriptor export shape for files under src/cli/commands/.
5. Update the affected queued packets' write_sets is OUT of scope here (founder-interface amends them after this lands — note left on each).
Effect: every "new command" packet (serve, bet, decision, board, merge, metrics, digest...) becomes write-set-disjoint and can run in PARALLEL.

## RED test (write first)
In a registry test add a test named exactly: "the registry discovers commands from the commands directory without a hand-edited list". Add a fixture command file following the convention and assert the built registry includes it without any edit to a central list; assert a file missing the descriptor export fails the layout check. Today registry.ts is a hand-edited list -> it FAILS.
Expected failure cause (literal string in the output): the test name "the registry discovers commands from the commands directory without a hand-edited list".

## Reuse
The existing registry dispatch (keep its lookup contract); the layout test (src/layout.test.ts) for the descriptor convention; the generated-file banner convention (GENERATED — do not edit).

## Stop conditions
A runtime dynamic-require scan that breaks bundling/type-checking (generate a static index instead); leaving any command outside the convention; hand-edits to the generated index; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
