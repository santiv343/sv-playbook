<!-- GENERATED FROM THE BOARD — do not edit; use `task amend` -->
---
id: SERVE-UI-MODERN-001
title: serve modern UI: prebuilt SPA (Vite/React, devDeps only) + SSE real-time over node:http — zero runtime deps preserved
depends_on: ["SERVE-001"]
write_set: ["serve-ui/**","src/serve/**","package.json",".github/workflows/ci.yml","content/cli.md"]
requirements: []
evidence_required: ["red-test-output","verify-root","final-sha"]
---

## Task
The founder-approved serve UX (docs/design/serve-mockup.html) requires a modern, polished UI — beyond what hand-written self-contained HTML can sustain. Land the architecture that delivers it WITHOUT breaking the zero-runtime-deps invariant:
1. Frontend: a SPA (Vite + React + Tailwind or equivalent mainstream stack) living under serve-ui/, COMPILED AT BUILD TIME; the static build output ships inside the npm package. The end user runs `sv-playbook serve` and gets the full UI — no build step, no install, no network. The entire toolchain stays in devDependencies; `verify` builds it in CI so a broken UI cannot land.
2. Real-time: replace the poll with Server-Sent Events — `GET /api/events` streamed from node:http (native, zero deps). The SPA subscribes; board/feed/detail update within seconds. Keep the JSON endpoints as the initial-load + fallback path.
3. The node:http server (SERVE-001) serves the static build + the API; it remains the ONLY runtime piece. No express/ws/etc. — CI must fail if package.json dependencies gains an entry (extend the existing zero-deps guard if present, add one if not).
4. Visual + interaction source of truth: docs/design/serve-mockup.html (board, Plan, drawer tabs, provenance badges, human-first wording with allowed anglicisms). The SPA implements it; the mockup file stays as the approved reference.
5. Supersedes the single-file page from SERVE-001 once landed (SERVE-001's minimal page remains the fallback when the build output is absent, e.g. running from a raw git clone — print how to build).
This packet is the architecture + board view migration; ACTIVITY/PLAN/DETAIL packets build their views on top of it when sequenced after.

## RED test (write first)
In a serve-ui test add a test named exactly: "serve delivers the built SPA and streams board events over SSE". With a fixture build output present, GET / returns the SPA shell (its marker), and a client on /api/events receives an event when a packet transitions. Today serve has neither -> it FAILS (or the missing module is the first failure).
Expected failure cause (literal string in the output): the compiler/module error for the missing serve-ui module, OR the test name "serve delivers the built SPA and streams board events over SSE".

## Reuse
SERVE-001's server + API contracts (extend, never fork); the events table as the SSE source (single source — the same events digest consumes); the CI verify pipeline for the UI build step.

## Stop conditions
Any runtime dependency added to package.json dependencies; a second data path for SSE vs the events table; shipping without the built output in the package (user must never build); redesigning against the approved mockup instead of implementing it; touching files outside the write_set.

## Evidence required at close
red-test-output, verify-root, final-sha.
