---
id: CLI-QUIET-001
title: bin shim filters the sqlite ExperimentalWarning (stderr noise hid three real errors)
depends_on: []
write_set: ["bin/sv-playbook.js","src/cli/main.test.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Silence the node:sqlite ExperimentalWarning that pollutes every CLI invocation (it pushed the reviewer into suppressing stderr, which hid three real errors). In bin/sv-playbook.js, BEFORE the dynamic import of the CLI, register a warning filter:
  process.removeAllListeners('warning');
  process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.error(w.stack ?? w.message); });
Keep the shim otherwise identical. Real errors and non-experimental warnings must still reach stderr.

## RED test (write first, appended to src/cli/main.test.ts)
Not testable via main() (the filter lives in the bin shim, not in main). Instead: test name "bin shim filters experimental warnings only".
Body: use execFileSync(process.execPath, ['bin/sv-playbook.js', 'docs'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }) from the repo root via a child_process spawn capturing stderr; assert stderr does NOT contain 'ExperimentalWarning'. (Run node on the shim directly; dist must be built - npm test builds first.)
Expected failure cause (literal string in the output): "bin shim filters experimental warnings only"

## Reuse
bin/sv-playbook.js (current shim), node:child_process execFileSync.

## Stop conditions
Anything outside the write_set; touching src/cli/main.ts or the import order semantics.

## Evidence required at close
red-test-output, verify-root, final-sha.
