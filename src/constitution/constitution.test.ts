import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { main } from '../cli/main.js';
import { EXIT } from '../cli/command.constants.js';
import { openStore } from '../db/store.js';
import type { Io } from '../cli/command.types.js';
import { getSection } from './constitution.js';
import { initTestRepo } from '../testkit.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (line) => void outLines.push(line), err: (line) => void errLines.push(line) };
}

async function inTempRepo<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-constitution-'));
  initTestRepo(root);
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn(root);
  } finally {
    process.chdir(previous);
  }
}

test('constitution set then show round-trips the vision through the store', async () => {
  await inTempRepo(async (root) => {
    const bodyContent = 'Our vision is to build the best developer tools.';
    const bodyPath = join(root, 'vision-body.txt');
    await writeFile(bodyPath, bodyContent, 'utf8');

    openStore(root).close();

    const setIo = fakeIo();
    const setCode = await main(['constitution', 'set', 'vision', '--body-file', bodyPath], setIo);
    assert.equal(setCode, EXIT.OK, setIo.errLines.join('\n'));

    const store = openStore(root);
    const stored = getSection(store, 'vision');
    store.close();
    assert.ok(stored !== null, 'stored vision must not be null');
    assert.ok(stored.body.includes(bodyContent), `stored body must include original content; got: ${stored.body}`);

    const showIo = fakeIo();
    const showCode = await main(['constitution', 'show', 'vision'], showIo);
    assert.equal(showCode, EXIT.OK, showIo.errLines.join('\n'));
    assert.ok(showIo.outLines.some((line) => line.includes(bodyContent)),
      'show output must include the original vision body');

    const exportPath = join(root, 'docs', 'constitution', 'vision.md');
    assert.ok(existsSync(exportPath), `generated export must exist at ${exportPath}`);
    const exported = await readFile(exportPath, 'utf8');
    assert.ok(exported.includes(bodyContent), 'exported file must include the original vision body');
  });
});

test('constitution reports unexpected command failures as actionable system errors', async () => {
  await inTempRepo(async () => {
    const io = fakeIo();
    const code = await main(['constitution', 'set', 'vision', '--body-file', 'missing-body.md'], io);

    assert.equal(code, EXIT.SYSTEM);
    assert.match(io.errLines.join('\n'), /error: ENOENT:/);
  });
});
