---
id: DOCS-CLI-STORE-001
title: cli.md documents rebuild, store safety and describe
depends_on: []
write_set: ["content/cli.md"]
requirements: []
evidence_required: ["verify-root","final-sha"]
---

﻿## Task
content/cli.md is missing the sections for three shipped commands/behaviors. Add, in the exact When/Why format of the existing sections: (1) `sv-playbook rebuild` - when: after any store disaster or schema-version refusal; why: the DB is disposable, docs/packets/*.md plus their `closed:` stamps are the durable truth; note it deletes and recreates .svp/playbook.sqlite and must run from the main repo with no other sv-playbook processes running. (2) A short `Store safety` subsection: schema version mismatch makes every command refuse with the exact recovery message (quote it: `store schema v<found> does not match v<expected>: run sv-playbook rebuild...`); rotating backups land in .svp/backups/ (last 10, silent). (3) `sv-playbook describe` section if absent - verify first. Do not touch any other section. Do not touch any file except content/cli.md.

## RED check (content packet - replaces the unit-test RED)
Before writing: run `grep -c "sv-playbook rebuild" content/cli.md` - expect 0 (that is RED). After writing: >0 and npm run verify stays green.
Expected failure cause (literal string): the grep prints 0

## Reuse
content/cli.md (existing section format), docs/packets/STORE-*.md (behavior source).

## Stop conditions
Anything outside content/cli.md; changing existing sections beyond appending.

## Evidence required at close
verify-root, final-sha.
