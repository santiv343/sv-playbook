<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: GATE-002
title: closed-world operations: bypass is impossible-or-detected, missing path means consult (PRINCIPLE-016)
depends_on: []
write_set: ["src/db/**","src/cli/commands/doctor*","src/redteam/**","content/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Founder ruling (2026-07-10, verbatim): "no puede bypassear la CLI ni las cosas que nosotros determinamos. es cerrado, si no existe, no lo hace... lo consulta." The SPRINT-002 raw-SQL incident shows the failure mode: when the sanctioned path is missing, agents improvise around the rails. FLOW-006 adds that one path; this packet closes the CLASS — make the closed world a stated principle AND mechanically detectable:
1. PRINCIPLE-016 (closed-world operations) in the constitution via CLI: an agent may only act through the CLI's sanctioned commands. A missing path is NOT permission to improvise — it is a mandatory consult: record the blocker (`decision request <summary>` via DECISION-LOG, or task note + blocked state) and STOP that action. Detected bypass = incident (composes with PRINCIPLE-015: honesty; the bypass is treated as a lie to the system).
2. TAMPER EVIDENCE (the mechanical part — the principle must be verifiable, not trusted): after every mutating CLI command, the CLI writes a store fingerprint (cheap: max(event id) + row counts per table + a content hash of the last event) into a ledger table. On every CLI start, doctor, and status, the previous fingerprint is recomputed and compared: a mismatch means a foreign writer touched the store outside the CLI — reported LOUDLY as an incident event with the delta (which tables changed). No cryptography needed; this is drift detection, not security against a determined attacker.
3. Charter/rubric wiring: every role charter gains the closed-world clause (missing path -> consult, never improvise); the rubric marks any PR/report that admits an out-of-CLI action as an automatic incident.
4. Red-team case (RAIL-REDTEAM-001 suite): script a foreign SQL write between two CLI commands and assert the next CLI invocation detects and events the tamper naming the changed table.

## RED test (write first)
In a tamper-evidence test add a test named exactly: "a foreign write to the store between CLI commands is detected and evented as an incident". Run a mutating CLI command on a fixture store, write a row via a raw sqlite connection, run the next CLI command and assert the tamper event exists naming the changed table. Today no fingerprint ledger exists -> it FAILS.
Expected failure cause (literal string in the output): the test name "a foreign write to the store between CLI commands is detected and evented as an incident".

## Reuse
DECISION-LOG-001 (merged) for the consult path; the events table; the constitution CLI (CONSTITUTION-001, merged) for PRINCIPLE-016; RAIL-REDTEAM-001 suite; the store open/close lifecycle for the fingerprint hooks.

## Stop conditions
Cryptographic overkill (this is drift detection); a fingerprint so expensive it slows every command (must be O(1)-ish queries); blocking CLI operation on tamper detection (report loudly, never brick the store — the recovery lesson); a second incident mechanism apart from the events table; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
