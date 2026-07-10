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

test('cli topic documents takeover and brief', async () => {
  const text = await readTopic('cli');
  assert.ok(text !== undefined);
  for (const s of ['takeover', 'brief', 'stale', 'note']) {
    assert.ok(text.toLowerCase().includes(s), `missing ${s}`);
  }
});

test('cli topic documents doctor', async () => {
  const text = await readTopic('cli');
  assert.ok(text !== undefined);
  assert.ok(text.includes('sv-playbook doctor'));
});

test('cli topic documents backup, restore state, and rebuild', async () => {
  const text = await readTopic('cli');
  assert.ok(text !== undefined);
  assert.ok(text.includes('sv-playbook backup state'));
  assert.ok(text.includes('sv-playbook restore state'));
  assert.ok(text.includes('sv-playbook rebuild'));
});

test('cli topic documents status json for serve', async () => {
  const text = await readTopic('cli');
  assert.ok(text !== undefined);
  assert.ok(text.includes('sv-playbook status'));
  assert.ok(text.includes('status --json'));
});

test('quality principle is present in principles review and rubric', async () => {
  const principles = await readTopic('principles');
  assert.ok(principles !== undefined);
  assert.ok(principles.includes('PRINCIPLE-014'), 'PRINCIPLE-014 not in principles');

  const review = await readTopic('review');
  assert.ok(review !== undefined);
  assert.ok(
    review.toLowerCase().includes('class of failure'),
    'class-of-failure question not in review',
  );

  const rubric = await readTopic('rubric');
  assert.ok(rubric !== undefined);
  assert.ok(
    rubric.toLowerCase().includes('root-cause') || rubric.toLowerCase().includes('durable'),
    'root-cause/durable-design language not in rubric',
  );
});

test('review topic exists with the four checklist sections', async () => {
  const text = await readTopic('review');
  assert.ok(text !== undefined);
  for (const s of ['Code judgment', 'Test quality', 'Scope and evidence', 'Taste pass']) {
    assert.ok(text.includes(s), `missing ${s}`);
  }
});
