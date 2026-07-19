# Task P1-T1 Report: `Command.usage` becomes mandatory + the mechanized gate

## What was implemented

- Made `usage` a required string field on the `Command` interface in `src/cli/command.types.ts`.
- Added the `inspectCommandUsage` gate in `src/check/command-usage.ts` that returns one violation per command whose `usage` is empty or whitespace-only.
- Created the supporting files following the repository's `src/check/*.ts` module conventions:
  - `src/check/command-usage.types.ts` for the `CommandUsageViolation` type.
  - `src/check/command-usage.constants.ts` for the violation kind constant.
- Added tests in `src/check/command-usage.test.ts`.

## TDD evidence

### RED — failing test before implementation

Command:

```bash
npm run build && node --test dist/check/command-usage.test.js
```

Output:

```text
> sv-playbook@0.1.0 build
> node scripts/clean-dist.mjs && tsc && node scripts/copy-serve-assets.mjs

src/check/command-usage.test.ts(3,37): error TS2307: Cannot find module './command-usage.js' or its corresponding type declarations.
Command failed with exit code: 2
```

This failure was expected because `src/check/command-usage.ts` did not exist yet.

### GREEN — passing test after implementation

Because `npm run build` now fails intentionally on the ~32 commands that have not yet
backfilled `usage`, the focused test was compiled and run directly:

Command:

```bash
npx tsc src/check/command-usage.ts src/check/command-usage.test.ts --outDir dist --module NodeNext --moduleResolution NodeNext --target ES2023 --strict --esModuleInterop --skipLibCheck --declaration --sourceMap && node --test dist/check/command-usage.test.js
```

Output:

```text
✔ flags a command with an empty usage string (1.1151ms)
✔ passes a command with a non-empty usage string (0.1246ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 78.4582
```

## Full verification state

`npm run verify` currently fails at the TypeScript build step with `TS2741: Property 'usage' is missing`
for the commands that have not yet received usage strings. This is the intentional RED state for the
rest of the plan and will be resolved by Tasks 2–4.

## Files changed

- `src/cli/command.types.ts` — added mandatory `usage: string` to `Command`.
- `src/check/command-usage.ts` — new gate implementation.
- `src/check/command-usage.types.ts` — new `CommandUsageViolation` type.
- `src/check/command-usage.constants.ts` — new violation kind constant.
- `src/check/command-usage.test.ts` — new tests.

## Self-review findings

- The implementation matches the brief: the gate detects empty/whitespace-only usage strings and
  returns `{ commandName }` violations.
- The test stubs use `() => Promise.resolve(0)` instead of `async () => 0` to satisfy the project's
  `@typescript-eslint/require-await` rule.
- The new module follows the existing `src/check/*.ts` file-split convention (types and constants in
  sibling files).
- No existing logic was restructured; only the mandatory field and the new gate were added.
- The constants file is minimal and forward-looking; it will be consumed once the gate is wired into
  a reporting layer.

## Issues / concerns

- The repository build is intentionally broken until the missing `usage` strings are backfilled in
  subsequent tasks. No placeholders were added because that would satisfy the type checker while
  leaving the runtime gate failing, which contradicts the purpose of the mechanized gate.


## Review fix — wire `COMMAND_USAGE_VIOLATION_KIND` into the violation shape

### Review finding

`src/check/command-usage.constants.ts` defined `COMMAND_USAGE_VIOLATION_KIND`, but the constant was not consumed anywhere. `CommandUsageViolation` lacked a `kind` field, diverging from the convention used by sibling check modules (e.g. `literal-comparison`).

### Changes made

- `src/check/command-usage.types.ts`:
  - Imported `COMMAND_USAGE_VIOLATION_KIND` as a type.
  - Added `readonly kind: typeof COMMAND_USAGE_VIOLATION_KIND.MISSING` to `CommandUsageViolation`.

- `src/check/command-usage.ts`:
  - Imported `COMMAND_USAGE_VIOLATION_KIND`.
  - Set `kind: COMMAND_USAGE_VIOLATION_KIND.MISSING` on every returned violation.

- `src/check/command-usage.test.ts`:
  - Updated existing assertions to expect the `kind` field.
  - Added a test for a whitespace-only `usage` value (`usage: '   '`).
  - Added a test for a mixed command list (one valid, one missing) to verify filtering and mapping.

### Verification

Focused compile and test run:

```bash
npx tsc src/check/command-usage.ts src/check/command-usage.test.ts src/check/command-usage.types.ts --outDir dist --module NodeNext --moduleResolution NodeNext --target ES2023 --strict --esModuleInterop --skipLibCheck --declaration --sourceMap && node --test dist/check/command-usage.test.js
```

Output:

```text
✔ flags a command with an empty usage string (1.7776ms)
✔ flags a command with a whitespace-only usage string (0.1366ms)
✔ passes a command with a non-empty usage string (0.6655ms)
✔ returns only the violations from a mixed command list (0.1361ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 79.8432
```

### Commit

Amended into the original Task 1 commit.

- Amended commit SHA: `9d7f08a94bbdb73a755d0759d23af2a526bd5b57`
- Subject: `feat(cli-sot): Command.usage becomes mandatory + inspectCommandUsage gate`
