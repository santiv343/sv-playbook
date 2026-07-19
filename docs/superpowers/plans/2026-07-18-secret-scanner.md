# Secret Scanner Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `check secrets` as a new `check` target that scans tracked
files for common secret patterns (API keys, JWTs, private key headers,
common cloud-provider credential shapes) and fails closed, closing
IDEA-011 — a real incident already happened (`.env` with JWT/DB/API keys
sitting exposed in a non-repo workspace dir for weeks, undetected).

**Architecture:** New target in the existing `check` command's `TARGETS`
map (`src/cli/commands/check.ts:109`), same pattern as `structure`/
`instructions`/`roles`. A pure pattern-matching module does the
detection; the CLI wiring is thin.

**Tech Stack:** TypeScript (strict), Node's built-in test runner. No new
dependencies — regex-based detection, not a third-party secret-scanning
library (this repo's `dependencies` stays empty per its own zero-runtime-
dependency convention — verify that's still true in `package.json`
before adding anything).

## Global Constraints

- Match the exact `TARGETS: Record<string, (root: string, io: Io) => Promise<boolean>>`
  shape already in `check.ts` — a target function returns `true` if there
  IS drift/violation (matches `checkStructure`'s existing convention:
  confirm this by reading `checkStructure`'s actual return semantics
  before assuming, don't guess from the name).
- False positives matter — a scanner that cries wolf on every hex-looking
  string gets ignored. Patterns must target real secret SHAPES (e.g. JWT's
  three-part `header.payload.signature` dot structure, AWS access key
  prefix `AKIA`, generic `-----BEGIN...PRIVATE KEY-----` headers), not
  bare high-entropy heuristics as the only signal.
- Exclude `node_modules`, `dist`, `.git`, `.svp` (or wherever the store
  now lives post-relocation) from the scan.
- Run `npm run verify` after every task.
- Every task is RED-first, per this repo's own `PRINCIPLE-002`.

## Verified state (2026-07-18)

- `check.ts`'s `TARGETS` map at line 109 has `structure`, `instructions`,
  `roles` — add `secrets` alongside them.
- No existing secret-scanning code anywhere in `src/` (confirmed by grep
  for "secret" during this session's audit).

---

## File Structure

- **Create** `src/check/secrets.ts` — pure scanning function.
- **Create** `src/check/secrets.constants.ts` — the pattern list.
- **Create** `src/check/secrets.types.ts` — violation shape.
- **Modify** `src/cli/commands/check.ts` — wire `secrets` into `TARGETS`.

---

### Task 1: Pure secret-pattern scanner

**Files:**
- Create: `src/check/secrets.ts`, `src/check/secrets.constants.ts`,
  `src/check/secrets.types.ts`
- Test: `src/check/secrets.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface SecretViolation {
    readonly path: string;
    readonly line: number;
    readonly kind: string; // e.g. 'aws-access-key', 'jwt', 'private-key-header'
  }
  export function scanForSecrets(files: readonly { path: string; content: string }[]): readonly SecretViolation[];
  ```
  Pure — takes already-read file contents, does no filesystem I/O itself
  (the CLI wiring in Task 2 handles reading the tree).

- [ ] **Step 1: Write the failing test**

```typescript
// src/check/secrets.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanForSecrets } from './secrets.js';

test('flags an AWS-shaped access key', () => {
  const violations = scanForSecrets([{ path: 'config.ts', content: "const key = 'AKIAIOSFODNN7EXAMPLE';" }]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'aws-access-key');
});

test('flags a private key header', () => {
  const violations = scanForSecrets([{ path: 'id_rsa', content: '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----' }]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'private-key-header');
});

test('flags a JWT-shaped string', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  const violations = scanForSecrets([{ path: 'notes.md', content: `token: ${jwt}` }]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'jwt');
});

test('does not flag ordinary code', () => {
  const violations = scanForSecrets([{ path: 'index.ts', content: "export const greeting = 'hello world';" }]);
  assert.deepEqual(violations, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/check/secrets.test.js`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/check/secrets.constants.ts
export const SECRET_PATTERNS: readonly { kind: string; pattern: RegExp }[] = [
  { kind: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/ },
  { kind: 'private-key-header', pattern: /-----BEGIN[ A-Z]*PRIVATE KEY-----/ },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
];
```

```typescript
// src/check/secrets.types.ts
export interface SecretViolation {
  readonly path: string;
  readonly line: number;
  readonly kind: string;
}
```

```typescript
// src/check/secrets.ts
import { SECRET_PATTERNS } from './secrets.constants.js';
import type { SecretViolation } from './secrets.types.js';

export function scanForSecrets(files: readonly { path: string; content: string }[]): readonly SecretViolation[] {
  const violations: SecretViolation[] = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    lines.forEach((line, index) => {
      for (const { kind, pattern } of SECRET_PATTERNS) {
        if (pattern.test(line)) violations.push({ path: file.path, line: index + 1, kind });
      }
    });
  }
  return violations;
}
```

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/check/secrets.ts src/check/secrets.constants.ts src/check/secrets.types.ts src/check/secrets.test.ts
git commit -m "feat(check): pure secret-pattern scanner (IDEA-011)"
```

---

### Task 2: Wire `check secrets` into the CLI

**Files:**
- Modify: `src/cli/commands/check.ts`
- Test: `src/cli/commands/check.test.ts`

**Interfaces:**
- Consumes: `scanForSecrets` (Task 1).

- [ ] **Step 1: Write the failing test**

```typescript
// add to check.test.ts
test('check secrets flags a file containing a private key header', async () => {
  // write a temp file with a private-key-header string into a fixture repo
  const exitCode = run(['secrets']);
  assert.equal(exitCode, EXIT.GATE_FAIL);
});

test('check secrets passes a clean tree', async () => {
  const exitCode = run(['secrets']);
  assert.equal(exitCode, EXIT.OK);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test dist/cli/commands/check.test.js`
Expected: FAIL — `secrets` isn't a recognized target.

- [ ] **Step 3: Write minimal implementation**

Add a `checkSecretsTarget(root, io)` function following the exact shape
of `checkRolesTarget` (read the tracked file list — reuse whatever
mechanism `readCheckedSources`/`suggested-command`'s tree-walker already
uses to enumerate tracked files, don't write a second one — grep for
`readCheckedSources` and reuse it), call `scanForSecrets`, print each
violation, return whether any were found. Register it as
`secrets: checkSecretsTarget` in `TARGETS`.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/cli/commands/check.ts src/cli/commands/check.test.ts
git commit -m "feat(check): wire check secrets into the CLI target registry"
```

---

## Self-Review

**Spec coverage:** IDEA-011 (secret scanner as a first-class check
target) — both tasks together deliver it.

**Known gaps, intentionally not resolved here:** the pattern list (Task 1)
covers 3 common shapes as a starting set — it is NOT exhaustive (no
GitHub token, Slack token, generic API key heuristics, etc.). Expanding
coverage is a natural follow-up, not blocking this plan's initial ship.
