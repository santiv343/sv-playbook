# Self-Discoverable CLI (SOT for tools) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `Command` interface itself the single source of truth
for how every CLI command is invoked, so `describe --json` (and anything
that derives from it — skills, MCP, `content/cli.md`) never drifts from
reality again, instead of the current state where usage strings are
inconsistently authored (or missing) per command and `content/cli.md`
hand-duplicates syntax by hand.

**Architecture:** Add a mandatory `usage: string` field to the `Command`
interface. Backfill it on the 14 commands that have none today. Add a
mechanized gate (same shape as the existing `REQUIRED_SECTIONS` packet
check) that fails if any registered command lacks it. Wire it into
`describe --json`. Trim the hand-written "Argument shape" code fences out
of `content/cli.md`, replacing them with a pointer to `describe`.

**Tech Stack:** TypeScript (strict), Node's built-in test runner.

## Global Constraints (from the investigation, copied verbatim)

- `PRINCIPLE-011` (single source for every fact) applies here directly —
  do not write a second usage string anywhere once `Command.usage` exists.
- `PRINCIPLE-009` (generated boilerplate, authored deltas) — `content/cli.md`
  keeps only the "why/when" prose (judgment); mechanical syntax is
  generated or pointed at, never re-typed.
- Every task is RED-first, per this repo's own `PRINCIPLE-002`.
- Run `npm run verify` after every task; baselines in
  `playbook.config.json` must not increase.
- Do not invent flag syntax for a command without reading its actual
  argument-parsing code first (`parseArgs` call or equivalent) — this
  plan intentionally does not pre-fill exact flag lists for the 14
  backfilled commands because they were not independently re-verified
  when this plan was written; each task's implementer must read the real
  source before writing the string (same discipline as D8 in the
  complexity-checkpoint plan).

## Verified state (2026-07-17, via `grep -c "usage:\|^const USAGE"` across `src/cli/commands/*.ts`)

**Already have usage documentation (15 commands) — no backfill needed,
only wiring into `describe`:** `constitution`, `context`, `contract`,
`daemon`, `decision`, `dispatch`, `enforce`, `execution-profile`,
`promotion`, `role`, `serve`, `sprint`, `status`, `task`, `workflow-policy`.

**Missing usage entirely (14 commands) — need backfill:** `adopt`,
`backup`, `check`, `describe`, `docs`, `doctor`, `handoff`, `import`,
`instructions`, `rebuild`, `reconcile`, `restore`, `review`, `workspace`.

---

## File Structure

- **Modify** `src/cli/command.types.ts` — `Command.usage` becomes
  mandatory (`usage: string`, not optional).
- **Create** `src/check/command-usage.ts` — the gate: given the full
  command registry, returns violations for any command with an empty/
  missing `usage`.
- **Create** `src/check/command-usage.constants.ts` — violation kind
  constants, mirroring `suggested-command.constants.ts`'s shape.
- **Modify** `src/cli/commands/check.ts` (or wherever `check`'s target
  list is registered — confirm exact spot by reading the file) — wire in
  a new `check command-usage` target.
- **Modify** the 14 command files listed above (`adopt.ts`, `backup.ts`,
  `check.ts`, `describe.ts`, `docs.ts`, `doctor.ts`, `handoff.ts`,
  `import.ts`, `instructions.ts`, `rebuild.ts`, `reconcile.ts`,
  `restore.ts`, `review.ts`, `workspace.ts`) — add `usage`.
- **Modify** `src/cli/commands/describe.ts` — include `usage` in the
  JSON output per command.
- **Modify** `content/cli.md` — remove hand-written "Argument shape" code
  fences, replace with "run `sv-playbook describe` for exact syntax."

---

### Task 1: `Command.usage` becomes mandatory + the mechanized gate

**Files:**
- Modify: `src/cli/command.types.ts`
- Create: `src/check/command-usage.ts`
- Create: `src/check/command-usage.constants.ts`
- Test: `src/check/command-usage.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  // command-usage.types.ts (or inline in command-usage.ts if this repo's
  // convention keeps small type sets inline — check an existing sibling
  // check module first, e.g. suggested-command, and match its file split)
  export interface CommandUsageViolation {
    readonly commandName: string;
  }
  export function inspectCommandUsage(commands: readonly Command[]): readonly CommandUsageViolation[];
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// src/check/command-usage.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectCommandUsage } from './command-usage.js';

test('flags a command with an empty usage string', () => {
  const violations = inspectCommandUsage([
    { name: 'broken', summary: 's', usage: '', run: async () => 0 },
  ]);
  assert.deepEqual(violations, [{ commandName: 'broken' }]);
});

test('passes a command with a non-empty usage string', () => {
  const violations = inspectCommandUsage([
    { name: 'ok', summary: 's', usage: 'sv-playbook ok [--flag]', run: async () => 0 },
  ]);
  assert.deepEqual(violations, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/check/command-usage.test.js`
Expected: FAIL — `Cannot find module './command-usage.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/cli/command.types.ts — change:
export interface Command {
  name: string;
  summary: string;
  usage: string; // was missing; now mandatory
  destructive?: boolean;
  destructiveSubcommands?: readonly string[];
  run(args: string[], io: Io): Promise<number>;
}
```

```typescript
// src/check/command-usage.ts
import type { Command } from '../cli/command.types.js';

export interface CommandUsageViolation {
  readonly commandName: string;
}

export function inspectCommandUsage(commands: readonly Command[]): readonly CommandUsageViolation[] {
  return commands
    .filter((command) => command.usage.trim().length === 0)
    .map((command) => ({ commandName: command.name }));
}
```

Note: making `usage` mandatory on the interface will break the TypeScript
build for every command missing it — that's intentional and is what
forces Tasks 2-4 below to actually happen instead of being skippable.
Expect `npm run build` to fail with ~14 errors after this step; that's
the RED state for the whole plan, not just this task. Do not silence it
with `usage: ''` placeholders — that would satisfy the type checker while
leaving the gate's runtime check (Step 1's test) failing, which is the
point of having both.

- [ ] **Step 4: Run test to verify it passes**

This step can't fully pass yet — `npm run build` will fail until Tasks
2-4 backfill the 14 commands. Run
`node --test dist/check/command-usage.test.js` directly against a
manually-compiled version of just this file if the monorepo build blocks
on the other 14 errors, or proceed straight to Task 2 and return to
confirm full green at the end of Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/cli/command.types.ts src/check/command-usage.ts src/check/command-usage.test.ts
git commit -m "feat(cli-sot): Command.usage becomes mandatory + inspectCommandUsage gate"
```

---

### Task 2: Backfill usage — read-only inspection commands

**Files:**
- Modify: `src/cli/commands/adopt.ts`, `src/cli/commands/backup.ts`,
  `src/cli/commands/check.ts`, `src/cli/commands/doctor.ts`,
  `src/cli/commands/workspace.ts`
- Test: each command's existing test file (add one assertion each, don't
  create new test files)

- [ ] **Step 1: Read each command's actual argument handling**

Before writing anything, open each of the 5 files and find how it parses
`args` (look for `parseArgs` calls, manual `args[0]` checks, or a
`SUBCOMMANDS` map). Write down the real flags/positionals each accepts —
`content/cli.md` already documents `adopt [--force]`, `backup state
[--force]`, `check [structure|instructions]`, `doctor [--json]` (verify
these are still accurate against the code, don't just copy them
uncritically); `workspace` has no existing doc anywhere in this session's
research — read its source fresh.

- [ ] **Step 2: Write the failing test (one per command)**

```typescript
// add to each command's existing test file, e.g. adopt.test.ts
test('adopt command declares a non-empty usage string', () => {
  assert.notEqual(command.usage.trim(), '');
  assert.match(command.usage, /^sv-playbook adopt/);
});
```

(Repeat for `backup`, `check`, `doctor`, `workspace` — import each
command's `command` export the way that test file already does for
other assertions.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run build 2>&1 | head -50` — expect TypeScript errors on all 5
files (`usage` missing from object literal), which is the RED state for
this task specifically (build-time RED, not just test-time).

- [ ] **Step 4: Add `usage` to each command object**

Add a `usage:` field to each file's exported `command` object, using the
real flags/positionals found in Step 1. Follow the exact single-line
style already used by `status.ts`'s `USAGE` const
(`'Usage: sv-playbook status [--json]'`) for commands with no
subcommands.

- [ ] **Step 5: Run build and tests to verify they pass**

Run: `npm run build && node --test dist/cli/commands/adopt.test.js dist/cli/commands/backup.test.js dist/cli/commands/check.test.js dist/cli/commands/doctor.test.js dist/cli/commands/workspace.test.js`
Expected: PASS (build succeeds, all 5 new assertions pass)

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/adopt.ts src/cli/commands/backup.ts src/cli/commands/check.ts src/cli/commands/doctor.ts src/cli/commands/workspace.ts src/cli/commands/adopt.test.ts src/cli/commands/backup.test.ts src/cli/commands/check.test.ts src/cli/commands/doctor.test.ts src/cli/commands/workspace.test.ts
git commit -m "feat(cli-sot): backfill usage for adopt/backup/check/doctor/workspace"
```

---

### Task 3: Backfill usage — discovery/generation commands

**Files:**
- Modify: `src/cli/commands/describe.ts`, `src/cli/commands/docs.ts`,
  `src/cli/commands/handoff.ts`, `src/cli/commands/instructions.ts`
- Test: each command's existing test file

**Interfaces:**
- Consumes: same pattern as Task 2.

- [ ] **Step 1: Read each command's actual argument handling**

`content/cli.md` documents `describe` as taking no arguments and `docs
[topic]` as an optional positional — verify against the real source.
`handoff` and `instructions` have no documented shape found in this
session's research; read their source fresh.

- [ ] **Step 2: Write the failing test (one per command)**

Same pattern as Task 2 Step 2, one assertion per command file.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run build 2>&1 | head -50`
Expected: TypeScript errors on these 4 files.

- [ ] **Step 4: Add `usage` to each command object**

Same pattern as Task 2 Step 4.

- [ ] **Step 5: Run build and tests to verify they pass**

Run: `npm run build && node --test dist/cli/commands/describe.test.js dist/cli/commands/docs.test.js dist/cli/commands/handoff.test.js dist/cli/commands/instructions.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/describe.ts src/cli/commands/docs.ts src/cli/commands/handoff.ts src/cli/commands/instructions.ts src/cli/commands/describe.test.ts src/cli/commands/docs.test.ts src/cli/commands/handoff.test.ts src/cli/commands/instructions.test.ts
git commit -m "feat(cli-sot): backfill usage for describe/docs/handoff/instructions"
```

---

### Task 4: Backfill usage — recovery/import commands

**Files:**
- Modify: `src/cli/commands/import.ts`, `src/cli/commands/rebuild.ts`,
  `src/cli/commands/reconcile.ts`, `src/cli/commands/restore.ts`,
  `src/cli/commands/review.ts`
- Test: each command's existing test file

**Interfaces:**
- Consumes: same pattern as Task 2.

- [ ] **Step 1: Read each command's actual argument handling**

`content/cli.md` documents `rebuild [--force]` and
`restore state --file <path> [--force]` — verify against the real
source. `import`, `reconcile`, `review` have no documented shape found
in this session's research; read their source fresh.

- [ ] **Step 2: Write the failing test (one per command)**

Same pattern as Task 2 Step 2.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run build 2>&1 | head -50`
Expected: TypeScript errors on these 5 files — and after this task, ZERO
remaining errors, since this is the last of the 14 commands.

- [ ] **Step 4: Add `usage` to each command object**

Same pattern as Task 2 Step 4.

- [ ] **Step 5: Run the FULL build and test suite**

Run: `npm run verify`
Expected: PASS, clean — this is the first point where the whole repo
builds again since Task 1's interface change. If it doesn't pass clean,
something from Tasks 2-4 was missed; do not proceed to Task 5 until it
does.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/import.ts src/cli/commands/rebuild.ts src/cli/commands/reconcile.ts src/cli/commands/restore.ts src/cli/commands/review.ts src/cli/commands/import.test.ts src/cli/commands/rebuild.test.ts src/cli/commands/reconcile.test.ts src/cli/commands/restore.test.ts src/cli/commands/review.test.ts
git commit -m "feat(cli-sot): backfill usage for import/rebuild/reconcile/restore/review — all 14 commands now covered"
```

---

### Task 5: Wire the gate into `check`, wire `usage` into `describe --json`

**Files:**
- Modify: `src/cli/commands/check.ts`
- Modify: `src/cli/commands/describe.ts`
- Test: `src/cli/commands/check.test.ts`, `src/cli/commands/describe.test.ts`

**Interfaces:**
- Consumes: `inspectCommandUsage` (Task 1).

- [ ] **Step 1: Write the failing test**

```typescript
// add to check.test.ts
test('check command-usage passes when every command has usage', () => {
  const exitCode = run(['command-usage']);
  assert.equal(exitCode, EXIT.OK);
});
```

```typescript
// add to describe.test.ts
test('describe --json includes a usage field per command', () => {
  const output = JSON.parse(captureOutput([]));
  for (const entry of output) {
    assert.equal(typeof entry.usage, 'string');
    assert.notEqual(entry.usage.trim(), '');
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/cli/commands/check.test.js dist/cli/commands/describe.test.js`
Expected: FAIL — `command-usage` isn't a recognized `check` target yet;
`describe`'s output has no `usage` key yet.

- [ ] **Step 3: Write minimal implementation**

In `check.ts`, find where check targets are registered (mirror the
`structure`/`instructions` target pattern already there) and add
`command-usage`, calling `inspectCommandUsage` against the full command
registry. In `describe.ts`, add `usage: command.usage` to each emitted
JSON entry.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/cli/commands/check.test.js dist/cli/commands/describe.test.js`
Expected: PASS

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/cli/commands/check.ts src/cli/commands/describe.ts src/cli/commands/check.test.ts src/cli/commands/describe.test.ts
git commit -m "feat(cli-sot): check command-usage gate + describe --json emits usage"
```

---

### Task 6: Trim hand-written syntax out of `content/cli.md`

**Files:**
- Modify: `content/cli.md`

**Interfaces:** none — documentation-only change, but still gets a
verification step since `content/` has its own drift checks in this repo
(the `suggested-command` gate from earlier in this session validates
`content/cli.md`'s command mentions against the real registry).

- [ ] **Step 1: Remove the "Argument shape(s)" code fences**

For each command section in `content/cli.md` that has a fenced code
block titled "Argument shape" or "Argument shapes" (e.g. under `task
create|amend|...`, `adopt`, `check`, `doctor`, `status`, `serve`,
`backup state`, `restore state`, `rebuild`), delete the fence and
replace it with one line: "Run `sv-playbook describe` for the exact,
always-current argument syntax." Keep the "When"/"Why" prose sections —
those are judgment, not mechanical, and stay authored.

- [ ] **Step 2: Run `npm run lint` to confirm the suggested-command gate still passes**

Run: `npm run lint`
Expected: `"suggestedCommands":{"count":0,"valid":true` — removing code
fences should only shrink the surface that gate scans, never break it;
if it does fail, a leftover fenced block still has a stale flag/command
example.

- [ ] **Step 3: Run full verify and commit**

```bash
npm run verify
git add content/cli.md
git commit -m "docs(cli-sot): remove hand-written argument syntax from cli.md, point at describe instead"
```

---

## Self-Review

**Spec coverage:** IDEA-111's core ask (one generated source, skills/MCP/
docs derive from it) — Tasks 1, 5 build the mechanism; Tasks 2-4 make it
total (all 14 gaps closed); Task 6 removes the duplicate that motivated
the whole plan. The "self-discoverable" principle itself (content
candidate, not yet in `content/principles.md`) is not added to the
constitution by this plan — that's a founder call, tracked separately in
IDEA-111, not a code task.

**Known gap, intentionally not resolved here:** exact flag/positional
lists for the 14 backfilled commands are NOT pre-filled in this plan —
each task's Step 1 requires the implementer to read the real source
first. This is deliberate (see Global Constraints) rather than an
oversight: writing invented syntax here would be exactly the kind of
unverified claim this whole session has been correcting.

**Not covered by this plan (explicitly out of scope, tracked elsewhere):**
the skills ecosystem (more skill files beyond `repo-state.md`) and the
MCP wrapper itself (IDEA-093/112) — both depend on this plan's output
but are their own, separate work.
