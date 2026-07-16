import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITY_EFFECT, CONTEXT_ERROR, CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from './context.constants.js';
import { ContextError } from './context.errors.js';
import { compileContext } from './compiler.js';
import type { ContextCatalog } from './repository.types.js';
import type { StoredContextItem } from './context.types.js';

const REVIEWER_CONTEXT_REF = 'R-REV@1';
const SUPERSEDED_DECISION_REF = 'D-OLD@1';

function item(overrides: Partial<StoredContextItem> & Pick<StoredContextItem, 'id' | 'kind' | 'semanticKey' | 'body'>): StoredContextItem {
  return {
    version: 1,
    status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY,
    provenance: 'test',
    tags: [],
    selectors: {},
    dependencies: [],
    supersedes: [],
    capabilities: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function catalog(items: readonly StoredContextItem[], precedence: Readonly<Record<string, number>>): ContextCatalog {
  return { items, precedence };
}

test('retrieves only context selected by generic role, phase, and tag metadata', () => {
  const global = item({ id: 'P-1', kind: 'principle', semanticKey: 'determinism', body: 'Mechanize deterministic work.' });
  const implementer = item({
    id: 'R-IMPL', kind: 'role', semanticKey: 'role.charter', body: 'Implement one bounded change.',
    selectors: { role: ['implementer'], phase: ['delivery'] },
  });
  const backend = item({
    id: 'T-BACKEND', kind: 'taste', semanticKey: 'taste.backend', body: 'Exercise existing state.',
    selectors: { role: ['implementer', 'reviewer'], tag: ['backend'] },
  });
  const reviewer = item({
    id: 'R-REV', kind: 'role', semanticKey: 'role.reviewer', body: 'Review independently.',
    selectors: { role: ['reviewer'] },
  });

  const pack = compileContext(catalog([global, implementer, backend, reviewer], { principle: 4, role: 3, taste: 2 }), {
    role: 'implementer', phase: 'delivery', tags: ['backend'], requestedCapabilities: [],
  });

  assert.deepEqual(pack.items.map((entry) => entry.ref), ['P-1@1', 'R-IMPL@1', 'T-BACKEND@1']);
  assert.equal(pack.receipt.find((entry) => entry.ref === REVIEWER_CONTEXT_REF)?.reason, 'selector-mismatch');
});

test('precedence comes from catalog data and conflicts fail closed', () => {
  const fallback = item({ id: 'D-OLD', kind: 'default', semanticKey: 'timeout', body: '120 seconds' });
  const decision = item({ id: 'D-NEW', kind: 'decision', semanticKey: 'timeout', body: '600 seconds' });

  const pack = compileContext(catalog([fallback, decision], { decision: 2, default: 1 }), {
    role: 'delivery-orchestrator', phase: 'delivery', requestedCapabilities: [],
  });
  assert.deepEqual(pack.items.map((entry) => entry.ref), ['D-NEW@1']);
  assert.equal(pack.receipt.find((entry) => entry.ref === SUPERSEDED_DECISION_REF)?.replacedBy, 'D-NEW@1');

  assert.throws(
    () => compileContext(catalog([fallback, decision], { decision: 1, default: 1 }), {
      role: 'delivery-orchestrator', phase: 'delivery', requestedCapabilities: [],
    }),
    (error: unknown) => error instanceof ContextError && error.code === CONTEXT_ERROR.CONTEXT_CONFLICT,
  );
});

test('referenced items and their dependencies are required and selector checked', () => {
  const foundation = item({ id: 'FOUNDATION', kind: 'principle', semanticKey: 'foundation', body: 'Foundation.' });
  const task = item({
    id: 'TASK', kind: 'requirement', semanticKey: 'task', body: 'Task.',
    selectors: { role: ['implementer'] }, dependencies: ['FOUNDATION@1'],
  });
  const source = catalog([foundation, task], { principle: 2, requirement: 1 });

  const pack = compileContext(source, {
    role: 'implementer', phase: 'delivery', references: ['TASK@1'], requestedCapabilities: [],
  });
  assert.deepEqual(pack.items.map((entry) => entry.ref), ['FOUNDATION@1', 'TASK@1']);

  assert.throws(
    () => compileContext(source, {
      role: 'reviewer', phase: 'review', references: ['TASK@1'], requestedCapabilities: [],
    }),
    (error: unknown) => error instanceof ContextError && error.code === CONTEXT_ERROR.REFERENCE_NOT_APPLICABLE,
  );
});

test('requested runtime capabilities are denied by default and resolved from selected role data', () => {
  const role = item({
    id: 'ROLE', kind: 'role', semanticKey: 'role.capabilities', body: 'Role.',
    selectors: { role: ['reviewer'] }, capabilities: { read: CAPABILITY_EFFECT.ALLOW, shell: CAPABILITY_EFFECT.DENY },
  });
  const pack = compileContext(catalog([role], { role: 1 }), {
    role: 'reviewer', phase: 'review', requestedCapabilities: ['read', 'shell', 'delegate'],
  });
  assert.deepEqual(pack.capabilities, [
    { capability: 'delegate', effect: 'deny', source: null },
    { capability: 'read', effect: 'allow', source: 'ROLE@1' },
    { capability: 'shell', effect: 'deny', source: 'ROLE@1' },
  ]);
});

test('same semantic inputs produce the same pack identity', () => {
  const source = catalog([item({ id: 'P', kind: 'principle', semanticKey: 'p', body: 'Stable.' })], { principle: 1 });
  const input = { role: 'reviewer', phase: 'review', tags: ['b', 'a'], requestedCapabilities: ['read'] } as const;
  const first = compileContext(source, input);
  const second = compileContext(source, input);
  assert.equal(first.semanticDigest, second.semanticDigest);
  assert.equal(first.packId, second.packId);
});
