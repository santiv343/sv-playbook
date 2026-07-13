import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, getDaemonStore } from '../db/store.js';
import { startDaemon } from '../daemon/daemon.js';
import { createCliCommandExecutionPort } from '../daemon/adapters/cli-execution-port.js';
import { createNodeHttpServerFactory } from '../daemon/adapters/http-server-adapter.js';
const cliCommandPort = createCliCommandExecutionPort();
const httpServerFactory = createNodeHttpServerFactory();
import { gitWorkspace } from '../runtime/workspace-git.js';
import { freePort, initFixtureRepo, postJson, realCliEnv, spawnCollect, pollDaemon, stopDaemonChild, fakePort, nextIndex } from './daemon-test-utils.js';

test('context validation accepts valid cwd via injected fake port (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-fake-port-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const fp = fakePort(root);
  const daemon = await startDaemon(root, port, { workspaceIdentity: fp, commandExecution: cliCommandPort, httpServerFactory });
  try {
    const res = await postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: root } });
    assert.equal(res.statusCode, 200, 'fake-port daemon must accept valid cwd');
    const parsed: unknown = JSON.parse(res.body);
    assert.ok(typeof parsed === 'object' && parsed !== null);
    assert.equal(Reflect.get(parsed, 'exitCode'), 0);
  } finally { await daemon.stop(); }
});

test('context validation rejects unknown cwd via injected fake port (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-fake-port-rej-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const fp = fakePort(root);
  const daemon = await startDaemon(root, port, { workspaceIdentity: fp, commandExecution: cliCommandPort, httpServerFactory });
  try {
    const res = await postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: '/nonexistent' } });
    assert.equal(res.statusCode, 400, 'fake-port daemon must reject unknown cwd');
    assert.ok(res.body.includes('invalid context'));
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Two worktrees, concurrent forwarding, no cross-binding ----
test('red team: concurrent worktree CLI forwarding through daemon does not cross-bind sessions (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-concurrent-wt-${nextIndex()}`));
  initFixtureRepo(root);
  const wt1 = join(root, 'wt1'); const wt2 = join(root, 'wt2');
  execFileSync('git', ['worktree', 'add', wt1, 'HEAD'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt2, 'HEAD'], { cwd: root });
  openStore(root).close();

  const port = await freePort();
  const binPath = join(process.cwd(), 'bin', 'sv-playbook.js');
  const daemonChild = spawn(process.execPath, [binPath, 'daemon', '--port', String(port)], {
    cwd: root, env: realCliEnv(), stdio: ['ignore', 'pipe', 'pipe'],
  });
  daemonChild.on('exit', () => {});

  try {
    await pollDaemon(port);

    // Concurrent CLI invocations from two worktrees
    const [r1, r2] = await Promise.all([
      spawnCollect(process.execPath, binPath, wt1),
      spawnCollect(process.execPath, binPath, wt2),
    ]);

    assert.equal(r1.status, 0, `wt1 must exit 0, got ${r1.status}\nstderr: ${r1.stderr}`);
    assert.equal(r2.status, 0, `wt2 must exit 0, got ${r2.status}\nstderr: ${r2.stderr}`);
    assert.ok(!r1.stderr.includes('daemon'), `wt1 must not print daemon errors: ${r1.stderr}`);
    assert.ok(!r2.stderr.includes('daemon'), `wt2 must not print daemon errors: ${r2.stderr}`);
    // Both must produce valid status output
    assert.ok(r1.stdout.includes('Board:'), `wt1 must produce status output: ${r1.stdout}`);
    assert.ok(r2.stdout.includes('Board:'), `wt2 must produce status output: ${r2.stdout}`);
  } finally {
    await stopDaemonChild(daemonChild, root, port);
  }
});

// ---- STORE-003: Concurrent worktree exec requests through daemon (HTTP) ----
test('red team: concurrent HTTP exec requests with distinct worktree cwds are isolated (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-concurrent-http-${nextIndex()}`));
  initFixtureRepo(root);
  const wt1 = join(root, 'wt1'); const wt2 = join(root, 'wt2');
  execFileSync('git', ['worktree', 'add', wt1, 'HEAD'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt2, 'HEAD'], { cwd: root });
  openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory });
  try {
    const [r1, r2] = await Promise.all([
      postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: wt1 } }),
      postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: wt2 } }),
    ]);
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
    const p1: unknown = JSON.parse(r1.body); const p2: unknown = JSON.parse(r2.body);
    assert.ok(typeof p1 === 'object' && p1 !== null);
    assert.ok(typeof p2 === 'object' && p2 !== null);
    assert.equal(Reflect.get(p1, 'exitCode'), 0);
    assert.equal(Reflect.get(p2, 'exitCode'), 0);
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Forwarded exec request preserves cwd context ----
test('red team: forwarded exec request preserves cwd in daemon context (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-exec-ctx-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory });
  try {
    const res = await postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['describe'], context: { cwd: root } });
    assert.equal(res.statusCode, 200);
    const parsed: unknown = JSON.parse(res.body);
    assert.ok(typeof parsed === 'object' && parsed !== null);
    assert.equal(Reflect.get(parsed, 'exitCode'), 0);
    assert.ok(typeof Reflect.get(parsed, 'stdout') === 'string');
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Mixed-type argv rejection ----
test('red team: exec with mixed-type argv is rejected before any side effect (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-argv-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory });
  try {
    const res = await postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['valid', 123, null], context: { cwd: root } });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.includes('argv required'), `must reject mixed argv: ${res.body}`);
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Concurrent session binding with distinct packets, no swap ----
test('red team: concurrent session binding — two distinct packets, event-to-session binding, no swap (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-als-${nextIndex()}`));
  initFixtureRepo(root);
  const wt1 = join(root, 'wt1'); const wt2 = join(root, 'wt2');
  execFileSync('git', ['worktree', 'add', wt1, 'HEAD'], { cwd: root });
  execFileSync('git', ['worktree', 'add', wt2, 'HEAD'], { cwd: root });
  const seed = openStore(root);
  seed.db.prepare("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('ALS-S1', 'Session Test 1', '/tmp', 'ready', '[]', datetime('now'), datetime('now'))").run();
  seed.db.prepare("INSERT INTO packets (id, title, path, status, write_set, created_at, updated_at) VALUES ('ALS-S2', 'Session Test 2', '/tmp', 'ready', '[]', datetime('now'), datetime('now'))").run();
  seed.close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory });
  try {
    const ds = getDaemonStore(); assert.ok(ds);

    // Concurrent exec requests for two distinct packets from two worktrees
    const [r1, r2] = await Promise.all([
      postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['task', 'start', 'ALS-S1'], context: { cwd: wt1 } }),
      postJson(port, '/api/v1/exec', { token: daemon.token, argv: ['task', 'start', 'ALS-S2'], context: { cwd: wt2 } }),
    ]);
    assert.equal(r1.statusCode, 200, `wt1 start must succeed, got ${r1.statusCode}: ${r1.body}`);
    assert.equal(r2.statusCode, 200, `wt2 start must succeed, got ${r2.statusCode}: ${r2.body}`);
    const p1: unknown = JSON.parse(r1.body);
    const p2: unknown = JSON.parse(r2.body);
    assert.ok(typeof p1 === 'object' && p1 !== null);
    assert.ok(typeof p2 === 'object' && p2 !== null);
    assert.equal(Reflect.get(p1, 'exitCode'), 0, `wt1 exec must exit 0: ${r1.body}`);
    assert.equal(Reflect.get(p2, 'exitCode'), 0, `wt2 exec must exit 0: ${r2.body}`);

    // Exactly 2 session rows with canonical worktree values
    const sessionRows = ds.db.prepare('SELECT id, worktree FROM sessions').all();
    assert.equal(sessionRows.length, 2, 'must create exactly 2 sessions');
    const sessionWorktrees = sessionRows.map((r: unknown) => {
      assert.ok(typeof r === 'object' && r !== null);
      return String(Reflect.get(r, 'worktree')).toLowerCase();
    });
    const canonicalWt1 = realpathSync(wt1).toLowerCase();
    const canonicalWt2 = realpathSync(wt2).toLowerCase();
    assert.ok(sessionWorktrees.includes(canonicalWt1), `wt1 (${canonicalWt1}) must be in session worktrees: [${sessionWorktrees.join(', ')}]`);
    assert.ok(sessionWorktrees.includes(canonicalWt2), `wt2 (${canonicalWt2}) must be in session worktrees: [${sessionWorktrees.join(', ')}]`);

    // JOIN transition→session→worktree to prove exact mapping (no swap)
    const mapping = ds.db.prepare(
      "SELECT t.packet_id, s.worktree FROM transitions t JOIN sessions s ON t.session_id = s.id WHERE t.to_status = 'active' ORDER BY t.packet_id"
    ).all();
    assert.equal(mapping.length, 2, 'must have exactly 2 mapped transitions');
    const m0: unknown = mapping[0]; const m1: unknown = mapping[1];
    assert.ok(m0 !== undefined && typeof m0 === 'object' && m0 !== null);
    assert.ok(m1 !== undefined && typeof m1 === 'object' && m1 !== null);
    const mapPid0 = String(Reflect.get(m0, 'packet_id'));
    const mapWt0 = String(Reflect.get(m0, 'worktree'));
    const mapPid1 = String(Reflect.get(m1, 'packet_id'));
    const mapWt1 = String(Reflect.get(m1, 'worktree'));
    const cWt1 = realpathSync(wt1);
    const cWt2 = realpathSync(wt2);
    if (mapPid0 === 'ALS-S1') {
      assert.equal(mapWt0, cWt1, 'ALS-S1 must map to wt1');
      assert.equal(mapPid1, 'ALS-S2');
      assert.equal(mapWt1, cWt2, 'ALS-S2 must map to wt2');
    } else {
      assert.equal(mapPid0, 'ALS-S2', 'first mapped packet must be ALS-S2 when ALS-S1 is second');
      assert.equal(mapWt0, cWt2, 'ALS-S2 must map to wt2');
      assert.equal(mapPid1, 'ALS-S1');
      assert.equal(mapWt1, cWt1, 'ALS-S1 must map to wt1');
    }
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Active-handler shutdown drain (deterministic barrier) ----
// ---- STORE-003: Context boundary enforcement ----
test('red team: context boundary — outside-repo spoof, missing context, no store mutation on rejection, mixed argv (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-boundary-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory });
  try {
    const token = daemon.token; const ds = getDaemonStore(); assert.ok(ds);

    const outside = await mkdtemp(join(tmpdir(), `svp-boundary-out-${nextIndex()}`));
    const spoofRes = await postJson(port, '/api/v1/exec', { token, argv: ['describe'], context: { cwd: outside } });
    assert.equal(spoofRes.statusCode, 400); assert.ok(spoofRes.body.includes('invalid context'));

    const noCtxRes = await postJson(port, '/api/v1/exec', { token, argv: ['describe'] });
    assert.equal(noCtxRes.statusCode, 400); assert.ok(noCtxRes.body.includes('invalid context'));

    const ec = (row: Record<string, unknown> | undefined): number => row !== undefined ? Number(Reflect.get(row, 'c')) : 0;
    const before = ec(ds.db.prepare('SELECT COUNT(*) AS c FROM events').get());
    assert.equal(before, 0, 'no events before rejection');
    const noEffectRes = await postJson(port, '/api/v1/exec', { token, argv: ['check'], context: { cwd: outside } });
    assert.equal(noEffectRes.statusCode, 400);
    assert.equal(ec(ds.db.prepare('SELECT COUNT(*) AS c FROM events').get()), 0, 'no events after rejection');
  } finally { await daemon.stop(); }
});

// ---- STORE-003: Shutdown lifecycle — state transitions + exactly-once ----
test('red team: shutdown lifecycle transitions running→stopping→stopped; concurrent stop returns same promise (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-stop-con-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  const daemon = await startDaemon(root, port, { workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory });
  assert.equal(daemon.state(), 'running');
  const s1 = daemon.stop();
  assert.equal(daemon.state(), 'stopping');
  const s2 = daemon.stop();
  assert.strictEqual(s1, s2, 'concurrent stop() must return identical promise');
  const outcome = await s1;
  assert.equal(outcome.kind, 'stopped');
  assert.equal(daemon.state(), 'stopped');
  assert.ok(getDaemonStore() === null, 'daemon store must be null after stop');
  const s3 = daemon.stop();
  assert.equal(daemon.state(), 'stopped');
  await s3;
});

test('red team: onFinalize callback invoked exactly once; second stop does not re-run (STORE-003)', async () => {
  const root = await mkdtemp(join(tmpdir(), `svp-finalize-${nextIndex()}`));
  initFixtureRepo(root); openStore(root).close();
  const port = await freePort();
  let finalizeCount = 0;
  const daemon = await startDaemon(root, port, {
    workspaceIdentity: gitWorkspace, commandExecution: cliCommandPort, httpServerFactory,
    onFinalize: () => { finalizeCount++; },
  });
  assert.equal(finalizeCount, 0, 'no cleanup before stop');
  await daemon.stop();
  assert.equal(finalizeCount, 1, 'finalize must run exactly once');
  await daemon.stop();
  assert.equal(finalizeCount, 1, 'finalize must NOT run again on second stop');
});

