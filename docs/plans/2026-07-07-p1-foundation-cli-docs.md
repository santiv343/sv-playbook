# Plan 1: Foundation, CLI Skeleton & `docs` Command

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A publishable `sv-playbook` npm package whose CLI serves the playbook's process docs (`npx sv-playbook docs <topic>`), with strict-TS quality gates green from the empty skeleton and CI on Windows + Linux.

**Architecture:** ESM TypeScript package. `bin/sv-playbook.js` (plain JS shim) loads `dist/cli/main.js`. A command registry maps names to handlers; each command is one file. Process docs live in `content/` inside the package and are resolved relative to the module — never copied into consumer projects (spec §7, D5).

**Tech Stack:** Node >= 22.13.0, TypeScript strict, `node --test`, ESLint (typescript-eslint), zero runtime dependencies. Package manager: npm.

## Global Constraints (from spec, verbatim where quoted)

- Node engine: `>=22.13.0` (provides `node:sqlite` for later plans).
- "TypeScript strict, TDD, minimal dependencies" — zero runtime deps in this plan; devDeps limited to `typescript`, `eslint`, `typescript-eslint`, `@types/node`.
- "Windows is first-class: developed and CI-tested on Windows + Linux from commit 1." No POSIX-only paths, no shell-specific commands in scripts.
- All docs and code identifiers in English. Concise, unambiguous.
- License: MIT. Public repo.
- Exit codes (fixed for the whole CLI): `0` OK · `1` gate failure · `2` usage / incomplete input · `3` system error.
- Repo already exists at `C:\Users\santi\Desktop\projects\sv-playbook` with `docs/specs/` committed on `main`. Work on a feature branch `feature/P1-foundation`; PR to `main`; human review before merge.

---

### Task 1: Package scaffold with green verify on empty skeleton

**Files:**
- Create: `package.json`, `tsconfig.json`, `eslint.config.js`, `.gitignore`, `.editorconfig`, `LICENSE`

**Interfaces:**
- Produces: `npm run verify` = typecheck + lint + build + test, used by every later task and by CI (Task 2).
- Produces: `dist/` layout — `src/**/*.ts` compiles to `dist/**/*.js`; tests are `src/**/*.test.ts` → `dist/**/*.test.js`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sv-playbook",
  "version": "0.1.0",
  "description": "End-to-end methodology for agent-driven software development: a markdown constitution plus a verifier CLI.",
  "license": "MIT",
  "type": "module",
  "bin": { "sv-playbook": "./bin/sv-playbook.js" },
  "engines": { "node": ">=22.13.0" },
  "files": ["bin", "dist", "content", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "npm run build && node --test \"dist/**/*.test.js\"",
    "verify": "npm run typecheck && npm run lint && npm run test"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "eslint": "^9.18.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.20.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `eslint.config.js`**

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/'] },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
```

- [ ] **Step 4: Create `.gitignore`, `.editorconfig`, `LICENSE`**

`.gitignore`:
```
node_modules/
dist/
.svp/
*.tgz
```

`.editorconfig`:
```
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
```

`LICENSE`: standard MIT text with `Copyright (c) 2026 Santiago Varacca`.

- [ ] **Step 5: Install and verify the empty skeleton is green**

Run: `git checkout -b feature/P1-foundation` then `npm install` then `npm run verify`
Expected: typecheck PASS (no inputs is acceptable: if `tsc` errors with "No inputs were found", create `src/placeholder.ts` containing `export {};` — it is deleted in Task 3), lint PASS, test PASS (0 tests). Exit code 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: package scaffold, strict TS + eslint + node:test, verify green on empty skeleton"
```

---

### Task 2: CI on Windows + Linux

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run verify` (Task 1).
- Produces: required status check `ci` for PRs to `main`.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22.13'
          cache: npm
      - run: npm ci
      - run: npm run verify
```

- [ ] **Step 2: Validate locally that the workflow YAML parses**

Run: `node -e "const fs=require('node:fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('windows-latest'))throw new Error('missing windows');console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: verify matrix on ubuntu + windows, node 22.13"
```

---

### Task 3: CLI entry point and command router

**Files:**
- Create: `bin/sv-playbook.js`, `src/cli/main.ts`, `src/cli/command.ts`, `src/cli/registry.ts`
- Test: `src/cli/main.test.ts`
- Delete: `src/placeholder.ts` (if created in Task 1)

**Interfaces:**
- Produces (used by every command task in this and later plans):

```ts
// src/cli/command.ts
export interface Io {
  out(line: string): void;
  err(line: string): void;
}
export interface Command {
  name: string;
  summary: string;           // one line, shown in usage and (later) describe --json
  run(args: string[], io: Io): Promise<number>;
}
export const EXIT = { OK: 0, GATE_FAIL: 1, USAGE: 2, SYSTEM: 3 } as const;
```

```ts
// src/cli/main.ts
export function main(argv: string[], io?: Io): Promise<number>;
```

- Produces: `src/cli/registry.ts` exports `commands: readonly Command[]`; adding a command = adding one entry.

- [ ] **Step 1: Write the failing test**

`src/cli/main.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from './main.js';
import type { Io } from './command.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

test('unknown command prints usage and exits 2', async () => {
  const io = fakeIo();
  const code = await main(['definitely-not-a-command'], io);
  assert.equal(code, 2);
  assert.ok(io.errLines.join('\n').includes('Unknown command'));
  assert.ok(io.errLines.join('\n').includes('Usage: sv-playbook <command>'));
});

test('no args prints usage and exits 2', async () => {
  const io = fakeIo();
  const code = await main([], io);
  assert.equal(code, 2);
  assert.ok(io.errLines.join('\n').includes('Usage: sv-playbook <command>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './main.js'` (build error) or equivalent. The cause must be the missing module, not a typo in the test.

- [ ] **Step 3: Implement `command.ts`, `registry.ts`, `main.ts`**

`src/cli/command.ts`: exactly the interface block from **Interfaces** above.

`src/cli/registry.ts`:
```ts
import type { Command } from './command.js';

export const commands: readonly Command[] = [];
```

`src/cli/main.ts`:
```ts
import { commands } from './registry.js';
import { EXIT, type Io } from './command.js';

const defaultIo: Io = {
  out: (l) => void process.stdout.write(`${l}\n`),
  err: (l) => void process.stderr.write(`${l}\n`),
};

function usage(io: Io): void {
  io.err('Usage: sv-playbook <command> [args]');
  io.err('');
  io.err('Commands:');
  for (const c of commands) io.err(`  ${c.name.padEnd(12)} ${c.summary}`);
}

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  const [name, ...args] = argv;
  if (name === undefined || name === '--help' || name === '-h') {
    usage(io);
    return EXIT.USAGE;
  }
  const command = commands.find((c) => c.name === name);
  if (command === undefined) {
    io.err(`Unknown command: ${name}`);
    usage(io);
    return EXIT.USAGE;
  }
  try {
    return await command.run(args, io);
  } catch (error) {
    io.err(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.SYSTEM;
  }
}
```

`bin/sv-playbook.js`:
```js
#!/usr/bin/env node
import { main } from '../dist/cli/main.js';

const code = await main(process.argv.slice(2));
process.exit(code);
```

Delete `src/placeholder.ts` if present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run verify`
Expected: PASS, 2 tests. Then smoke-check the bin: `node bin/sv-playbook.js` → prints usage, exit code 2 (`echo $LASTEXITCODE` on PowerShell → `2`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(cli): entry point, command registry, usage with exit code contract"
```

---

### Task 4: `docs` command — serve process docs from the package

**Files:**
- Create: `src/content.ts`, `src/cli/commands/docs.ts`, `content/.gitkeep` (removed in Task 5 when real content lands)
- Modify: `src/cli/registry.ts`
- Test: `src/content.test.ts`, `src/cli/commands/docs.test.ts`

**Interfaces:**
- Consumes: `Command`, `Io`, `EXIT` from `src/cli/command.ts` (Task 3).
- Produces (used by later plans — `grill` and templates also read package content):

```ts
// src/content.ts
export function contentDir(): string;                       // absolute path to the package's content/ dir
export function listTopics(): Promise<string[]>;            // e.g. ["principles", "cli"] — recursive, posix-style ids like "wizard/intake"
export function readTopic(topic: string): Promise<string | undefined>; // undefined if not found; rejects path traversal
```

- [ ] **Step 1: Write the failing tests**

`src/content.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTopicsIn, readTopicIn } from './content.js';

async function makeContent(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'svp-content-'));
  await writeFile(join(dir, 'principles.md'), '# Principles\nPRINCIPLE-001');
  await mkdir(join(dir, 'wizard'), { recursive: true });
  await writeFile(join(dir, 'wizard', 'intake.md'), '# Intake');
  return dir;
}

test('listTopicsIn returns recursive posix-style topic ids without extension', async () => {
  const dir = await makeContent();
  assert.deepEqual(await listTopicsIn(dir), ['principles', 'wizard/intake']);
});

test('readTopicIn returns file content for a topic id', async () => {
  const dir = await makeContent();
  const text = await readTopicIn(dir, 'wizard/intake');
  assert.equal(text, '# Intake');
});

test('readTopicIn returns undefined for missing topic', async () => {
  const dir = await makeContent();
  assert.equal(await readTopicIn(dir, 'nope'), undefined);
});

test('readTopicIn rejects path traversal', async () => {
  const dir = await makeContent();
  assert.equal(await readTopicIn(dir, '../secrets'), undefined);
  assert.equal(await readTopicIn(dir, 'wizard/../../x'), undefined);
});
```

`src/cli/commands/docs.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../main.js';
import type { Io } from '../command.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

test('docs with unknown topic lists available topics and exits 2', async () => {
  const io = fakeIo();
  const code = await main(['docs', 'no-such-topic'], io);
  assert.equal(code, 2);
  assert.ok(io.errLines.join('\n').includes('Unknown topic'));
});

test('docs is a registered command (usage lists it)', async () => {
  const io = fakeIo();
  await main([], io);
  assert.ok(io.errLines.join('\n').includes('docs'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `./content.js` / `docs` not registered.

- [ ] **Step 3: Implement `src/content.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';

export function contentDir(): string {
  // dist/content.js -> package root -> content/
  return join(dirname(dirname(fileURLToPath(import.meta.url))), 'content');
}

export async function listTopicsIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: false });
  return entries
    .map(String)
    .filter((e) => e.endsWith('.md'))
    .map((e) => e.replaceAll(sep, '/').replace(/\.md$/, ''))
    .sort();
}

export async function readTopicIn(dir: string, topic: string): Promise<string | undefined> {
  const target = resolve(dir, `${topic}.md`);
  if (!target.startsWith(resolve(dir) + sep)) return undefined; // traversal guard
  try {
    return await readFile(target, 'utf8');
  } catch {
    return undefined;
  }
}

export function listTopics(): Promise<string[]> {
  return listTopicsIn(contentDir());
}

export function readTopic(topic: string): Promise<string | undefined> {
  return readTopicIn(contentDir(), topic);
}
```

- [ ] **Step 4: Implement `src/cli/commands/docs.ts` and register it**

```ts
import { EXIT, type Command } from '../command.js';
import { listTopics, readTopic } from '../../content.js';

export const docsCommand: Command = {
  name: 'docs',
  summary: 'Print a playbook process document (list topics when no argument)',
  async run(args, io) {
    const [topic] = args;
    if (topic === undefined) {
      io.out('Available topics:');
      for (const t of await listTopics()) io.out(`  ${t}`);
      return EXIT.OK;
    }
    const text = await readTopic(topic);
    if (text === undefined) {
      io.err(`Unknown topic: ${topic}`);
      io.err('Available topics:');
      for (const t of await listTopics()) io.err(`  ${t}`);
      return EXIT.USAGE;
    }
    io.out(text);
    return EXIT.OK;
  },
};
```

`src/cli/registry.ts` becomes:
```ts
import type { Command } from './command.js';
import { docsCommand } from './commands/docs.js';

export const commands: readonly Command[] = [docsCommand];
```

Create empty `content/.gitkeep` so `contentDir()` exists at runtime.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run verify`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(cli): docs command serves package content with traversal guard"
```

---

### Task 5: First real constitution content — principles and CLI guide

**Files:**
- Create: `content/principles.md`, `content/cli.md`
- Delete: `content/.gitkeep`
- Test: `src/cli/commands/docs-content.test.ts`

**Interfaces:**
- Consumes: `readTopic` (Task 4).
- Produces: topics `principles` and `cli` — cited by AGENTS.md mirrors in Plan 4.

- [ ] **Step 1: Write the failing test**

`src/cli/commands/docs-content.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTopic } from '../../content.js';

test('principles topic contains all eight principle IDs', async () => {
  const text = await readTopic('principles');
  assert.ok(text !== undefined);
  for (let i = 1; i <= 8; i++) {
    assert.ok(text.includes(`PRINCIPLE-00${i}`), `missing PRINCIPLE-00${i}`);
  }
});

test('cli topic documents the docs command and exit codes', async () => {
  const text = await readTopic('cli');
  assert.ok(text !== undefined);
  assert.ok(text.includes('sv-playbook docs'));
  assert.ok(text.includes('exit code'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `readTopic('principles')` returns undefined.

- [ ] **Step 3: Write `content/principles.md`**

Port §4 of `docs/specs/2026-07-07-sv-playbook-design.md` verbatim into a standalone document with this exact structure: H1 `# Principles`, one H2 per principle in the form `## PRINCIPLE-001 — Determinism first`, body text copied from the spec section (all eight, IDs PRINCIPLE-001 through PRINCIPLE-008). No content changes — the spec is the source; this is a packaging move.

- [ ] **Step 4: Write `content/cli.md`**

Exact content:

```markdown
# CLI Guide — when and why to use each command

This guide is the single source for agent-facing CLI usage. Harness skills
and the MCP wrapper derive from it; do not duplicate its content elsewhere.

## Exit codes (all commands)

| Code | Meaning |
| ---- | ------- |
| 0 | OK |
| 1 | Gate failure — a playbook rule was violated; the output cites the rule ID |
| 2 | Usage error or incomplete input — fix the invocation, do not retry blindly |
| 3 | System error — report it; do not work around it |

## Commands

### `sv-playbook docs [topic]`

When: at session start, or whenever the process for the current phase is
unclear. Without argument, lists topics. With a topic id (e.g.
`principles`, `cli`), prints that document.

Why: process docs live in the package, not in your project. Never copy
them into the repo; read them on demand.

Further commands (`init`, `adopt`, `grill`, `check`, `task`, `agent`,
`describe`, `upgrade`) are added by later plans; each adds its section
here in the same format. This guide documents only implemented commands.
```

- [ ] **Step 5: Delete `content/.gitkeep`, run tests to verify they pass**

Run: `npm run verify`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs(content): principles (PRINCIPLE-001..008) and CLI guide served via docs command"
```

---

### Task 6: README and PR

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write `README.md`**

Exact content:

```markdown
# sv-playbook

An end-to-end methodology for building software with AI agents — from raw
idea to finished product — packaged as a markdown constitution plus a
verifier CLI. Agent-agnostic, project-agnostic, deterministic wherever
possible.

**Status: pre-release. The design is stable; the CLI is under construction.**

## Why

Everything that works with agents is mechanized; everything left as prose
gets violated. The playbook is two layers with a hard boundary:

- **The constitution** — process documents and templates (this package's
  `content/`). Gives capable models judgment.
- **The police** — this CLI. Verifies, scaffolds, and tracks state. It
  verifies; it never decides.

Design spec: [`docs/specs/2026-07-07-sv-playbook-design.md`](docs/specs/2026-07-07-sv-playbook-design.md)

## Use

```sh
npx sv-playbook docs            # list process topics
npx sv-playbook docs principles # read the principles
npx sv-playbook docs cli        # when/why for each command
```

## Development

Node >= 22.13. `npm install`, then `npm run verify` (typecheck + lint +
build + tests). CI runs the same on Windows and Linux.

## License

MIT
```

- [ ] **Step 2: Run full verify**

Run: `npm run verify`
Expected: PASS.

- [ ] **Step 3: Commit and open PR**

```bash
git add README.md
git commit -m "docs: README with thesis, usage and development setup"
git push -u origin feature/P1-foundation
gh pr create --title "P1: foundation, CLI skeleton, docs command" --body "Implements Plan 1 (docs/plans/2026-07-07-p1-foundation-cli-docs.md). Verify green on Windows+Linux CI. Human review required before merge."
```

Stop after opening the PR. Human review is mandatory (spec §13).
