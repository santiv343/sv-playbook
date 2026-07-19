# Context Bootstrap & Role-Aware Cold Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load the project's actual principles and taste (currently only
prose in `content/principles.md`/`content/taste/*.md`) into the
`context_items` table through the CLI's own validated write path, add a
missing referential check so a typo in a role selector fails loudly
instead of silently, and make cold-start (`AGENTS.md`/`CLAUDE.md`) inject
a real, role-scoped, compiled context pack for `human-interface` instead
of static generic prose.

**Architecture:** No new subsystem. Reuses three things that already
exist and already work: `context add` (validated write path for
`context_items`), `compileContext`/`loadContextCatalog` (the same
selection engine `dispatch prepare` already uses for worker context
packs), and `instructions --write` (the existing cold-start generator).
The only new code is (a) a referential-integrity check for role
selectors and (b) wiring `compileContext` into `instructions.ts`.

**Tech Stack:** TypeScript (strict), better-sqlite3 + drizzle-orm, Node's
built-in test runner.

## Global Constraints (from this session's investigation, copied verbatim)

- Nothing here is invented mechanism — every task below extends existing,
  already-validated code (`addContextItem`, `compileContext`,
  `renderInstructions`). If a task looks like it needs new machinery,
  stop and grep first (D8 discipline) before writing it.
- Role selector values are identity references (closed set — must exist
  in `BUNDLED_ROLE_ID`) and get a fail-closed check. Phase/tag selectors
  are descriptive/free-text (open vocabulary) and must NOT get the same
  treatment — do not over-validate them.
- `content/principles.md`/`content/taste/*.md` become the ONE-TIME source
  for a bootstrap migration, the same pattern already used by
  `addVersionedWorkDefinitions`'s legacy backfill — not an ongoing
  runtime dependency. After the bootstrap, they are retired or
  regenerated as read-only exports (mirroring
  `content/roles/generated-charters.md`'s existing pattern), never
  hand-edited as a source again.
- Cold-start content must land in every instruction mirror
  (`AGENTS.md` AND `CLAUDE.md` today — check `HARNESSES` in
  `src/cli/commands/instructions.ts` for the current list before adding
  more), never just one, to stay agent-agnostic.
- Run `npm run verify` after every task; baselines in
  `playbook.config.json` must not increase.
- Every task is RED-first, per this repo's own `PRINCIPLE-002`.

## Verified state (2026-07-17)

- `context add` (`src/cli/commands/context.ts`) already supports
  `--kind`, `--selector <dimension:value>` (repeatable), `--supersedes`,
  `--tag`, `--capability`, and `--body-file --heading` (extracts one
  markdown section as the body — see `src/context/importers/markdown.ts`
  `readMarkdownSection`).
- `addContextItem` (`src/context/repository.ts:78`) validates required
  fields, fails closed on an undeclared `kind`
  (`validateKindPrecedence`), and validates supersession targets exist
  and are active (`validateSupersessions`) — all inside one transaction.
  It does **not** validate that a `role` selector value is a real role.
- `compileContext(catalog, input)` (`src/context/compiler.ts:184`) is
  called today via `loadContextCatalog(store)` + `compileContext(...)`
  in exactly two places: `src/cli/commands/context.ts:116` (`context
  compile`) and `src/gateway/run-spec.ts:158` (`dispatch prepare`'s
  worker context-pack build). Task 3 below adds a third call site.
- `src/cli/commands/instructions.ts` (60 lines) renders
  `content/instructions/cold-start.md` with `{{productName}}`/`{{tier}}`/
  `{{verifyCommand}}` replacements and writes to `HARNESSES` (today:
  `AGENTS.md`, `CLAUDE.md`).
- The 9 real role ids live in `BUNDLED_ROLE_ID`
  (`src/roles/bundled-profile.constants.ts:21`):
  `human-interface`, `advisor`, `planner`, `refuter`, `arbiter`,
  `delivery-orchestrator`, `investigator`, `implementer`, `reviewer`.
- `content/taste/human.md`'s HJ-001..021 use SHORT role codes (`HI`,
  `ADV`, `PLN`, `REF`, `ARB`, `DO`, `INV`, `IMP`, `REV`, plus `ALL` and
  `RUNTIME-DESIGN` as special non-identity categories) that must be
  translated to the real `BUNDLED_ROLE_ID` values when authoring
  selectors — they are NOT the same strings.
- `CONTEXT_ITEM_STRENGTH` is `mandatory`/`advisory`/`reference`
  (`src/context/context.constants.ts`) — this does not map 1:1 onto
  `content/taste/human.md`'s own "Delivery modes" column
  (`core`/`scoped`/`reference`/`compiler`). Task 4 below must resolve
  this mapping deliberately, not assume one.

---

## File Structure

- **Modify** `src/context/repository.ts` — add `validateSelectorRoles`,
  called from `addContextItem`.
- **Modify** `src/context/context.errors.ts` — add
  `CONTEXT_ERROR.UNKNOWN_ROLE_SELECTOR` (or confirm an equivalent already
  exists — check the file before adding).
- **Create** `docs/packets/CONTEXT-BOOTSTRAP-001.md` (or whatever this
  repo's live packet-authoring path is by the time this runs — see
  Task 2's note) — the actual bootstrap packet authoring the `context
  add` invocations for principles + taste.
- **Modify** `src/cli/commands/instructions.ts` — call
  `loadContextCatalog` + `compileContext` for role `human-interface`,
  inject the rendered result into the template output.
- **Modify** `content/instructions/cold-start.md` — add a
  `{{humanInterfaceContext}}` placeholder.
- **Modify or retire** `content/principles.md`, `content/taste/*.md` —
  final step, only after the bootstrap is verified working.

---

### Task 1: Fail-closed role-selector validation

**Files:**
- Modify: `src/context/repository.ts`
- Modify: `src/context/context.errors.ts` (only if `UNKNOWN_ROLE_SELECTOR`
  or equivalent doesn't already exist — check first)
- Test: `src/context/repository.test.ts`

**Interfaces:**
- Consumes: `BUNDLED_ROLE_ID` from `src/roles/bundled-profile.constants.ts`.
- Produces: `addContextItem` now throws `ContextError` with a new typed
  code when a selector has `dimension === 'role'` and its value is not
  in the known role set.

- [ ] **Step 1: Write the failing test**

```typescript
// add to src/context/repository.test.ts — match this file's existing
// store-fixture setup pattern rather than inventing a new one
test('addContextItem rejects a role selector value that is not a real role', () => {
  const store = /* this file's existing fixture helper */;
  assert.throws(
    () => addContextItem(store, {
      id: 'HJ-TEST', version: 1, kind: 'taste-human',
      status: CONTEXT_ITEM_STATUS.ACTIVE, strength: CONTEXT_ITEM_STRENGTH.MANDATORY,
      semanticKey: 'hj-test', body: 'test body', provenance: 'test',
      selectors: { role: ['not-a-real-role'] },
    }),
    /unknown role/i,
  );
});

test('addContextItem accepts a role selector value that is a real role', () => {
  const store = /* fixture */;
  assert.doesNotThrow(() => addContextItem(store, {
    id: 'HJ-TEST', version: 1, kind: 'taste-human',
    status: CONTEXT_ITEM_STATUS.ACTIVE, strength: CONTEXT_ITEM_STRENGTH.MANDATORY,
    semanticKey: 'hj-test', body: 'test body', provenance: 'test',
    selectors: { role: ['human-interface'] },
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/context/repository.test.js`
Expected: FAIL — the invalid-role test does NOT throw today.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/context/repository.ts — add near the other validate* functions
import { BUNDLED_ROLE_ID } from '../roles/bundled-profile.constants.js';

const KNOWN_ROLE_IDS = new Set(Object.values(BUNDLED_ROLE_ID));
const SELECTOR_ROLE_DIMENSION = 'role';

function validateSelectorRoles(item: ContextItemInput): void {
  const roleValues = item.selectors?.[SELECTOR_ROLE_DIMENSION] ?? [];
  for (const value of roleValues) {
    if (!KNOWN_ROLE_IDS.has(value)) {
      throw new ContextError(CONTEXT_ERROR.UNKNOWN_ROLE_SELECTOR, `${itemRef(item)} has an unknown role selector value: ${value}`);
    }
  }
}
```

Call `validateSelectorRoles(item)` inside `addContextItem`, alongside the
existing `validateInput(item)` call, before the transaction opens (it
doesn't need DB access, unlike `validateKindPrecedence`/
`validateSupersessions` which run inside the transaction — check whether
this repo's convention keeps all validation together or splits by
DB-access; match whatever `validateInput`'s call site already does).
Add `UNKNOWN_ROLE_SELECTOR: 'UNKNOWN_ROLE_SELECTOR'` to `CONTEXT_ERROR`
in `context.constants.ts` if not already present.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/context/repository.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/context/repository.ts src/context/context.constants.ts src/context/repository.test.ts
git commit -m "feat(context): fail closed on unknown role selector values (IDEA-118/119)"
```

---

### Task 2: Bootstrap `content/principles.md` into `context_items`

**Files:**
- Create: the packet authoring this work (`docs/packets/CONTEXT-BOOTSTRAP-001.md`
  or the DB-native equivalent if the packets-in-DB migration — see the
  complexity-checkpoint plan — has landed by the time this executes;
  check which is current before starting)
- No source files modified — this task is a sequence of `context add`
  CLI invocations, executed once, not code

**Interfaces:**
- Consumes: `context add` (Task 1's validation now applies to every
  invocation below).

- [ ] **Step 1: Read `content/principles.md` in full**

There are 15 principles (`PRINCIPLE-001` through `PRINCIPLE-015`) plus a
"Vocabulary" section (gate vs rail, NAME-1). Principles are universal —
no role selector needed (they apply to every role, every workflow).

- [ ] **Step 2: For each principle, run `context add`**

Example for the first one (repeat this exact shape for all 15 — do not
skip any, and do not paraphrase the body, use the real text):

```bash
node bin/sv-playbook.js context add \
  --id PRINCIPLE-001 --version 1 --kind principle \
  --semantic-key principle-determinism-first \
  --body-file content/principles.md --heading "PRINCIPLE-001 — Determinism first" \
  --provenance "content/principles.md, bootstrap 2026-07-17" \
  --tag universal
```

Before running each one, confirm `content/precedence` already has a
`principle` kind registered (`context precedence` lists current kinds —
if `principle` is missing, run
`node bin/sv-playbook.js context precedence principle <other-kinds...>`
first, in the correct precedence order this repo already uses elsewhere
— check `context precedence` with no arguments or `context list` for the
existing order before inventing one).

- [ ] **Step 3: Verify each item landed correctly**

Run: `node bin/sv-playbook.js context list` after each batch of a few
principles, confirm the count matches how many you've added so far, and
spot-check `context compile --role human-interface --phase intake`
includes the expected principle bodies.

- [ ] **Step 4: Commit the packet record**

Whatever this repo's live packet-closing mechanism is at execution time
(the complexity-checkpoint plan may have already changed `task move
review`/`packet move review` semantics — check current state, do not
assume this plan's earlier wording is still literally accurate) — close
this packet through it, not by hand.

---

### Task 3: Bootstrap `content/taste/human.md` (HJ-001..021) into `context_items`

**Files:** same packet as Task 2, or its own follow-up packet — split if
Task 2 is already large enough to be its own reviewable unit.

**Interfaces:**
- Consumes: `context add`, and the role-code translation table below.

- [ ] **Step 1: Translate HJ role codes to real role ids before authoring any selector**

`content/taste/human.md`'s own table uses short codes. Translate using
this exact mapping (verified against `BUNDLED_ROLE_ID` 2026-07-17):

| HJ code | Real role id |
|---|---|
| HI | human-interface |
| ADV | advisor |
| PLN | planner |
| REF | refuter |
| ARB | arbiter |
| DO | delivery-orchestrator |
| INV | investigator |
| IMP | implementer |
| REV | reviewer |
| ALL | (no role selector at all — omit `--selector role:...` entirely, matches every role) |
| RUNTIME-DESIGN | (not a dispatchable role — do not add as a role selector; if an HJ entry ONLY lists RUNTIME-DESIGN, tag it `--tag runtime-design-input` instead of a role selector, since it's explicitly "input to agents designing runtime behavior, never an executable runtime responsibility") |

- [ ] **Step 2: Decide the strength mapping before authoring the first entry**

`content/taste/human.md`'s "Delivery" column has 4 values
(`core`/`scoped`/`reference`/`compiler`); `CONTEXT_ITEM_STRENGTH` has 3
(`mandatory`/`advisory`/`reference`). Do not guess a mapping inline
per-entry — decide once, explicitly, before Step 3, and write the
decision into the packet body as a rationale line. A defensible mapping
(confirm or override, don't just copy blindly): `core` → `mandatory`,
`scoped` → `advisory`, `reference` → `reference`, `compiler` → skip
entirely for this bootstrap (per its own definition, "compiler" entries
are consumed by context/check machinery, not injected into an agent —
they may not belong in `context_items` at all; if unsure, escalate this
one question rather than deciding silently, since it changes what
"compiler"-tagged HJ entries even mean here).

- [ ] **Step 3: For each HJ entry, run `context add`**

Example for HJ-001 (core, roles HI/PLN/DO, phases intake/planning/
delivery/reporting/product UX):

```bash
node bin/sv-playbook.js context add \
  --id HJ-001 --version 1 --kind taste-human \
  --semantic-key hj-optimize-irreducible-human-attention \
  --body-file content/taste/human.md --heading "HJ-001: Optimize for irreducible human attention" \
  --provenance "content/taste/human.md, bootstrap 2026-07-17" \
  --selector role:human-interface --selector role:planner --selector role:delivery-orchestrator \
  --selector phase:intake --selector phase:planning --selector phase:delivery --selector phase:reporting
```

Repeat for HJ-002 through HJ-021, translating each entry's own Roles/
Delivery columns per Steps 1-2 — do not invent selectors for an entry
without reading its actual row in the applicability table first (D8:
this is exactly the kind of thing that's wrong if guessed).

- [ ] **Step 4: Verify selective compilation actually works**

Run:
```bash
node bin/sv-playbook.js context compile --role human-interface --phase intake
node bin/sv-playbook.js context compile --role implementer --phase implementation
```
Expected: the `human-interface` compile includes HJ-001/HJ-008/HJ-015-type
entries and excludes HJ-012/HJ-016-type entries; the `implementer`
compile is the reverse. If both compiles return the same set, the
selectors were not encoded correctly — go back to Step 3, do not proceed.

- [ ] **Step 5: Run full verify and commit the packet**

---

### Task 4: Wire `compileContext` into cold-start generation

**Files:**
- Modify: `src/cli/commands/instructions.ts`
- Modify: `content/instructions/cold-start.md`
- Test: `src/cli/commands/instructions.test.ts`

**Interfaces:**
- Consumes: `loadContextCatalog`, `compileContext` (existing, see
  `src/gateway/run-spec.ts:158` for the exact call pattern to mirror),
  `BUNDLED_ROLE_ID.HUMAN_INTERFACE`.
- Produces: `renderInstructions` now renders a
  `{{humanInterfaceContext}}` placeholder with the compiled pack's item
  bodies, in addition to the existing three placeholders.

- [ ] **Step 1: Write the failing test**

```typescript
// add to src/cli/commands/instructions.test.ts
test('renderInstructions injects the compiled human-interface context', async () => {
  // seed a store with at least one context_item selector-matched to
  // human-interface (reuse this test file's existing fixture pattern)
  const output = await captureRenderedInstructions(/* fixture root */);
  assert.match(output, /HJ-001|Optimize for irreducible human attention/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/cli/commands/instructions.test.js`
Expected: FAIL — today's output has no compiled context, just the 3
static placeholders.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/cli/commands/instructions.ts
import { loadContextCatalog } from '../../context/repository.js'; // confirm exact export name before writing — grep first
import { compileContext } from '../../context/compiler.js';
import { BUNDLED_ROLE_ID } from '../../roles/bundled-profile.constants.js';
import { commonRoot, openStore } from '../../db/store.js';

// inside renderInstructions, before the template.replace chain:
const store = openStore(commonRoot(opts.root));
let humanInterfaceContext: string;
try {
  const catalog = loadContextCatalog(store);
  const pack = compileContext(catalog, {
    role: BUNDLED_ROLE_ID.HUMAN_INTERFACE,
    phase: 'intake',
    requestedCapabilities: [],
  });
  humanInterfaceContext = pack.items.map((item) => item.body).join('\n\n');
} finally {
  store.close();
}

const rendered = template
  .replace(/\{\{productName\}\}/g, config.productName)
  .replace(/\{\{tier\}\}/g, config.tier)
  .replace(/\{\{verifyCommand\}\}/g, config.verifyCommand)
  .replace(/\{\{humanInterfaceContext\}\}/g, humanInterfaceContext);
```

Add the placeholder to `content/instructions/cold-start.md`:

```markdown
# {{productName}} — Cold Start

You are the human-interface role under the {{productName}} methodology on this repo.
Read this first; everything else is on demand via `npx sv-playbook docs <topic>`.

Tier: {{tier}}
Verify: {{verifyCommand}}

## Your role, mission, and boundaries (compiled from the live context catalog)

{{humanInterfaceContext}}

GENERATED — edit the source, run `sv-playbook instructions --write`
```

(Exact phrasing above is a starting point — the implementer should
verify it reads well once real compiled content is substituted, not
treat it as final copy.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test dist/cli/commands/instructions.test.js`
Expected: PASS

- [ ] **Step 5: Regenerate this repo's own AGENTS.md/CLAUDE.md and eyeball it**

```bash
node bin/sv-playbook.js instructions --write
```
Read the resulting `AGENTS.md` — confirm it reads as a coherent,
non-garbled brief for a human-interface session, not a raw dump. If it
reads badly, that's a real finding to fix in this task, not something to
ship and patch later.

- [ ] **Step 6: Run full verify and commit**

```bash
npm run verify
git add src/cli/commands/instructions.ts content/instructions/cold-start.md src/cli/commands/instructions.test.ts AGENTS.md CLAUDE.md
git commit -m "feat(cold-start): inject compiled human-interface context into instruction mirrors"
```

---

### Task 5: Retire or regenerate `content/principles.md`/`content/taste/*.md`

**Files:**
- Delete or regenerate: `content/principles.md`, `content/taste/human.md`,
  `content/taste/engineering.md`, `content/taste/product.md`,
  `content/taste/decisions.md`

**Interfaces:** none new — this is cleanup, gated on Tasks 2-4 being
verified working first.

- [ ] **Step 1: Confirm Tasks 2-4 are fully verified before touching these files**

Do not start this task until `context compile` for at least
`human-interface` and `implementer` roles returns correct, selective
results (Task 3 Step 4) AND cold-start generation reads well (Task 4
Step 5). These files are the only durable record of this content until
that's true.

- [ ] **Step 2: Decide delete vs. regenerate-as-export**

Mirrors the precedent already set for roles
(`content/roles/generated-charters.md`, generated from the DB, kept as
a human-readable export, not deleted). Recommend the same here: build a
small generator (mirror `src/roles/charter-projection.ts`'s pattern) that
projects `context_items` back into `content/principles.md`/
`content/taste/*.md` with a `GENERATED — DO NOT EDIT` banner, rather than
deleting them outright — humans still benefit from a readable page, same
reasoning that kept `generated-charters.md` around.

- [ ] **Step 3: If regenerating, write the generator and wire it into `check`**

Same pattern as `check command-usage`/`check structure` — a
`check content-drift` (or similarly named) target that fails if the
committed `.md` doesn't match what the DB would regenerate, so drift
can't silently creep back in the way `content/cli.md` did.

- [ ] **Step 4: Run full verify and commit**

---

## Self-Review

**Spec coverage:** IDEA-117 (reuse `compileContext` for cold-start) —
Task 4. IDEA-118 (load principles/taste, keep the domain solid) — Tasks
2, 3, and Task 1 addresses the "solid, validated, related" requirement
directly. IDEA-119 (referential integrity as a standing principle) —
Task 1 implements the ONE scoped instance of it this plan covers
(role selectors); the system-wide audit IDEA-119 also calls for is
explicitly out of scope here, tracked separately.

**Known gaps, intentionally not resolved here:**
- The exact `strength` mapping (`core`/`scoped`/`reference`/`compiler` →
  `mandatory`/`advisory`/`reference`) is proposed but flagged for
  explicit confirmation in Task 3 Step 2, not silently assumed.
- Tasks 2-3 do not enumerate all 15 principles or all 21 HJ entries
  verbatim in this plan — each must be authored by reading the real
  current text of `content/principles.md`/`content/taste/human.md` at
  execution time (D8), not transcribed here where drift could make this
  plan stale before it's even run.
- `content/taste/engineering.md`/`product.md`/`decisions.md` are named in
  Task 5 but not given their own detailed bootstrap steps (Task 2/3
  cover principles and human.md specifically) — if their structure
  differs from human.md's role-selector table, that needs its own
  investigation before authoring, not a copy-paste of Task 3's steps.
