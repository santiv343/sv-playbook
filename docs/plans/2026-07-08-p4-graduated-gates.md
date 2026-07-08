# Plan 4: Graduated Gates & Reviewer Checklist

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every code rule that CAN be validated deterministically becomes a lint gate in this repo, now. Everything that cannot becomes an explicit reviewer checklist served by `docs review` — validated by a human (or reviewer agent) on every PR. No rule lives only in anyone's memory.

**Architecture:** Two artifacts: (1) an expanded `eslint.config.js` (the mechanical gates), (2) `content/review.md` (the judgment checklist, pinned by a content test like `cli.md`). devDependency `eslint-plugin-sonarjs` is allowed — the zero-dependency rule applies to RUNTIME deps only (`dependencies` stays empty).

## Global Constraints

- Plans 1–3 Global Constraints apply. Autonomy `standard` with recorded DEVIATIONs.
- Write-set: `eslint.config.js`, `package.json`, `package-lock.json`, `content/review.md`, `content/cli.md`, `src/cli/commands/docs-content.test.ts`, plus any `src/**` file that must change to satisfy the new gates (fixing violations is in scope; record each fixed file in the PR description).
- Branch: `feature/P4-graduated-gates`. Base: main AFTER PR #3 merges. PR to `main`; stop after opening it.

---

### Task 1: Mechanical gates in ESLint

**Files:** Modify `eslint.config.js`, `package.json` (devDep `eslint-plugin-sonarjs@^3`), fix violations in `src/**`.

- [ ] **Step 1:** `npm install --save-dev eslint-plugin-sonarjs` (lockfile updates).
- [ ] **Step 2:** Add to the typed block of `eslint.config.js` (import `sonarjs from 'eslint-plugin-sonarjs'`; add `plugins: { sonarjs }` to the typed block):

```js
      // Graduated from user taste — each rule cites its origin.
      // taste: split-before-exceed size discipline
      'max-lines': ['error', { max: 350, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      // taste: one responsibility, low branching
      'complexity': ['error', 12],
      'max-depth': ['error', 3],
      // taste: single-source contractual strings (production code)
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
      // taste: no mutable shared state reached via process globals in production code
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'chdir', message: 'pass directories as parameters instead' },
      ],
```

- [ ] **Step 3:** Add a test-file override AFTER the typed block (tests may repeat literals — they pin contracts deliberately — and may be longer):

```js
  {
    files: ['**/*.test.ts'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      'max-lines-per-function': 'off',
      'no-restricted-properties': 'off',
    },
  },
```

- [ ] **Step 4:** Run `npm run verify`. Fix every violation the new gates surface in `src/**` (smaller functions, extracted constants — never suppressions or rule weakening). List each fixed file in the PR description.
- [ ] **Step 5:** Commit — `feat(lint): graduate size, complexity, duplicate-string and chdir rules from taste`

---

### Task 2: The reviewer checklist as a served document

**Files:** Create `content/review.md`; modify `content/cli.md` (one pointer line in the docs section), `src/cli/commands/docs-content.test.ts`.

- [ ] **Step 1:** Create `content/review.md` with exactly these sections (this is the judgment layer — everything here is NOT mechanically checkable, which is WHY it is here):

```markdown
# Reviewer Checklist

Run on EVERY pull request, in full, by the human or reviewer agent. Items
here cannot be validated mechanically — that is why they exist. Anything
that becomes mechanizable graduates to a lint/gate and leaves this list.

## Code judgment
- [ ] Names say what things are; an outsider understands each public name at sight.
- [ ] Dispatch/branching uses lookup tables once past ~3 branches.
- [ ] No reinvented wheels: prefer stdlib/established solutions within the dependency policy.
- [ ] Abstractions are earned: no speculative interfaces, wrappers, or "just in case" layers.
- [ ] Errors expected by contract return codes/results; broken invariants throw.

## Test quality (anti TDD-theater)
- [ ] Each RED test fails for the named functional cause, not incidentally.
- [ ] Tests would catch a plausible regression (not vacuous, not tautological).
- [ ] Edge and failure paths outweigh happy paths in new coverage.

## Scope and evidence
- [ ] Diff stays inside the declared write-set; every DEVIATION is recorded with rationale.
- [ ] Evidence quotes literal command output; SHAs come from git, not memory.
- [ ] Docs the change makes stale are updated in the same PR.

## Taste pass
- [ ] Read the user's global + project taste files; flag anything that violates
      an entry, and propose new taste entries for corrections the review makes.
```

- [ ] **Step 2:** Append to `docs-content.test.ts`:

```ts
test('review topic exists with the four checklist sections', async () => {
  const text = await readTopic('review');
  assert.ok(text !== undefined);
  for (const s of ['Code judgment', 'Test quality', 'Scope and evidence', 'Taste pass']) {
    assert.ok(text.includes(s), `missing ${s}`);
  }
});
```

- [ ] **Step 3:** In `content/cli.md`, docs section, add: `The reviewer checklist lives at \`sv-playbook docs review\` and runs in full on every PR.`
- [ ] **Step 4:** `npm run verify` — PASS. Commit — `docs(content): reviewer checklist as served document`
- [ ] **Step 5:** Push, open PR titled "P4: graduated gates and reviewer checklist", body citing this plan + fixed-files list + DEVIATIONs. Stop. Report SHA, verify output, DEVIATION list.
