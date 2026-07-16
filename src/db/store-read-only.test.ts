import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { numberColumn } from './rows.js';
import { openStore, openStoreReadOnly } from './store.js';

test('openStoreReadOnly permits inspection and mechanically rejects mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-store-readonly-'));
  openStore(root).close();
  const store = openStoreReadOnly(root);
  assert.equal(numberColumn(store.db.prepare('SELECT COUNT(*) AS count FROM packets').get(), 'count'), 0);
  assert.throws(
    () => store.db.prepare("INSERT INTO packets (id, title, path, status, body, write_set, type, priority, created_at, updated_at) VALUES ('NOPE', 'Nope', '', 'draft', '', '[]', '', 0, '', '')").run(),
    /read-only|readonly/i,
  );
  store.close();
});
