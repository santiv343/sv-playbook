---
id: CLI-STATUS-HUMAN-001
title: status legible: tabla alineada + header de conteos para el humano (--json intacto)
depends_on: []
write_set: ["src/cli/commands/status.ts","src/cli/commands/status.test.ts","src/status/status.ts","src/status/status.constants.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
The human-readable `status` output is an unformatted flat list a returning human cannot parse. Make it legible WITHOUT changing the `--json` output at all (that is the machine contract for serve — it must stay byte-for-byte identical).

Reformat the non-JSON path into three sections:
1. **Header line**: inline counts, e.g. `Board: 24 done · 0 ready · 0 active · 0 blocked · 1 dropped`.
2. **Packet table**: aligned columns `ID | STATUS | LEASE | LAST EVENT | TITLE` (pad columns to the widest cell so they line up in a monospace terminal; truncate TITLE to a fixed width with `…`). Sort so the packets that need attention come first: active, then blocked, then ready, then review, then draft, then done, then dropped. Done/dropped may be listed after a divider.
3. **Footer**: `backup: <n> hours old` and `<live>/<total> leases live`.

Keep the rendering logic in the presentation layer (src/status/status.ts) and the column widths/labels in src/status/status.constants.ts (layout rule). The command file src/cli/commands/status.ts only wires input→render→print.

## RED test (write first)
In src/cli/commands/status.test.ts add a test named exactly: "human status renders an aligned table with a counts header". Assert the non-JSON output contains the inline counts header (e.g. the substring `done ·`) AND an aligned column header row containing `ID` and `STATUS` and `LAST EVENT`. Today the output is a flat list with none of this → it FAILS.
Expected failure cause (literal string in the output): the test name "human status renders an aligned table with a counts header".

## Reuse
Existing status.types (StatusReport), existing status command plumbing, existing --json serializer (do NOT touch it).

## Stop conditions
Changing the `--json` output shape in any way; putting column strings in a logic module instead of status.constants.ts; sorting that drops or hides any packet.

## Evidence required at close
red-test-output, verify-root, final-sha.
