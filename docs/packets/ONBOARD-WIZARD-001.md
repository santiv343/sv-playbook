<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: ONBOARD-WIZARD-001
title: wizard de onboarding agent-driven: inferir max del repo + entrevistar lo que no (con recomendaciones) -> escribir todo por CLI; charter + comando onboard
depends_on: ["CONSTITUTION-001","TASTE-INFER-001","ADOPT-SCAFFOLD-001"]
write_set: ["content/onboarding.md","src/cli/commands/onboard.ts","src/cli/commands/onboard.test.ts","src/cli/registry.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
The agent-driven onboarding wizard — the FIRST experience of a new user (a person tells their agent "download sv-playbook and initialize it in my repo"). It is NOT an interactive TUI; it is a PROTOCOL an agent follows, plus a thin command that feeds it. Two parts:
1. A CHARTER `content/onboarding.md` (servable via `docs onboarding`): the step-by-step agent protocol —
   (a) detect greenfield (empty) vs brownfield (existing content);
   (b) run inventory + gap; infer stack + product (from README/docs) + engineering taste (TASTE-INFER-001) + existing tasks (import candidates);
   (c) PRESENT the inferred picture to the human;
   (d) INTERVIEW for what cannot be inferred — vision, product definition, tier, taste confirmations/additions — each item OPTIONAL but strongly recommended, each with a concrete recommendation and a sensible default so a person who skips still gets a working setup;
   (e) only after the human approves the plan, WRITE everything via the CLI: `constitution set/add-principle`, config (tier/workflow), baseline (brownfield), remediation packets, generated instructions. Nothing hand-written; the human approves before any write.
2. A thin `onboard <root>` command that runs the read-only inference (inventory + gap + taste infer) and emits a structured ONBOARDING PLAN: the inferred facts, the recommended interview questions (with defaults/recommendations), and the exact CLI commands that would apply each answer — so the agent asks the human and applies via the CLI.
This ties together init/adopt/inventory/gap/constitution/taste-ledger/baseline into one experience.

## RED test (write first)
In an onboard test add a test named exactly: "onboard emits inferred facts and recommended interview questions for a repo". Run onboard against a fixture repo and assert the plan contains the inferred stack AND at least one recommended interview question with a default. New command -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `onboard` command export, OR the test name "onboard emits inferred facts and recommended interview questions for a repo".

## Reuse
inventoryRepo + analyzeGaps (adopt), taste infer (TASTE-INFER-001), the constitution + config + baseline writers, command registration.

## Stop conditions
An interactive TUI (it is an agent protocol + a command that emits a plan); writing to the repo before human approval; hand-writing constitution/config instead of CLI calls; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
