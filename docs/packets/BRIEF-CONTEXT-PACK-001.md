<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: BRIEF-CONTEXT-PACK-001
title: brief context pack: mechanically-extracted repo evidence (signatures, deps landed, prior decisions) in every worker brief
depends_on: ["TASK-RUBRIC-001"]
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts","src/tasks/context-pack.ts","src/tasks/context-pack.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Ground every worker brief in MECHANICALLY-extracted repository evidence, so implementers stop being "context blind" (the industry's top failure mode: agents in evolving repos hallucinate APIs and violate architecture because their context is stale or partial). The context comes from the system, never from what an agent remembers.
1. `task brief <ID>` appends a CONTEXT PACK generated at brief time: (a) for each write_set entry, the file's current exported signatures (or full content under a size cap); (b) the packet's depends_on packets' titles + what they landed; (c) relevant prior decisions: taste-ledger entries and principles whose scope matches the write_set paths (single source: the taste/constitution stores); (d) the current verify status of main.
2. Deterministic + cheap: no LLM calls, no embeddings — globs, exports parsing, and store lookups only. Stable ordering for prompt caching (rubric first, definition, then context pack).
3. The pack is labeled as generated evidence with its extraction timestamp, so a reviewer can see what the worker was actually told.
This completes the 6th spec element the audit found missing (prior decisions linked into the task's working context).

## RED test (write first)
In src/tasks/service.test.ts add a test named exactly: "task brief appends a generated context pack with write_set signatures and prior decisions". For a fixture packet whose write_set contains a module with a known export, assert the brief output contains the export's signature, the depends_on summary, and a matching taste/principle entry. Today brief has no context pack -> it FAILS.
Expected failure cause (literal string in the output): the test name "task brief appends a generated context pack with write_set signatures and prior decisions".

## Reuse
briefPacket + the rubric prepend (TASK-RUBRIC-001 — keep its stable prefix); the taste ledger store (TASTE-LEDGER-001) and constitution store (CONSTITUTION-001) as decision sources (degrade gracefully if not yet implemented: skip that section, do not fake it); glob matching helpers.

## Stop conditions
LLM/network calls inside brief; inventing context not extractable from the repo/stores; breaking the stable prompt-cache prefix ordering; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
