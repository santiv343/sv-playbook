import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRoles } from './roles.js';

function roleDoc(title: string, body: string): string {
  const h = `# Role: ${title}\n\n`;
  return h + body;
}

test('check roles fails when a responsibility is owned by two roles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svp-roles-'));
  const roleA = roleDoc('Merger', [
    '## Mission',
    'Merge things.',
    '',
    '## Prohibitions',
    'Never implement.',
    '',
    '## Read first',
    '1. Nothing.',
    '',
    '## Steps',
    '| # | Type | Do | Expected | On mismatch |',
    '|---|------|----|----------|-------------|',
    '| 1 | EXEC | merge | success | report |',
    '',
    '## Output',
    '1. Merge result.',
    '',
    '## Handoffs',
    'Hands off to reviewer.',
    '',
    '## Gates',
    'Merge gate.',
    '',
    '## Decision Authority',
    'Decides merge.',
    '',
    '## Stop conditions',
    'Conflict.',
    '',
    '## Responsibility',
    '- merge',
    '',
    'Minimum capability: any model.',
  ].join('\n'));
  const roleB = roleDoc('Merger2', [
    '## Mission',
    'Also merge things.',
    '',
    '## Prohibitions',
    'Never review.',
    '',
    '## Read first',
    '1. Nothing.',
    '',
    '## Steps',
    '| # | Type | Do | Expected | On mismatch |',
    '|---|------|----|----------|-------------|',
    '| 1 | EXEC | merge | success | report |',
    '',
    '## Output',
    '1. Merge result.',
    '',
    '## Handoffs',
    'Hands off to orchestrator.',
    '',
    '## Gates',
    'Merge gate.',
    '',
    '## Decision Authority',
    'Decides merge.',
    '',
    '## Stop conditions',
    'Conflict.',
    '',
    '## Responsibility',
    '- merge',
    '',
    'Minimum capability: any model.',
  ].join('\n'));

  await writeFile(join(dir, 'merger.md'), roleA, 'utf-8');
  await writeFile(join(dir, 'merger2.md'), roleB, 'utf-8');

  const violations = await checkRoles(dir);
  assert.ok(violations.length > 0, 'expected violations for responsibility conflict');
  const conflictV = violations.find(v => v.message.includes('merge'));
  assert.ok(conflictV, `expected a violation naming "merge", got: ${JSON.stringify(violations)}`);
  assert.ok(conflictV.message.includes('merger') && conflictV.message.includes('merger2'),
    `expected both roles named, got: ${conflictV.message}`);
});

test('check roles rejects non-EXEC non-JUDGMENT step type', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svp-roles-'));
  const doc = roleDoc('Tester', [
    '## Mission',
    'Test.',
    '',
    '## Prohibitions',
    'Never implement.',
    '',
    '## Read first',
    '1. Nothing.',
    '',
    '## Steps',
    '| # | Type | Do | Expected | On mismatch |',
    '|---|------|----|----------|-------------|',
    '| 1 | THINK | reason | correct | — |',
    '',
    '## Output',
    '1. Result.',
    '',
    '## Handoffs',
    'Hands off to reviewer.',
    '',
    '## Gates',
    'None.',
    '',
    '## Decision Authority',
    'Decides nothing.',
    '',
    '## Stop conditions',
    'None.',
    '',
    '## Responsibility',
    '- test',
    '',
    'Minimum capability: any model.',
  ].join('\n'));

  await writeFile(join(dir, 'tester.md'), doc, 'utf-8');

  const violations = await checkRoles(dir);
  const typeV = violations.find(v => v.message.includes('not EXEC or JUDGMENT'));
  assert.ok(typeV, `expected step type violation, got: ${JSON.stringify(violations)}`);
});

test('check roles rejects JUDGMENT with empty on-mismatch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svp-roles-'));
  const doc = roleDoc('Tester', [
    '## Mission',
    'Test.',
    '',
    '## Prohibitions',
    'Never implement.',
    '',
    '## Read first',
    '1. Nothing.',
    '',
    '## Steps',
    '| # | Type | Do | Expected | On mismatch |',
    '|---|------|----|----------|-------------|',
    '| 1 | JUDGMENT | reason | correct | — |',
    '',
    '## Output',
    '1. Result.',
    '',
    '## Handoffs',
    'Hands off to reviewer.',
    '',
    '## Gates',
    'None.',
    '',
    '## Decision Authority',
    'Decides nothing.',
    '',
    '## Stop conditions',
    'None.',
    '',
    '## Responsibility',
    '- test',
    '',
    'Minimum capability: any model.',
  ].join('\n'));

  await writeFile(join(dir, 'tester.md'), doc, 'utf-8');

  const violations = await checkRoles(dir);
  const jv = violations.find(v => v.message.includes('JUDGMENT without escalation path'));
  assert.ok(jv, `expected JUDGMENT escalation violation, got: ${JSON.stringify(violations)}`);
});

test('check roles rejects missing handoff section', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svp-roles-'));
  const doc = roleDoc('Tester', [
    '## Mission',
    'Test.',
    '',
    '## Prohibitions',
    'Never implement.',
    '',
    '## Read first',
    '1. Nothing.',
    '',
    '## Steps',
    '| # | Type | Do | Expected | On mismatch |',
    '|---|------|----|----------|-------------|',
    '| 1 | EXEC | test | success | report |',
    '',
    '## Output',
    '1. Result.',
    '',
    '## Gates',
    'None.',
    '',
    '## Decision Authority',
    'Decides nothing.',
    '',
    '## Stop conditions',
    'None.',
    '',
    '## Responsibility',
    '- test',
    '',
    'Minimum capability: any model.',
  ].join('\n'));

  await writeFile(join(dir, 'tester.md'), doc, 'utf-8');

  const violations = await checkRoles(dir);
  const hv = violations.find(v => v.message.includes('Missing section') && v.message.includes('handoffs'));
  assert.ok(hv, `expected missing handoff section violation, got: ${JSON.stringify(violations)}`);
});

test('check roles reports missing required sections', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svp-roles-'));
  const doc = '# Role: Bare\n\nMinimum capability: any model.\n';

  await writeFile(join(dir, 'bare.md'), doc, 'utf-8');

  const violations = await checkRoles(dir);
  assert.ok(violations.length >= 3, `expected at least 3 missing-section violations, got ${violations.length}: ${JSON.stringify(violations)}`);
});

test('check roles detects missing responsibility section', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svp-roles-'));
  const doc = roleDoc('Tester', [
    '## Mission',
    'Test.',
    '',
    '## Prohibitions',
    'Never implement.',
    '',
    '## Read first',
    '1. Nothing.',
    '',
    '## Steps',
    '| # | Type | Do | Expected | On mismatch |',
    '|---|------|----|----------|-------------|',
    '| 1 | EXEC | test | success | report |',
    '',
    '## Output',
    '1. Result.',
    '',
    '## Handoffs',
    'Hands off to reviewer.',
    '',
    '## Gates',
    'None.',
    '',
    '## Decision Authority',
    'Decides nothing.',
    '',
    '## Stop conditions',
    'None.',
    '',
    'Minimum capability: any model.',
  ].join('\n'));
  // No ## Responsibility section

  await writeFile(join(dir, 'tester.md'), doc, 'utf-8');

  const violations = await checkRoles(dir);
  const rv = violations.find(v => v.message.includes('Missing section') && v.message.includes('responsibility'));
  assert.ok(rv, `expected missing responsibility violation, got: ${JSON.stringify(violations)}`);
});
