import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../db/store.js';
import { numberColumn } from '../db/rows.js';
import { compileContext } from './compiler.js';
import { CAPABILITY_EFFECT, CONTEXT_ERROR, CONTEXT_ITEM_STATUS, CONTEXT_ITEM_STRENGTH } from './context.constants.js';
import { ContextError } from './context.errors.js';
import { persistContextPack } from './packs.js';
import { addContextItem, loadContextCatalog, replaceContextPrecedence } from './repository.js';

test('SQLite is authoritative for context content, metadata, precedence, and compiled packs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-context-'));
  const store = openStore(root);
  replaceContextPrecedence(store, ['principle', 'role']);
  addContextItem(store, {
    id: 'P-001', version: 1, kind: 'principle', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'determinism', body: 'Runtime owns deterministic work.',
    provenance: 'human decision', tags: ['engineering'], selectors: { role: ['reviewer'] },
  });
  addContextItem(store, {
    id: 'ROLE-REVIEWER', version: 1, kind: 'role', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'role.charter', body: 'Review independently.',
    provenance: 'role catalog', tags: ['review'], selectors: { role: ['reviewer'] },
    dependencies: ['P-001@1'], capabilities: { read: CAPABILITY_EFFECT.ALLOW, edit: CAPABILITY_EFFECT.DENY },
  });

  const catalog = loadContextCatalog(store);
  const input = { role: 'reviewer', phase: 'review', tags: ['review'], requestedCapabilities: ['read', 'edit'] } as const;
  const pack = compileContext(catalog, input);
  persistContextPack(store, input, pack);
  persistContextPack(store, input, pack);

  assert.equal(catalog.items.length, 2);
  assert.deepEqual(pack.items.map((entry) => entry.ref), ['P-001@1', 'ROLE-REVIEWER@1']);
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM context_packs').get(), 'count'), 1);
  assert.equal(numberColumn(store.db.prepare('SELECT count(*) AS count FROM context_pack_items').get(), 'count'), 2);
  store.close();
});

test('adding a superseding context version atomically retires the active version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-context-supersession-'));
  const store = openStore(root);
  replaceContextPrecedence(store, ['taste']);
  const base = {
    id: 'TASTE-UI', kind: 'taste', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'taste.frontend',
    provenance: 'human decision', selectors: { tag: ['frontend'] },
  } as const;
  addContextItem(store, { ...base, version: 1, body: 'Use the established theme.' });
  addContextItem(store, {
    ...base, version: 2, body: 'Use the established theme and strict TypeScript.',
    supersedes: ['TASTE-UI@1'],
  });

  const catalog = loadContextCatalog(store);
  assert.deepEqual(catalog.items.map((item) => [item.version, item.status]), [
    [1, CONTEXT_ITEM_STATUS.SUPERSEDED],
    [2, CONTEXT_ITEM_STATUS.ACTIVE],
  ]);
  const pack = compileContext(catalog, {
    role: 'implementer', phase: 'implementation', tags: ['frontend'], requestedCapabilities: [],
  });
  assert.deepEqual(pack.items.map((item) => item.ref), ['TASTE-UI@2']);
  store.close();
});

test('an invalid context supersession rolls back without retiring its target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-context-invalid-supersession-'));
  const store = openStore(root);
  replaceContextPrecedence(store, ['taste']);
  addContextItem(store, {
    id: 'TASTE-UI', version: 1, kind: 'taste', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'taste.frontend',
    body: 'Use the established theme.', provenance: 'human decision',
  });

  assert.throws(() => {
    addContextItem(store, {
      id: 'TASTE-UI', version: 2, kind: 'taste', status: CONTEXT_ITEM_STATUS.ACTIVE,
      strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'taste.backend',
      body: 'Unrelated replacement.', provenance: 'invalid test input', supersedes: ['TASTE-UI@1'],
    });
  }, /different semantic key/);
  assert.deepEqual(loadContextCatalog(store).items.map((item) => [item.version, item.status]), [
    [1, CONTEXT_ITEM_STATUS.ACTIVE],
  ]);
  store.close();
});

test('a context item whose kind has no precedence is refused at intake', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-context-kind-precedence-'));
  const store = openStore(root);
  const item = {
    id: 'TASTE-UI', version: 1, kind: 'taste', status: CONTEXT_ITEM_STATUS.ACTIVE,
    strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'taste.frontend',
    body: 'Use the established theme.', provenance: 'human decision',
  } as const;

  assert.throws(
    () => { addContextItem(store, item); },
    (error: unknown) => error instanceof ContextError
      && error.code === CONTEXT_ERROR.MISSING_PRECEDENCE
      && error.message.includes('taste'),
  );
  assert.equal(loadContextCatalog(store).items.length, 0);
  replaceContextPrecedence(store, ['taste']);
  addContextItem(store, item);
  assert.equal(loadContextCatalog(store).items.length, 1);
  store.close();
});

test('addContextItem rejects a role selector value that is not a real role', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-context-invalid-role-'));
  const store = openStore(root);
  replaceContextPrecedence(store, ['taste']);
  assert.throws(
    () => {
      addContextItem(store, {
        id: 'HJ-TEST', version: 1, kind: 'taste', status: CONTEXT_ITEM_STATUS.ACTIVE,
        strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'hj-test', body: 'test body',
        provenance: 'test', selectors: { role: ['not-a-real-role'] },
      });
    },
    /unknown role/i,
  );
  store.close();
});

test('addContextItem accepts a role selector value that is a real role', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-context-valid-role-'));
  const store = openStore(root);
  replaceContextPrecedence(store, ['taste']);
  assert.doesNotThrow(() => {
    addContextItem(store, {
      id: 'HJ-TEST', version: 1, kind: 'taste', status: CONTEXT_ITEM_STATUS.ACTIVE,
      strength: CONTEXT_ITEM_STRENGTH.MANDATORY, semanticKey: 'hj-test', body: 'test body',
      provenance: 'test', selectors: { role: ['human-interface'] },
    });
  });
  store.close();
});
