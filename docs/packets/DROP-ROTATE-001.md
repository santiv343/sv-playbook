---
id: DROP-ROTATE-001
title: drop rotate-on-open backups (redundant with backup state)
depends_on: []
write_set: ["src/db/store.ts","src/db/store.constants.ts","src/db/store.test.ts","docs/specs/2026-07-07-sv-playbook-design.md"]
requirements: []
evidence_required: ["final-sha"]
---

## Context
The rotate-on-open backup (`rotateBackups` in `src/db/store.ts`) fires on every store open, ~10min freshness, no metadata, retention 10. It predates the mature `backup state` command (metadata, configurable retention, event-driven, `maxAgeHours` + `doctor` WARN). It is now redundant and was the source of the retention-collision bug fixed in 03ff8cc. Decision (2026-07-08): drop it — one backup system for v1 (PRINCIPLE-008).

## Task
Remove the rotate-on-open backup entirely:
- `src/db/store.ts`: delete `trimRotatedBackups` + `rotateBackups`; remove the two `rotateBackups` calls in `openStore` (new-DB path and existing-DB path); drop `ROTATE_DIR`/`ROTATE_RETENTION` from the import; drop now-unused fs imports if any.
- `src/db/store.constants.ts`: delete `ROTATE_DIR`, `ROTATE_RETENTION`.
- `src/db/store.test.ts`: delete the two rotate tests + the `ROTATE_DIR`/`ROTATE_RETENTION` import.
- `docs/specs/2026-07-07-sv-playbook-design.md`: §8 "Every open also rotates a lightweight local backup copy (.svp/backups/, last 10)" removed; durability paragraph reflects `backup state`/`restore state` as the mechanism; D26 "rotating store backups" annotated as superseded by the explicit backup/restore commands.

## RED
After removal: `node --test dist/db/store.test.js` green with no rotate tests; no `ROTATE_` references in `src`; `openStore` no longer creates `.svp/backups/rotate/`.

## Stop conditions
- `npm run verify` green.
- No dangling imports / unused fs functions.
- Spec no longer claims an open-rotate.

## Evidence
(filled at close)
