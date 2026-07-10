import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { main } from '../main.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-check-'));
  execFileSync('git', ['init'], { cwd: root });
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn(root);
  } finally {
    process.chdir(previous);
  }
}

const REQUIRED_SECTIONS = ['Task', 'RED test', 'Stop conditions', 'Evidence'];

test('check structure fails when a packet is missing a required section', async () => {
  await inTempRepo(async (root) => {
    const frontmatter = [
      '---',
      'id: FOO-001',
      'title: missing stop conditions',
      'depends_on: []',
      'write_set: []',
      'requirements: []',
      'evidence_required: []',
      '---',
    ].join('\n');
    const body = [
      '',
      '## Task',
      'do something',
      '',
      '## RED test (write first)',
      'some test',
      '',
      '## Evidence required at close',
      'sha',
    ].join('\n');
    const content = `<!-- GENERATED FROM THE BOARD — do not edit; use \`task amend\` -->\n${frontmatter}${body}\n`;
    const packetsDir = join(root, 'docs', 'packets');
    await mkdir(packetsDir, { recursive: true });
    await writeFile(join(packetsDir, 'FOO-001.md'), content, 'utf-8');

    const io = fakeIo();
    const code = await main(['check', 'structure'], io);
    assert.notEqual(code, EXIT.OK, 'expected non-zero exit for missing section');
    const output = io.outLines.join('\n');
    assert.ok(output.includes('Stop conditions') || output.includes('FOO-001'), `expected missing section mention, got: ${output}`);
  });
});
