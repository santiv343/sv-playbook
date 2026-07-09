<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: INSTRUCTIONS-MIRROR-001
title: agent-agnostic: generar cold-start + mirrors por-harness desde UNA fuente (PRINCIPLE-004)
depends_on: []
write_set: ["src/cli/commands/instructions.ts","src/cli/commands/instructions.test.ts","src/cli/registry.ts","content/instructions/**","AGENTS.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Make the playbook truly agent-agnostic (PRINCIPLE-004: one source, N mirrors). Today AGENTS.md is hand-written and there is no cold-start file for any other harness — a codex/opencode/kimi agent gets no instructions. Generate the harness instruction files from ONE source so every harness's agent gets the same cold-start.
Add `sv-playbook instructions [--write]`: it renders, from a SINGLE source (the playbook's content/ cold-start template + playbook.config.json values like productName/tier/verifyCommand), the canonical cold-start and its per-harness mirrors — at minimum AGENTS.md (generic) and the Claude/opencode/codex equivalents (e.g. CLAUDE.md and a documented path per harness). `--write` writes them; without it, prints what would change. The source is authoritative; the mirrors are generated, never hand-edited (banner: "GENERATED — edit the source, run instructions"). Pairs with CHECK-001's `check instructions` drift gate.

## RED test (write first)
In src/cli/commands/instructions.test.ts add a test named exactly: "instructions renders the cold-start mirrors from a single source". Run the renderer against a fixture config and assert it produces the AGENTS.md content AND at least one harness mirror, both containing the config's productName. New command → the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `instructions` command export, OR the test name "instructions renders the cold-start mirrors from a single source".

## Reuse
content/ templates; config load in src/config.ts; command registration pattern; the document generator conventions.

## Stop conditions
Hand-authoring a mirror instead of generating it; more than one authored source for the same instruction fact; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
