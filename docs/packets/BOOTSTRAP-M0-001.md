<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: BOOTSTRAP-M0-001
title: M0 bootstrap: establish first clean audited baseline
depends_on: []
write_set: [".codegraph/**",".opencode/**",".gitignore","AGENTS.md","CLAUDE.md","CONTEXT.md","bin/**","content/**","docs/**","eslint.config.js","package.json","package-lock.json","playbook.config.json","src/**","tsconfig.json"]
requirements: []
evidence_required: ["final-sha"]
---

## Task

Establish the first clean, auditable M0 baseline from the verified bootstrap workspace. Historical uncommitted changes predate deterministic candidate ownership and cannot be truthfully reassigned to their original tasks. Consolidate them once, exclude runtime and scratch state, and make every later change enter through the normal task, candidate, review, and promotion path.

Acceptance requires a dedicated branch, an exact versionable path inventory, a clean worktree after the candidate commit, canonical verification against that commit, an immutable review candidate, and independent reviewer judgment. The baseline must not claim per-task authorship for historical changes.

## RED test

The pre-existing dirty root and `workspace classify --json` report are the RED evidence: review dispatch cannot create a trustworthy candidate while hundreds of historical paths are uncommitted and multiply owned.

## Stop conditions

Stop if scratch/runtime state enters Git, canonical verification is not green, the committed path set differs from Git's non-ignored inventory, the candidate is not bound to the exact SHA, or any historical path is silently presented as having uniquely recoverable task ownership.

## Evidence

Require the workspace classification report, canonical verify receipt, final SHA, immutable review candidate, and independent reviewer report.
