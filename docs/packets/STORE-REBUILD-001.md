---
id: STORE-REBUILD-001
title: durable close stamps + rebuild command: make the durability rule true (graduates IDEA-029 after real data loss)
depends_on: []
write_set: ["src/tasks/service.ts","src/tasks/service.test.ts","src/cli/commands/rebuild.ts","src/cli/registry.ts","src/packets/document.ts","src/db/store.ts"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

﻿## Task
Graduate IDEA-029 after real data loss (a worker deleted .svp/playbook.sqlite and the whole board history died with it). Two halves that together make the durability rule TRUE:

1. Durable status stamping: when movePacket reaches 'done' or 'dropped', append (do not rewrite) a final line to the packet's markdown file: a blank line then `closed: <status> <ISO-timestamp>`. This makes terminal statuses recoverable from git alone.
2. New top-level command `sv-playbook rebuild` (src/cli/commands/rebuild.ts + registry entry): deletes .svp/playbook.sqlite if present, re-opens the store (fresh schema), then for every docs/packets/*.md: parse with parsePacketDocument (tolerate and skip the trailing `closed:` line before parsing the body - the frontmatter is untouched), insert the packet row; status = the last `closed:` stamp if present, else 'draft'; write_set from the definition; record one transition none-><status> and one event note 'rebuilt from files'. Echo: `rebuilt: <n> packets (<d> done, <x> dropped, <r> draft)`. Non-terminal in-flight state (active leases, review) is intentionally NOT recovered - rebuild is for disasters, and in-flight packets simply restart from draft/ready.

## RED test (write first, appended to src/tasks/service.test.ts)
Test name: "done stamps the packet file and rebuild restores terminal statuses".
Body: temp root; create packet, ready, start, review (use a git-init'd dir as in the evidence test), done; assert the packet file now ends with a line starting 'closed: done'. Then delete <root>/.svp/playbook.sqlite, call the exported rebuild function (export rebuildFromFiles(store creation inside: takes repoRoot, returns counts), and assert listPackets on a fresh store shows the packet as done.
Expected failure cause (literal string in the output): "done stamps the packet file and rebuild restores terminal statuses"

## Reuse
src/packets/document.ts (parsePacketDocument), src/tasks/service.ts (movePacket, createPacket), src/db/store.ts (openStore), src/cli/registry.ts + describe pattern for the new command.

## Stop conditions
Anything outside the write_set; touching leases/sessions recovery (explicitly out of scope); any schema change beyond what rebuild itself needs.

## Evidence required at close
red-test-output, verify-root, final-sha.
