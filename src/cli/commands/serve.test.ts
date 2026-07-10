import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import http from 'node:http';
import { main } from '../main.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { readBoardStatus } from '../../status/status.js';

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

test('serve command is registered', async () => {
  await inTempRepo(async () => {
    const io = fakeIo();
    const code = await main(['serve', '--help'], io);
    assert.notEqual(code, EXIT.USAGE, 'serve should be a registered command');
  });
});

test('serve /api/board returns the live board state', async () => {
  await inTempRepo(async () => {
    await writeFile('body.md', 'Do it.\n');
    const setupIo = fakeIo();
    await main(['task', 'create', '--id', 'SV-001', '--title', 'Serve One', '--write', 'src/**', '--body-file', 'body.md'], setupIo);
    await main(['task', 'move', 'SV-001', 'ready'], setupIo);

    const repoRoot = commonRoot(process.cwd());

    function handle(req: IncomingMessage, res: ServerResponse): void {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/api/board') {
        const store = openStore(repoRoot);
        try {
          const board = readBoardStatus(store, repoRoot);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(board));
        } finally {
          store.close();
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    }

    const port = await freePort();
    const server = createServer(handle);
    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, () => { resolve(); });
    });

    try {
      const body = await httpGet(`http://localhost:${port}/api/board`);
      const parsed: unknown = JSON.parse(body);
      assert.ok(isRecord(parsed));
      assert.ok(isRecord(parsed.counts));
      assert.ok(Array.isArray(parsed.packets));
      assert.ok(isRecord(parsed.backup));
      assert.equal(parsed.counts.ready, 1);
      assert.ok(body.includes('SV-001'), 'response should include packet SV-001');
      assert.ok(body.includes('Serve One'), 'response should include title Serve One');
    } finally {
      server.close();
    }
  });
});
