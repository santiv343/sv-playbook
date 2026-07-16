<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: DECISION-DURABILITY-001
title: answered decisions export to Git and rebuild from generated history
depends_on: []
write_set: ["src/cli/commands/decision.ts","src/cli/commands/decision.test.ts","src/cli/commands/rebuild.ts","src/cli/commands/rebuild.test.ts","src/decision/**","src/check/**","content/cli.md","docs/decisions/**"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Make answered decisions durable beyond the local SQLite store. Today `decision
answer` persists only in `.svp/playbook.sqlite`; state backups are local and
`rebuild` reconstructs packets but not decisions. A machine loss or rebuild
can therefore erase a founder ruling even though it was treated as binding.

Keep the database as the operational source of truth, but have every answered
decision produce a generated, committed export at `docs/decisions/DEC-xxx.md`.
The export must be immutable history containing the question, answer,
timestamps, and a generated banner. Add a deterministic drift check and make
`rebuild` import those exports so they are the Git disaster floor. Startup
must surface applicable answered decisions through the existing CLI path.

## RED test
Add a test named exactly: `answered decisions survive rebuild from generated exports`.
Answer a decision, verify its generated export exists, rebuild a fresh store
from the exports, and assert `decision show` returns the original immutable
question and answer. Today the export/rebuild path does not exist.

## Stop conditions
Do not make hand-edited Markdown a second writable decision store; do not
weaken immutability of answered decisions; do not rely on local backups as the
only recovery path. Use CLI-only mutations and generated exports.

## Evidence
red-test-output, verify-root, final-sha.
