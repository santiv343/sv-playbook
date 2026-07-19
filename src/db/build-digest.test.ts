import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEXT_ENCODING } from '../platform.constants.js';
import { readBuildDigest } from './build-digest.js';
import { BUILD_DIGEST_FIELD, BUILD_DIGEST_FILE_NAME } from './build-digest.constants.js';

function makeTempDigestPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'svp-build-digest-'));
  return join(dir, BUILD_DIGEST_FILE_NAME);
}

test('readBuildDigest returns null when build-digest.json does not exist', () => {
  const digestPath = makeTempDigestPath();
  try {
    assert.equal(readBuildDigest(digestPath), null);
  } finally {
    rmSync(join(digestPath, '..'), { recursive: true, force: true });
  }
});

test('readBuildDigest returns the digest string when the file exists', () => {
  const digestPath = makeTempDigestPath();
  try {
    writeFileSync(
      digestPath,
      JSON.stringify({ [BUILD_DIGEST_FIELD]: 'abc123' }),
      TEXT_ENCODING.UTF8,
    );
    assert.equal(readBuildDigest(digestPath), 'abc123');
  } finally {
    rmSync(join(digestPath, '..'), { recursive: true, force: true });
  }
});
