# Daemon Build-Staleness Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a running daemon was booted from an older build than the
CLI invocation currently trying to forward to it, refuse (with clear
guidance) instead of silently forwarding and having the stale daemon
reject or mis-handle newer commands — closing IDEA-089, which caused a
real incident (a pre-#146 daemon silently swallowed the `enforce`
command shipped in #146, and every store mutation in that window ran
under stale code without anyone noticing until later).

**Architecture:** Stamp a build digest into `dist/` at build time (a
plain content hash of the built output, computed by the existing build
script). The daemon exposes this digest on its health endpoint.
`tryAutoForward` (`src/db/store.ts:194`) compares its own build's digest
against the daemon's before forwarding, and refuses with guidance instead
of forwarding blindly on a mismatch.

**Tech Stack:** TypeScript (strict), `node:crypto` for the digest,
Node's built-in test runner.

## Global Constraints

- `package.json`'s `version` field stays `0.1.0` across dev builds in
  this repo's current workflow (confirmed 2026-07-18) — it is NOT a
  usable freshness signal on its own; the digest must be computed from
  actual build output content.
- The digest computation must be deterministic given the same source (so
  CI and local builds of the same commit produce the same digest) — do
  not include timestamps in the hashed input.
- A daemon that predates this feature (no digest reported) must be
  treated as a mismatch and refused with guidance to restart it, not
  crash on a missing field.
- Run `npm run verify` after every task.
- Every task is RED-first, per this repo's own `PRINCIPLE-002`.

## Verified state (2026-07-18)

- `tryAutoForward` (`src/db/store.ts:194`) is the exact function that
  decides whether to forward a CLI invocation to a running daemon.
- `forwardToDaemonSync` (`src/daemon/client.ts:44`) does the actual
  forward — a digest check belongs before this is called, inside
  `tryAutoForward`, not inside the forward function itself.
- The daemon already has a `DAEMON_ROUTE.HEALTH` endpoint
  (`daemon.ts:158`) — extend its response rather than adding a new route.
- The build script is `npm run build` = `clean-dist.mjs && tsc &&
  copy-serve-assets.mjs` (from `package.json`) — the digest-stamping step
  belongs as a fourth step here, after `tsc` has produced `dist/`.

---

## File Structure

- **Create** `scripts/stamp-build-digest.mjs` — computes a digest over
  `dist/**/*.js` and writes it to `dist/build-digest.json`.
- **Modify** `package.json` — add the stamping script to the `build`
  chain.
- **Create** `src/db/build-digest.ts` — reads `dist/build-digest.json` at
  runtime (both the daemon process and the forwarding CLI process read
  this the same way).
- **Modify** `src/daemon/daemon.ts` — include the digest in the health
  response.
- **Modify** `src/db/store.ts` — `tryAutoForward` compares digests before
  forwarding.

---

### Task 1: Build-time digest stamping

**Files:**
- Create: `scripts/stamp-build-digest.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `dist/build-digest.json` containing `{ "digest": "<sha256 hex>" }`.

- [ ] **Step 1: Write the script (no test — this is a build script, verified by running it, matching this repo's convention for `scripts/*.mjs`)**

```javascript
// scripts/stamp-build-digest.mjs
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function collectJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectJsFiles(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const distRoot = 'dist';
const files = collectJsFiles(distRoot).sort();
const hash = createHash('sha256');
for (const file of files) hash.update(readFileSync(file));
writeFileSync(join(distRoot, 'build-digest.json'), JSON.stringify({ digest: hash.digest('hex') }));
```

- [ ] **Step 2: Wire it into the build chain**

```json
"build": "node scripts/clean-dist.mjs && tsc && node scripts/copy-serve-assets.mjs && node scripts/stamp-build-digest.mjs"
```

- [ ] **Step 3: Run the build and confirm the file appears**

```bash
npm run build
cat dist/build-digest.json
```

Expected: a JSON object with a 64-character hex `digest` field.

- [ ] **Step 4: Commit**

```bash
git add scripts/stamp-build-digest.mjs package.json
git commit -m "feat(build): stamp a content digest into dist/build-digest.json"
```

---

### Task 2: Read the digest at runtime

**Files:**
- Create: `src/db/build-digest.ts`
- Test: `src/db/build-digest.test.ts`

**Interfaces:**
- Produces: `export function readBuildDigest(): string | null;` — returns
  `null` if the file is missing (e.g. a dev build that ran before Task 1
  landed), never throws.

- [ ] **Step 1: Write the failing test**

```typescript
test('returns null when build-digest.json does not exist', () => {
  // point at a directory without the file, assert null
});
test('returns the digest string when the file exists', () => {
  // write a fixture dist/build-digest.json, assert it reads back
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write minimal implementation**

```typescript
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readBuildDigest(): string | null {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'build-digest.json');
  if (!existsSync(path)) return null;
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('digest' in parsed)) return null;
  const { digest } = parsed as { digest: unknown };
  return typeof digest === 'string' ? digest : null;
}
```

(Verify the relative path from `dist/db/build-digest.js` to
`dist/build-digest.json` is exactly one `..` up — confirm against Task 1's
actual output location before trusting this.)

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/db/build-digest.ts src/db/build-digest.test.ts
git commit -m "feat(build-digest): readBuildDigest at runtime"
```

---

### Task 3: Daemon reports its digest; CLI refuses on mismatch

**Files:**
- Modify: `src/daemon/daemon.ts`
- Modify: `src/db/store.ts`
- Test: `src/daemon/daemon.test.ts`, `src/db/store.test.ts` (or
  wherever `tryAutoForward` is currently tested — check first)

**Interfaces:**
- Consumes: `readBuildDigest` (Task 2).

- [ ] **Step 1: Write the failing test**

```typescript
// daemon health response includes the digest
test('health endpoint reports the running build digest', async () => {
  // hit the health route, assert response includes buildDigest matching readBuildDigest()
});
```

```typescript
// tryAutoForward refuses on mismatch
test('tryAutoForward refuses to forward when the daemon build digest differs', () => {
  // mock/stub the daemon health response with a different digest
  // assert it does NOT call forwardToDaemonSync, and exits with guidance instead
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Write minimal implementation**

In `daemon.ts`'s health handler, add `buildDigest: readBuildDigest()` to
the JSON response. In `tryAutoForward`, before calling
`forwardToDaemonSync`, fetch the daemon's health response, compare
`buildDigest` against this process's own `readBuildDigest()` — on
mismatch (including either side being `null`), print clear guidance
("daemon is running an older build — restart it with `sv-playbook
daemon`") and exit with a typed error code instead of forwarding.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Run full verify and commit**

```bash
npm run verify
git add src/daemon/daemon.ts src/db/store.ts src/daemon/daemon.test.ts src/db/store.test.ts
git commit -m "feat(daemon): refuse to forward to a daemon running a stale build (IDEA-089)"
```

---

## Self-Review

**Spec coverage:** IDEA-089 (daemon build-staleness is silent) — Tasks
1-3 together deliver the full detect-and-refuse path.

**Known gap, intentionally not resolved here:** this plan refuses and
guides rather than auto-restarting the stale daemon — auto-restart would
kill in-flight work on that daemon without the operator's awareness,
which this session's own principles (no dead ends, but also no silent
destructive recovery) argue against doing automatically.
