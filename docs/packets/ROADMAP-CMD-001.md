<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ROADMAP-CMD-001
title: (v2) roadmap como artefacto de primera clase: milestones->sprints->packets, progreso via CLI/serve (CLI-managed)
depends_on: ["SPRINT-001"]
write_set: ["src/cli/commands/roadmap.ts","src/roadmap/**","src/cli/registry.ts","src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
(v2) Roadmap as a first-class artifact — a project tracks its own phases/milestones -> sprints -> packets and sees progress, instead of a hand-maintained markdown. `roadmap show [--json]` reads a roadmap definition (milestones, each with a goal and its sprints/packets) plus the live board, and renders each milestone's progress (done/total, blocked, current sprint). `roadmap add-milestone`/`link` to build it via the CLI (never hand-edited). serve renders it. Opinion-free (PRINCIPLE-013): the roadmap's shape is per-instance config; the engine provides the capability + the default that there is none.

## RED test (write first)
In a roadmap test add a test named exactly: "roadmap show reports per-milestone progress from linked packets". Create a milestone, link two packets (one done), run roadmap show, assert it reports 1/2 done for that milestone. New feature -> missing export.
Expected failure cause (literal string in the output): the compiler/module error for the missing `roadmap` export, OR the test name "roadmap show reports per-milestone progress from linked packets".

## Reuse
The sprints from SPRINT-001; the status/board readouts; the store/migration path.

## Stop conditions
A hand-edited roadmap file as the source (it is CLI-managed); making a roadmap mandatory; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
