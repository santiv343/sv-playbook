import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../main.js';
import { command } from './check.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';
import { initTestRepo } from '../../testkit.js';

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

async function inTempRepo<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'svp-check-'));
  initTestRepo(root);
  const previous = process.cwd();
  process.chdir(root);
  try {
    return await fn(root);
  } finally {
    process.chdir(previous);
  }
}

test('check command declares a non-empty usage string', () => {
  assert.notEqual(command.usage.trim(), '');
  assert.match(command.usage, /^Usage:/);
  assert.match(command.usage, /sv-playbook check/);
});

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

test('check structure distinguishes historical baselined packet violations from new packet violations', async () => {
  await inTempRepo(async (root) => {
    const config = {
      productName: 'test',
      chatLanguage: 'en',
      tier: 'TIER-2',
      verifyCommand: 'node -e process.exit(0)',
      autonomy: 'strict',
      backup: { enabled: false, retention: 3, maxAgeHours: 24, onEvents: ['done'] },
      gates: { maxLines: 350, maxLinesPerFunction: 60, complexity: 10, cognitiveComplexity: 10, layout: true },
      baseline: { fingerprints: ['docs/packets/OLD-001.md'] },
    };
    await writeFile(join(root, 'playbook.config.json'), JSON.stringify(config), 'utf-8');

    const frontmatter = [
      '---',
      'id: FOO-001',
      'title: test',
      'depends_on: []',
      'write_set: ["src/x.ts"]',
      'requirements: []',
      'evidence_required: []',
      '---',
    ].join('\n');
    const body = ['', '## Task', 'do something'].join('\n');

    const packetsDir = join(root, 'docs', 'packets');
    await mkdir(packetsDir, { recursive: true });

    const makePacket = (id: string) =>
      `<!-- GENERATED FROM THE BOARD — do not edit; use \`task amend\` -->\n${frontmatter.replace('FOO-001', id)}\n${body}\n`;
    await writeFile(join(packetsDir, 'OLD-001.md'), makePacket('OLD-001'), 'utf-8');
    await writeFile(join(packetsDir, 'NEW-001.md'), makePacket('NEW-001'), 'utf-8');

    const io = fakeIo();
    const code = await main(['check', 'structure'], io);
    const output = io.outLines.join('\n');

    assert.ok(output.includes('baselined'), 'baselined packet should be grandfathered');
    assert.notEqual(code, EXIT.OK, 'expected non-zero exit because new packet violates');
    assert.ok(output.includes('NEW-001'), 'new packet violation should be reported');
    assert.ok(!output.includes('OLD-001.md: missing required section'), 'baselined packet should not also be reported as a missing-section violation');
  });
});

test('check structure skips malformed frontmatter for baselined packets', async () => {
  await inTempRepo(async (root) => {
    const config = {
      productName: 'test',
      chatLanguage: 'en',
      tier: 'TIER-2',
      verifyCommand: 'node -e process.exit(0)',
      autonomy: 'strict',
      backup: { enabled: false, retention: 3, maxAgeHours: 24, onEvents: ['done'] },
      gates: { maxLines: 350, maxLinesPerFunction: 60, complexity: 10, cognitiveComplexity: 10, layout: true },
      baseline: { fingerprints: ['docs/packets/BROKEN-001.md'] },
    };
    await writeFile(join(root, 'playbook.config.json'), JSON.stringify(config), 'utf-8');

    const packetsDir = join(root, 'docs', 'packets');
    await mkdir(packetsDir, { recursive: true });

    await writeFile(join(packetsDir, 'BROKEN-001.md'), 'not valid frontmatter at all\n', 'utf-8');

    const io = fakeIo();
    const code = await main(['check', 'structure'], io);
    const output = io.outLines.join('\n');

    assert.ok(output.includes('baselined frontmatter error'), 'baselined malformed frontmatter should be skipped');
    assert.equal(code, EXIT.OK, 'should exit 0 when only baselined broken packets exist');
  });
});

test('check secrets flags a file containing a private key header', async () => {
  await inTempRepo(async (root) => {
    const sourceDir = join(root, 'src');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(
      join(sourceDir, 'config.ts'),
      'export const key = `-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----`;',
      'utf-8',
    );

    const io = fakeIo();
    const code = await main(['check', 'secrets'], io);
    const output = io.outLines.join('\n');

    assert.notEqual(code, EXIT.OK, 'expected non-zero exit for secret violation');
    assert.ok(output.includes('private-key-header'), `expected private-key-header mention, got: ${output}`);
  });
});

test('check secrets passes a clean tree', async () => {
  await inTempRepo(async () => {
    const io = fakeIo();
    const code = await main(['check', 'secrets'], io);
    assert.equal(code, EXIT.OK, 'expected clean tree to pass');
  });
});
