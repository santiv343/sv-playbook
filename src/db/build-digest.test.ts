import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuildDigest } from './build-digest.js';
import { BUILD_DIGEST_FIELD, BUILD_DIGEST_FILE_NAME } from './build-digest.constants.js';

const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIGEST_PATH = join(DIST_DIR, BUILD_DIGEST_FILE_NAME);

function backupPath(): string {
  return `${DIGEST_PATH}.backup-${Date.now()}`;
}

test('readBuildDigest returns null when build-digest.json does not exist', () => {
  const backup = backupPath();
  let restored = false;
  if (existsSync(DIGEST_PATH)) {
    renameSync(DIGEST_PATH, backup);
  }
  try {
    assert.equal(readBuildDigest(), null);
  } finally {
    if (existsSync(backup)) {
      renameSync(backup, DIGEST_PATH);
      restored = true;
    }
  }
  assert.ok(restored || existsSync(DIGEST_PATH), 'fixture state should be restored');
});

test('readBuildDigest returns the digest string when the file exists', () => {
  const backup = backupPath();
  const original = readFileSync(DIGEST_PATH, 'utf8');
  renameSync(DIGEST_PATH, backup);
  try {
    writeFileSync(DIGEST_PATH, JSON.stringify({ [BUILD_DIGEST_FIELD]: 'abc123' }), 'utf8');
    assert.equal(readBuildDigest(), 'abc123');
  } finally {
    renameSync(backup, DIGEST_PATH);
    assert.equal(readFileSync(DIGEST_PATH, 'utf8'), original);
  }
});
