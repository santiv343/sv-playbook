import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import http from 'node:http';
import { main } from '../main.js';
import type { Io } from '../command.types.js';
import { commands } from '../registry.js';
import { commonRoot, openStore } from '../../db/store.js';
import { SERVE_ROUTE } from './serve.constants.js';
import { createOperationalServer } from '../../serve/server.js';
import { EVENT_NOTE } from '../../tasks/service.constants.js';
import { addArtifactContract } from '../../contracts/artifacts.js';
import { ARTIFACT_CONTRACT_STATUS } from '../../contracts/artifact.constants.js';
import { registerWorkflowDefinition } from '../../orchestration/service.js';
import { WORKFLOW_EXECUTOR, WORKFLOW_STATUS } from '../../orchestration/orchestration.constants.js';
import { command as serveCommand } from './serve.js';

const BIN_PATH = resolve('bin/sv-playbook.js');
const SERVER_START_TIMEOUT_MS = 15_000;
const SERVER_POLL_INTERVAL_MS = 50;
const LIVE_PACKET_ID = 'SV-001';
const LIVE_NOTE = 'forwarded while UI is live';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (line: string) => { outLines.push(line); }, err: (line: string) => { errLines.push(line); } };
}

async function inTempRepo<T>(fn: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-serve-'));
  execFileSync('git', ['init'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function productionEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(0, () => {
      const addr: ReturnType<typeof s.address> = s.address();
      let port = 0;
      if (typeof addr === 'object' && addr !== null && 'port' in addr) {
        port = addr.port;
      }
      s.close(() => { resolve(port); });
    });
  });
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    }).on('error', reject);
  });
}

function httpPost(url: string, value: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    });
    request.on('error', reject);
    request.end(JSON.stringify(value));
  });
}

async function waitForUrl(url: string): Promise<string> {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      return await httpGet(url);
    } catch {
      await new Promise<void>((resolveWait) => { setTimeout(resolveWait, SERVER_POLL_INTERVAL_MS); });
    }
  }
  throw new Error(`server did not become ready: ${url}`);
}

test('serve command is registered', () => {
  assert.ok(commands().some((candidate) => candidate.name === serveCommand.name));
});

test('operational server exposes the board, workflow dashboard, and local UI', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const setupIo = fakeIo();
    await main(['task', 'create', '--id', 'SV-001', '--title', 'Serve One', '--write', 'src/**', '--body-file', 'body.md'], setupIo);
    await main(['task', 'move', 'SV-001', 'ready'], setupIo);

    const repoRoot = commonRoot(process.cwd());

    const store = openStore(repoRoot);
    for (const ref of ['serve-input-v1', 'serve-output-v1']) {
      addArtifactContract(store, {
        ref, status: ARTIFACT_CONTRACT_STATUS.ACTIVE,
        schema: { type: 'object', additionalProperties: true },
      });
    }
    registerWorkflowDefinition(store, {
      id: 'serve-human', startStepKey: 'approve',
      steps: [{
        key: 'approve', executor: WORKFLOW_EXECUTOR.HUMAN, phase: 'approval',
        inputContractRef: 'serve-input-v1', outputContractRef: 'serve-output-v1', maxAttempts: 1,
      }],
      routes: [{ fromStepKey: 'approve', priority: 0 }],
    });
    store.db.prepare('INSERT INTO events (command, detail, at) VALUES (?, ?, ?)')
      .run(EVENT_NOTE, 'global event without a packet', new Date().toISOString());
    const port = await freePort();
    const server = createOperationalServer(store, repoRoot, { refreshMs: 1_000 });
    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, () => { resolve(); });
    });

    try {
      const body = await httpGet(`http://localhost:${port}${SERVE_ROUTE.BOARD}`);
      const parsed: unknown = JSON.parse(body);
      assert.ok(isRecord(parsed));
      assert.ok(isRecord(parsed.counts));
      assert.ok(Array.isArray(parsed.packets));
      assert.ok(isRecord(parsed.backup));
      assert.equal(parsed.counts.ready, 1);
      assert.ok(body.includes('SV-001'), 'response should include packet SV-001');
      assert.ok(body.includes('Serve One'), 'response should include title Serve One');

      const dashboardBody = await httpGet(`http://localhost:${port}${SERVE_ROUTE.DASHBOARD}`);
      const dashboard: unknown = JSON.parse(dashboardBody);
      assert.ok(isRecord(dashboard));
      assert.ok(isRecord(dashboard.board));
      assert.ok(isRecord(dashboard.workflow));

      const catalogBody = await httpGet(`http://localhost:${port}${SERVE_ROUTE.WORKFLOW_DEFINITIONS}`);
      const catalog: unknown = JSON.parse(catalogBody);
      assert.ok(Array.isArray(catalog));
      assert.equal(catalog.length, 1);
      assert.ok(isRecord(catalog[0]));
      assert.equal(catalog[0].inputContractRef, 'serve-input-v1');
      assert.ok(isRecord(catalog[0].inputSchema));

      const html = await httpGet(`http://localhost:${port}${SERVE_ROUTE.ROOT}`);
      assert.ok(html.includes('sv-playbook'));
      assert.ok(html.includes(SERVE_ROUTE.APP));

      const startedBody = await httpPost(`http://localhost:${port}${SERVE_ROUTE.WORKFLOWS}`, {
        definitionId: 'serve-human', definitionVersion: 1, subjectRef: 'test:serve', requestedBy: 'human:test',
        inputContractRef: 'serve-input-v1', input: { request: 'approve' },
      });
      const started: unknown = JSON.parse(startedBody);
      assert.ok(isRecord(started));
      assert.equal(started.status, WORKFLOW_STATUS.WAITING);
    } finally {
      await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
      store.close();
    }
  });
});

test('serve keeps UI reads and forwarded CLI mutations behind one store owner', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Observe one live mutation.\n');
    const setupIo = fakeIo();
    await main([
      'task', 'create', '--id', LIVE_PACKET_ID, '--title', 'Live owner', '--write', 'src/**', '--body-file', 'body.md',
    ], setupIo);
    const uiPort = await freePort();
    const daemonPort = await freePort();
    const child = spawn(process.execPath, [
      BIN_PATH, 'serve', '--port', String(uiPort), '--daemon-port', String(daemonPort),
    ], { cwd: process.cwd(), env: productionEnvironment(), stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });

    try {
      await waitForUrl(`http://127.0.0.1:${daemonPort}/api/v1/health`);
      await waitForUrl(`http://127.0.0.1:${uiPort}${SERVE_ROUTE.DASHBOARD}`);
      execFileSync(process.execPath, [BIN_PATH, 'task', 'note', LIVE_PACKET_ID, LIVE_NOTE], {
        cwd: process.cwd(),
        env: productionEnvironment(),
      });
      const raw = await httpGet(`http://127.0.0.1:${uiPort}${SERVE_ROUTE.DASHBOARD}`);
      const dashboard: unknown = JSON.parse(raw);
      assert.ok(isRecord(dashboard));
      const board = dashboard.board;
      assert.ok(isRecord(board));
      const packets: unknown = board.packets;
      assert.ok(isUnknownArray(packets));
      const packet = packets.find((value) => isRecord(value) && value.id === LIVE_PACKET_ID);
      assert.ok(isRecord(packet));
      assert.ok(isRecord(packet.lastEvent));
      assert.equal(packet.lastEvent.detail, LIVE_NOTE);
    } finally {
      child.kill();
      await new Promise<void>((resolveExit) => {
        if (child.exitCode !== null) resolveExit();
        else child.once('exit', () => { resolveExit(); });
      });
    }
    assert.equal(stderr, '');
  });
});
