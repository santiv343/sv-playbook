import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateOrmBoundaryBaseline, inspectOrmBoundary } from './orm-boundary.js';
import { ORM_BOUNDARY_VIOLATION } from './orm-boundary.constants.js';

const GATEWAY_LIFECYCLE_SOURCE_PATH = 'src/gateway/gateway-lifecycle.ts';
const GATEWAY_LIFECYCLE_FILE = fileURLToPath(new URL('../../src/gateway/gateway-lifecycle.ts', import.meta.url));

test('application persistence rejects plain SQL outside the database boundary', () => {
  const violations = inspectOrmBoundary({
    path: 'src/example/repository.ts',
    source: `export function load(store: Store) {
  return store.db.prepare('SELECT id FROM packets').all();
}`,
  });

  assert.deepEqual(violations.map(({ kind, line, path }) => ({ kind, line, path })), [{
    kind: ORM_BOUNDARY_VIOLATION.RAW_QUERY_CALL,
    line: 2,
    path: 'src/example/repository.ts',
  }]);
});

test('database infrastructure and non-database exec calls remain allowed', () => {
  assert.deepEqual(inspectOrmBoundary({
    path: 'src/db/migration.ts',
    source: ['db.exec(\'', 'ALTER', " TABLE packets ADD COLUMN kind TEXT')"].join(''),
  }), []);
  assert.deepEqual(inspectOrmBoundary({
    path: 'src/parser.ts',
    source: `const match = /task-(\\d+)/.exec(value)`,
  }), []);
});

test('DDL literals are rejected outside database infrastructure regardless of identifier name', () => {
  const source = ['const schema = `', 'CREATE', ' TABLE example (id TEXT)`;'].join('');
  const violations = inspectOrmBoundary({ path: 'src/example/schema.ts', source });

  assert.deepEqual(violations.map(({ kind, path }) => ({ kind, path })), [{
    kind: ORM_BOUNDARY_VIOLATION.SQL_LITERAL,
    path: 'src/example/schema.ts',
  }]);
  assert.deepEqual(inspectOrmBoundary({ path: 'src/db/schema.ts', source }), []);
});

test('test modules are inside the ORM boundary unless they live under database infrastructure', () => {
  assert.equal(inspectOrmBoundary({
    path: 'src/example/repository.test.ts',
    source: `store.db.prepare('SELECT id FROM packets').all();`,
  }).length, 1);
  assert.deepEqual(inspectOrmBoundary({
    path: 'src/db/repository.test.ts',
    source: `store.db.prepare('SELECT id FROM packets').all();`,
  }), []);
});

test('gateway lifecycle persistence is outside the accepted raw SQL debt', () => {
  const violations = inspectOrmBoundary({
    path: GATEWAY_LIFECYCLE_SOURCE_PATH,
    source: readFileSync(GATEWAY_LIFECYCLE_FILE, 'utf8'),
  });

  assert.deepEqual(violations, []);
});

test('ORM debt baseline must match exactly and can only be lowered explicitly', () => {
  const inventory = {
    count: 1,
    digest: 'current',
    violations: [],
  };
  assert.equal(evaluateOrmBoundaryBaseline(inventory, undefined).status, 'missing');
  assert.equal(evaluateOrmBoundaryBaseline(inventory, { count: 0, digest: 'old' }).status, 'increased');
  assert.equal(evaluateOrmBoundaryBaseline(inventory, { count: 2, digest: 'old' }).status, 'decreased');
  assert.equal(evaluateOrmBoundaryBaseline(inventory, { count: 1, digest: 'old' }).status, 'changed');
  assert.equal(evaluateOrmBoundaryBaseline(inventory, { count: 1, digest: 'current' }).status, 'match');
});
