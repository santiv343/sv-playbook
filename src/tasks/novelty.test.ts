import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNovelty } from './novelty.js';

test('detects a glob pattern never seen in prior packets', () => {
  const result = detectNovelty({
    candidateWriteSet: ['src/serve/assets/**'],
    priorWriteSets: [['src/tasks/**'], ['src/db/**']],
  });
  assert.equal(result.isNovel, true);
  assert.deepEqual(result.newPatterns, ['src/serve/assets/**']);
});

test('does not flag a pattern seen in any prior packet', () => {
  const result = detectNovelty({
    candidateWriteSet: ['src/tasks/**'],
    priorWriteSets: [['src/tasks/**'], ['src/db/**']],
  });
  assert.equal(result.isNovel, false);
  assert.deepEqual(result.newPatterns, []);
});

test('a mix of seen and new patterns is still novel, reporting only the new ones', () => {
  const result = detectNovelty({
    candidateWriteSet: ['src/tasks/**', 'src/serve/assets/**'],
    priorWriteSets: [['src/tasks/**']],
  });
  assert.equal(result.isNovel, true);
  assert.deepEqual(result.newPatterns, ['src/serve/assets/**']);
});
