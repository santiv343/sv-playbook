<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: DOGFOOD-CONSTITUTION-001
title: dogfood: migrar VISION/ROADMAP/FEATURES de sv-playbook a los stores CLI-managed (exports generados, no fuentes a mano)
depends_on: ["CONSTITUTION-001","ROADMAP-CMD-001"]
write_set: ["docs/VISION.md","docs/ROADMAP.md","docs/FEATURES.md"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

## Task
Dogfood the opinion-free / CLI-only principles on sv-playbook itself. During planning, docs/VISION.md, docs/ROADMAP.md and docs/FEATURES.md were HAND-WRITTEN as engine files — but a project's vision/roadmap/features are per-instance CONSTITUTION data (same error class as hand-editing a packet). Once CONSTITUTION-001 and ROADMAP-CMD-001 exist, migrate sv-playbook's OWN instance data into the CLI-managed stores:
1. Load the content of docs/VISION.md into sv-playbook's constitution (`constitution set vision` / `set product_definition` / `add-principle` for its declared principles) via the CLI.
2. Load docs/ROADMAP.md's milestones/phases into the roadmap store via the CLI.
3. Make docs/{VISION,ROADMAP,FEATURES}.md GENERATED read-only exports of those stores (banner "GENERATED — edit via the CLI"), not authored sources. FEATURES may be generated from the done packets + their problem-solved metadata.
After this, sv-playbook obeys its own rule: no instance opinion lives hand-written; everything is CLI-managed with a generated export. The engine keeps only universal invariants in content/principles.md.

## Gate (no RED unit test; dogfood/migration [criterion] packet)
Reviewer verifies: sv-playbook's constitution + roadmap are populated via the CLI (not hand-edited); the three docs carry the GENERATED banner and match their store; `verify` green.

## Stop conditions
Leaving an authored (non-generated) vision/roadmap/features as the source; hand-editing the stores instead of using the CLI; starting before CONSTITUTION-001 and ROADMAP-CMD-001 land.

## Evidence required at close
verify-root, final-sha.
