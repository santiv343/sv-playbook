---
id: CLI-DESCRIBE-001
title: describe command: machine-readable command catalog (JSON)
depends_on: []
write_set: ["src/cli/commands/describe.ts","src/cli/commands/describe.test.ts","src/cli/registry.ts","content/cli.md","src/cli/commands/docs-content.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Add the `describe` command: prints the machine-readable catalog of all CLI commands as JSON to stdout. Shape: an array of { "name": string, "summary": string } built by iterating the existing registry (src/cli/registry.ts). No arguments; any argument is a usage error (exit 2). This catalog feeds the future MCP wrapper and harness skills (spec D14).

## RED test (write first, in src/cli/commands/describe.test.ts)
Test name: "describe prints a JSON catalog containing docs and task".
Drive main(['describe'], fakeIo) (reuse the fakeIo pattern from src/cli/main.test.ts). Parse io.outLines.join('\n') as JSON; assert an entry with name 'docs' and an entry with name 'task' exist, each with a non-empty summary.
Expected failure cause (literal string in the output): "Unknown command: describe"

## Reuse
src/cli/command.ts (Command, Io, EXIT), src/cli/registry.ts (commands array), src/cli/main.test.ts (fakeIo pattern).

## Stop conditions
Anything requiring files outside the write_set; any gate failure you cannot fix inside it.

## Evidence required at close
red-test-output, verify-root, final-sha.
