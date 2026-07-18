# Serve Shutdown Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Closing the daemon via its `/api/v1/shutdown` HTTP route must
not leave the `serve` operations console (port 3131) running as an
orphaned process — closing IDEA-065, which happened twice in one real
session (operator had to manually `taskkill` the pid before relaunching
`serve`).

**Architecture:** Confirmed by reading the code: when `sv-playbook serve`
starts a daemon itself (`src/cli/commands/serve.ts:59`,
`daemon = await startDaemon(...)`), SIGINT/SIGTERM ARE already wired to
close both the HTTP console server and the daemon cleanly
(`serve.ts:66-89`). The gap is the OTHER topology: a daemon already
running as its own separate process (started earlier via
`sv-playbook daemon`, or a previous still-alive `serve`), where calling
`/api/v1/shutdown` against that daemon's port stops the daemon but never
reaches the separate `serve` process holding port 3131. This plan's first
task is confirming that topology live, not assuming it — the fix depends
on which one is real.

**Tech Stack:** TypeScript (strict), Node's `node:http`.

## Global Constraints

- Do not build a fix before Task 1 confirms the actual failure mode live
  — the architecture note above is this session's best reading of the
  code, not a verified reproduction.
- Whatever fix ships must not weaken the existing SIGINT/SIGTERM path in
  `serve.ts:66-89`, which already works correctly for the single-process
  case.
- Run `npm run verify` after every task.
- Every task is RED-first, per this repo's own `PRINCIPLE-002`, except
  Task 1 which is a live reproduction, not a unit test — the RED-first
  discipline resumes at Task 2 once the real bug is confirmed.

## Verified state (2026-07-18)

- `serve.ts:59-89` already handles the daemon-started-by-this-process
  case correctly.
- `daemon.ts:166-189` handles `/api/v1/shutdown` by calling
  `shutdown.initiate()` — this is internal to whichever process is
  running the daemon; it has no mechanism to notify a separate process.
- `DAEMON_ROUTE.SHUTDOWN` is the route constant (confirm exact import
  path via `daemon.constants.ts` before writing code).

---

### Task 1: Reproduce the real failure mode live

**Files:** none — this is a manual reproduction, not a code change.

- [ ] **Step 1: Start the daemon as its own process**

```bash
node bin/sv-playbook.js daemon &
```

- [ ] **Step 2: In a separate terminal, start `serve`**

```bash
node bin/sv-playbook.js serve
```

Observe: does `serve.ts`'s `startDaemon()` call spawn a second daemon, or
does it detect the running one and attach as a client? Read
`startDaemon`'s implementation if the behavior isn't obvious from
watching stdout.

- [ ] **Step 3: Call the shutdown endpoint directly against the daemon's port**

```bash
curl -X POST http://127.0.0.1:4141/api/v1/shutdown -H "Authorization: Bearer <token from .svp-session or wherever the daemon token lives>"
```

(Find the real auth requirement by reading `daemon.ts`'s `handleRequest`
— don't guess the header shape.)

- [ ] **Step 4: Check whether port 3131 is still listening**

```bash
netstat -ano | findstr :3131
```

If it's still listening after the daemon shut down, the bug is
reproduced exactly as IDEA-065 describes — proceed to Task 2 with this
confirmed. If it closed cleanly, the bug may already be fixed
incidentally by earlier work this session — STOP and report that instead
of inventing a fix for a bug that no longer reproduces.

---

### Task 2: Fix the confirmed gap

**Files:** depends entirely on what Task 1 found — likely
`src/serve/server.ts` and/or `src/daemon/daemon.ts`, possibly a new
`serve stop` CLI subcommand if the two-process topology is confirmed and
there's no way for the daemon to reach into a separate process's HTTP
server.

**This task cannot be written in more detail until Task 1's finding is
known — do not skip Task 1 and guess at Task 2's implementation.** If the
two-process case is confirmed, the two realistic fixes are:
(a) the `serve` process's HTTP console periodically polls the daemon's
health/shutdown state and self-closes when it detects the daemon is
gone, or (b) a `serve stop` command that finds and terminates the process
holding port 3131 by PID, mirroring `destructive-gate.ts`'s existing
pattern for identifying live processes. Pick based on what's simplest
given Task 1's actual finding, write the RED-first test for whichever is
chosen, then implement.

- [ ] **Step 1: Write the failing test matching Task 1's confirmed bug**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Re-run Task 1's live reproduction to confirm the real bug is gone, not just the unit test**
- [ ] **Step 6: Run full verify and commit**

```bash
npm run verify
git commit -m "fix(serve): close the operations console when the daemon it depends on shuts down (IDEA-065)"
```

---

## Self-Review

**Spec coverage:** IDEA-065 — Task 1 confirms the exact failure mode
(this session could not fully pin the two-process topology from static
reading alone), Task 2 fixes whatever Task 1 finds.

**Known gap, intentional:** this plan deliberately does not prescribe
Task 2's exact code because doing so without Task 1's live confirmation
would be exactly the kind of unverified guess this session has
repeatedly had to correct — better to leave it open than to hand the
implementer a wrong assumption dressed as a finished design.
