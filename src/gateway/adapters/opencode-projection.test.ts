import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionProfile } from '../gateway.types.js';
import { createOpenCodeRoleProjectionAdapter } from './opencode-projection.js';

const OPENCODE_ADAPTER_ID = 'opencode-shared-bootstrap-v1';

function profile(adapterConfig: Readonly<Record<string, unknown>>): ExecutionProfile {
  return {
    id: 'fake-reviewer',
    roleId: 'reviewer',
    adapterId: OPENCODE_ADAPTER_ID,
    agentId: 'reviewer',
    providerId: 'test-provider',
    modelId: 'test-model',
    adapterConfig,
    observationIntervalMs: 500,
    noProgressTimeoutMs: 600000,
    cancellationGraceMs: 10000,
    tools: { read: true },
    enabled: true,
  };
}

const VALID_CONFIG = {
  baseUrl: 'http://127.0.0.1:1',
  allowedVersions: ['1.17.18'],
  outputMode: 'validated-text',
} as const;

test('the effective projection surfaces profile config violations before any fetch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-opencode-projection-'));
  const adapter = createOpenCodeRoleProjectionAdapter();

  const missing = await adapter.inspectEffective(root, [profile({ baseUrl: 'http://127.0.0.1:1', allowedVersions: ['1.17.18'] })]);
  assert.deepEqual(missing.agentIds, []);
  const missingViolations = missing.violations ?? [];
  assert.equal(missingViolations.length, 1);
  assert.match(missingViolations[0] ?? '', /outputMode/);

  const unsupported = await adapter.inspectEffective(root, [profile({ ...VALID_CONFIG, outputMode: 'stream' })]);
  assert.match(unsupported.violations?.[0] ?? '', /outputMode/);

  const unreachable = await adapter.inspectEffective(root, [profile(VALID_CONFIG)]);
  const unreachableViolations = unreachable.violations ?? [];
  assert.equal(unreachableViolations.some((violation) => violation.includes('outputMode')), false);
  assert.equal(unreachableViolations.length, 1);
});
