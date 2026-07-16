<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: FLOW-018
title: report: telemetry verb (usage + complexity) with repo-persisted snapshot
depends_on: []
write_set: ["src/report/**","src/cli/**","docs/research/complexity-snapshot.json","docs/packets/**"]
requirements: ["Cut rule No.1 and G5 need mechanical usage data"]
evidence_required: ["RED test failing then passing","report output against live store","read-only proof (store digest unchanged)"]
---

## Problem

There is no CLI verb to query the event log. Cut rule №1 ("a mechanism unused for N cycles is a deletion candidate") and G5 (telemetry-guided deletion) can only be answered today by reading SQLite directly, which violates PRINCIPLE-012 (agents never touch the store by hand). The complexity budget (root cause R4 of the simplification program) has no measurement either: LOC, store tables, concepts, and mechanisms grow invisibly, so reactive rules only ever add. Extends IDEA-059.

## Task

Add a read-only telemetry verb and a persisted complexity snapshot.

1. New CLI command `sv-playbook report` (new small module `src/report/`, wired in `src/cli/registry.ts`). Read-only by construction: it must persist zero events and perform no store writes — prove with a test that snapshots the store file hash before/after a `report` run.
2. `report usage`: per-mechanism usage from the event log — CLI command invocations, packet transitions by type/status path, and feature-level events — as a deterministic table (and `--json`).
3. `report complexity`: emits the four budget metrics — src LOC, store table count, concept count (glossary terms + event kinds + CLI commands), mechanism count — and diffs them against the previous committed snapshot. Growth without a packet that justifies it prints as a finding.
4. The snapshot lives IN THE REPO at `docs/research/complexity-snapshot.json` (tracked, auditable, diffable in PRs). `report complexity` only reads it; `report complexity --write` regenerates it (the only writing path, and it writes to the repo file, never to the store).
5. Seed the initial snapshot in this packet so the next packet's growth has something to diff against.

## RED test (write first)

In `src/cli/commands/report.test.ts` add a test named exactly: `report usage reads the event log without writing`. Build a fixture store (testkit) with known events, run the command, assert the per-mechanism counts in the output AND that the store file digest is unchanged. Today it fails with `Unknown command: report`.
Expected failure cause (literal string in the output): the test name `report usage reads the event log without writing`.

Additional required tests (after RED):
- `report complexity` prints the four metrics and the diff against a fixture snapshot (growth flagged, shrink/shrink-neutral clean).
- `--json` output parses and matches the table content.

## Mechanism necessity (ENTRY-013)

Existing mechanisms considered: (a) `status` — board/lease/event counts, no per-mechanism usage; (b) `doctor` — environment health, no usage data; (c) direct SQLite — forbidden to agents by PRINCIPLE-012. No existing verb answers "how much is mechanism X actually used", and G5/cut-rule №1 are unexecutable without one. This packet adds one command and zero tables.

## Stop conditions

1. `sv-playbook report usage` and `sv-playbook report complexity` run against the live store and print deterministic output.
2. The named tests above exist and pass against the built output.
3. `docs/research/complexity-snapshot.json` exists, is tracked, and regenerating it with `--write` on an unchanged tree produces a byte-identical file.
4. `npm run verify` passes all four components; debt baselines do not increase.

## Evidence

- The RED test failing before, passing after (literal output).
- `report usage` and `report complexity` output against the live store.
- Store-digest-unchanged proof from the read-only test.
- Verify manifest digest.
