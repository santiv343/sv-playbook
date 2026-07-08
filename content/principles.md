# Principles

## PRINCIPLE-001 — Determinism first

If something can be validated deterministically, it MUST be. Every rule is `[gate]` or justified `[criterion]`. Every agent claim is backed by literal command output. Every requirement (`REQ-xxx`) maps to at least one executable acceptance test, with ID traceability.

## PRINCIPLE-002 — Spec-driven above, test-driven below

The wizard → dossier → packets pipeline is SDD. Inside a packet, TDD with RED-first evidence (failing output committed before implementation) is the anti-hallucination gate. Test quality is a mandatory human-review item (anti "TDD theater").

## PRINCIPLE-003 — Nothing important lives only in a memory tool

Committed files are the source of truth. Memory systems (engram or others) are optional derived indexes; losing them loses nothing.

## PRINCIPLE-004 — One source, N mirrors

Canonical agent instructions are generated from one source; harness-specific files (CLAUDE.md, .cursorrules, etc.) are emitted mirrors. `check` fails on drift.

## PRINCIPLE-005 — Complexity budget is declared before code

Every project declares a tier in its foundation document. Architecture ambition beyond the tier is a gap, not a virtue.

## PRINCIPLE-006 — Stopping is success

An agent that halts with evidence at a stop condition is the system working. Scope-widening, fabricated green, and invented evidence are the failure modes the gates exist to prevent.

## PRINCIPLE-007 — Nothing dies without a tombstone

Projects freeze or die via checklist: clean worktrees, closed packets, a README tombstone (frozen date, state, revival pointer).

## PRINCIPLE-008 — The methodology is not a second product

Process tooling grows only when a real project demonstrates the need (the anti-sv-forge rule). v1 must be used on a real project before v2 work starts.
