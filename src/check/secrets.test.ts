import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanForSecrets } from './secrets.js';

test('flags an AWS-shaped access key', () => {
  const violations = scanForSecrets([{ path: 'config.ts', content: "const key = 'AKIAIOSFODNN7EXAMPLE';" }]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'aws-access-key');
});

test('flags a private key header', () => {
  const violations = scanForSecrets([{ path: 'id_rsa', content: '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----' }]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'private-key-header');
});

test('flags a JWT-shaped string', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  const violations = scanForSecrets([{ path: 'notes.md', content: `token: ${jwt}` }]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.kind, 'jwt');
});

test('does not flag ordinary code', () => {
  const violations = scanForSecrets([{ path: 'index.ts', content: "export const greeting = 'hello world';" }]);
  assert.deepEqual(violations, []);
});
