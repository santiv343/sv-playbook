<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: TASTE-INFER-001
title: inferir taste de ingenieria de un repo existente (lint/tsconfig/estructura/naming/tests) -> propuesta de taste-ledger (gradua IDEA-020)
depends_on: ["ADOPT-INVENTORY-FIX-001"]
write_set: ["src/adopt/taste-infer.ts","src/adopt/taste-infer.types.ts","src/adopt/taste-infer.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Infer engineering taste/conventions from an existing repo so the wizard can PROPOSE a taste-ledger draft the human just confirms, instead of asking from a blank page (graduates IDEA-020). `taste infer <root>` reads, READ-ONLY: the lint config (which rules/plugins are on), tsconfig strictness, the directory structure + naming patterns, the test framework + test-file conventions, and any formatting config; it produces a DRAFT engineering-taste proposal — a list of inferred conventions, each with a short statement + a confidence + the evidence it was inferred from. It writes nothing; the wizard/human confirms, and only then the constitution/taste is set via the CLI.

## RED test (write first)
In a taste-infer test add a test named exactly: "taste infer proposes conventions from an existing repo's lint and tsconfig". Point it at a fixture repo with a strict tsconfig and a couple of distinctive lint rules, and assert the proposal names those conventions. New feature -> the FIRST failure is the missing export.
Expected failure cause (literal string in the output): the compiler/module error for the missing `taste infer` export, OR the test name "taste infer proposes conventions from an existing repo's lint and tsconfig".

## Reuse
The inventory reader (ADOPT-INVENTORY-001 / its fix); node:fs; JSON parsing conventions.

## Stop conditions
Writing anything (proposal only); presenting low-confidence guesses as facts (attach confidence); touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
