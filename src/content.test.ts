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
