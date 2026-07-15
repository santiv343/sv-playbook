import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';
import { main } from '../main.js';

function fakeIo(): Io & { readonly outLines: string[]; readonly errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (line) => void outLines.push(line), err: (line) => void errLines.push(line) };
}

test('workspace classify exposes deterministic path ownership as json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-workspace-command-'));
  execFileSync('git', ['init'], { cwd: root });
  await writeFile(join(root, '.gitignore'), '.svp/\n.svp-session\ndocs/packets/\n');
  execFileSync('git', ['add', '.gitignore'], { cwd: root });
  execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', 'initial'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);

  try {
    await writeFile(join(root, 'body.md'), 'body');
    const setupIo = fakeIo();
    assert.equal(await main(['task', 'create', '--id', 'WORK-001', '--title', 'Work', '--write', 'src/**', '--body-file', 'body.md'], setupIo), EXIT.OK);
    await writeFile(join(root, 'source.ts'), 'source');

    const io = fakeIo();
    assert.equal(await main(['workspace', 'classify', '--json'], io), EXIT.OK, io.errLines.join('\n'));
    const report: unknown = JSON.parse(io.outLines.join('\n'));
    assert.deepEqual(report, {
      paths: [
        { path: 'body.md', gitStatus: '??', ownership: 'orphan', owners: [] },
        { path: 'source.ts', gitStatus: '??', ownership: 'orphan', owners: [] },
      ],
      summary: { current: 0, planned: 0, 'multiple-non-terminal': 0, 'terminal-only': 0, orphan: 2 },
    });
  } finally {
    process.chdir(previous);
  }
});
