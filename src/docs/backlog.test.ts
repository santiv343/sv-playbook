import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKLOG_PATH = resolve(import.meta.dirname, '../../docs/backlog.md');

test('IDEA-121 describes PR #185 as open, not merged', () => {
  const content = readFileSync(BACKLOG_PATH, 'utf8');
  const rowMatch = /^\| IDEA-121 \|[^\n]*\|[^\n]*\|[^\n]*\|$/m.exec(content);
  assert.ok(rowMatch, 'IDEA-121 row not found in docs/backlog.md');
  const row = rowMatch[0];
  assert.doesNotMatch(row, /,\s*merged/);
  assert.match(row, /open/i);
});
