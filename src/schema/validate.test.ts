import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SchemaError } from './core.errors.js';
import { PacketRowSchema } from './store.constants.js';
import { ConfigError } from '../config.errors.js';
import { parsePlaybookConfig } from './config.constants.js';

test('config and store rows are schema-validated at the boundary and a corrupt field is refused by path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'svp-schema-config-'));
  writeFileSync(join(dir, 'playbook.config.json'), JSON.stringify({
    productName: 'Test',
    gates: { maxLines: 'many' },
  }));
  const text = readFileSync(join(dir, 'playbook.config.json'), 'utf8');
  assert.throws(
    () => parsePlaybookConfig(text),
    (err: unknown) => {
      if (!(err instanceof ConfigError)) return false;
      assert.match(err.message, /gates\.maxLines/);
      return true;
    },
    'config schema should refuse wrong-typed field by path',
  );

  const fakeRow = {
    id: 'p1',
    title: 'Test',
    path: '/tmp/test',
    status: 'draft',
    body: '',
    write_set: '{broken json',
    type: '',
    priority: 100,
    created_at: 'now',
    updated_at: 'now',
  };
  assert.throws(
    () => PacketRowSchema.parse(fakeRow),
    (err: unknown) => {
      if (!(err instanceof SchemaError)) return false;
      assert.match(err.message, /write_set/);
      return true;
    },
    'store row schema should refuse corrupted JSON column by field name',
  );
});
