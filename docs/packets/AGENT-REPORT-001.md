<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: AGENT-REPORT-001
title: structured agent reports via CLI: evidence-validated, sha-checked, stored in DB — agent chat shrinks to brief in, report out, decisions
depends_on: ["TASK-CORE-DB-001","HONESTY-PRINCIPLE-001"]
write_set: ["src/reports/**","src/cli/commands/task.ts","src/cli/commands/task.test.ts","src/db/store.ts","src/db/store.constants.ts","content/roles/**","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Agent-to-agent communication must be STRUCTURED DATA through the CLI, not prose in a chat (founder ruling 2026-07-10: "los agentes se deben comunicar de la manera más eficiente entre ellos, sí o sí"). Prose reports are where lies and omissions live: unfalsifiable, unqueryable, lost on handoff. Mechanize the report itself:
1. `task report <ID> --role <role>` — the structured completion/status report an agent files via the CLI, stored in the DB (evented). Fields by report kind (schema in code, one source):
   - worker report: what landed (sha — MUST match captured evidence), evidence refs (IDs, validated to exist), deviations declared (refs to deviation events), what was NOT done that the rubric expected (explicit, can be "nothing"), open questions (self-contained).
   - reviewer report: verdict (approved/request-changes), findings (each tied to file/line or evidence ref), claims checked vs claims taken on faith (PRINCIPLE-015 applied).
2. VALIDATION at filing time: evidence refs must exist; the sha must match the captured final-sha; missing required fields = refusal. A report that cannot lie about the mechanical parts.
3. Consumers read reports via CLI/serve: `task report show <ID>`, the orchestrator's dispatch/review flow reads the LAST report instead of asking the agent to re-summarize (efficiency: no re-narration, no telephone game); handoff includes pending reports.
4. The chat between agents shrinks to: the brief (in), the report (out), decisions (DECISION-LOG-001) — everything else is noise. Charters updated to make filing the report part of the definition of done (and MERGE-CLOSE/GATE gates can require it once both exist).
Opinion-free: report schemas ship as defaults; instances may extend fields, not remove the mechanical validations.

## RED test (write first)
In a task-report test add a test named exactly: "task report validates evidence refs and sha against captured evidence before filing". File a worker report whose sha does NOT match the packet's captured final-sha and assert refusal naming the mismatch; file one with a nonexistent evidence ref and assert refusal; file a valid one and assert it round-trips via report show. New command -> the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `report` subcommand export, OR the test name "task report validates evidence refs and sha against captured evidence before filing".

## Reuse
The evidence capture + events tables (the validation sources); task show/brief composition; DECISION-LOG-001 (open questions may graduate to decisions); the handoff builder; role charters.

## Stop conditions
Free-text-only reports (structure is the point); accepting unvalidated evidence refs or shas; a report schema defined in more than one place; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
