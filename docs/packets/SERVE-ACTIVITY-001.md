<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SERVE-ACTIVITY-001
title: serve+digest: the what-happened-since delta feed (founder re-entry, single source = events table)
depends_on: ["SERVE-001"]
write_set: ["src/cli/commands/digest.ts","src/cli/commands/digest.test.ts","src/serve/**","src/cli/registry.ts","src/tasks/service.ts","src/tasks/service.test.ts","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
Kill the founder's core re-entry pain: he returns after hours/days, MANY things changed (packets created/implemented/merged by several agents), and NOBODY can reconstruct what happened without git archaeology. Current serve packets show the CURRENT state; this packet shows the DELTA — "what happened since I left" — as a first-class, single-source feature.
1. `sv-playbook digest [--since <iso-time | last>]` — a CLI command that emits a human-readable, chronological digest of everything that happened since the given time (default: since the last digest run, stored in the DB): packets created/amended, every transition (who/when/from→to), leases taken/released/taken-over, evidence captured, notes, merges detected (MERGE-CLOSE data once it lands), backups/restores/rebuilds. Grouped by packet, newest last, with a one-line summary header (N created, N done, N active...).
2. The digest is built ONLY from the events table (single source). If some fact the founder needs is not in the events stream, the fix is to EMIT that event where it happens (e.g. task create/amend must write an event), never to scrape git or the filesystem.
3. `GET /api/activity?since=<iso>` in serve returns the same data as JSON (same builder, single source), and the serve board page renders it as an "Activity" feed section (auto-refresh like the board). SERVE-001 stays minimal; this endpoint+section lands as its immediate follow-up.
4. `--json` on digest for agents; the human output is a readable timeline, not a table dump.
Opinion-free: what events exist is engine; how often the founder reads digests is his workflow.

## RED test (write first)
In src/cli/commands/digest.test.ts add a test named exactly: "digest since a timestamp lists creations, transitions and lease events in order". Seed a store with a packet created, moved ready→active, lease taken, a note — then run digest --since (before all of it) and assert the output lists the four events chronologically with the packet id; a --since AFTER them yields an empty digest with the summary header. New command → the FIRST failure is the missing export/registration.
Expected failure cause (literal string in the output): the compiler/module error for the missing `digest` command export, OR the test name "digest since a timestamp lists creations, transitions and lease events in order".

## Reuse
The events table readouts (recordEvent/list in src/db); the status --json contract; SERVE-001's server + page (extend, don't fork); command registration.

## Stop conditions
Scraping git/filesystem instead of the events table (emit missing events at the source instead); a second query path for serve vs digest (one builder); any write path in serve; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
