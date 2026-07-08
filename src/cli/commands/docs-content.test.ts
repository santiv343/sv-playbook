import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTopic } from '../../content.js';

test('principles topic contains all eight principle IDs', async () => {
  const text = await readTopic('principles');
  assert.ok(text !== undefined);
  for (let i = 1; i <= 8; i++) {
    assert.ok(text.includes(`PRINCIPLE-00${i}`), `missing PRINCIPLE-00${i}`);
  }
});

test('cli topic documents the docs command and exit codes', async () => {
  const text = await readTopic('cli');
  assert.ok(text !== undefined);
  assert.ok(text.includes('sv-playbook docs'));
  assert.ok(text.toLowerCase().includes('exit code'));
});

test('cli topic documents the task lifecycle', async () => {
  const text = await readTopic('cli');
  assert.ok(text !== undefined);
  for (const s of ['task create', 'task start', 'refusal', 'draft', 'dropped']) {
    assert.ok(text.toLowerCase().includes(s.toLowerCase()), `missing ${s}`);
  }
});
