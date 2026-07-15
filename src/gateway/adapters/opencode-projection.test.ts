import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionProfile } from '../gateway.types.js';
import { createOpenCodeRoleProjectionAdapter } from './opencode-projection.js';
import { OPENCODE_ADAPTER_ID } from './opencode.constants.js';

function object(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return Object.fromEntries(Object.entries(value ?? {}));
}

function profile(): ExecutionProfile {
  return {
    id: 'profile', roleId: 'planner', adapterId: OPENCODE_ADAPTER_ID, agentId: 'planner',
    providerId: 'provider', modelId: 'model', adapterConfig: {}, observationIntervalMs: 1,
    noProgressTimeoutMs: 1, cancellationGraceMs: 1, tools: { bash: false, read: true }, enabled: true,
  };
}

test('OpenCode projection replaces unmanaged agents and emits exact default-deny permissions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-opencode-projection-'));
  await writeFile(join(root, 'opencode.json'), JSON.stringify({ agent: {
    'founder-interface': { model: 'legacy/model', permission: { '*': 'allow' } },
  } }), 'utf8');

  const candidate = createOpenCodeRoleProjectionAdapter().compile(root, [profile()]);
  const parsed: unknown = JSON.parse(candidate.artifacts[0]?.content ?? '{}');
  const config = object(parsed);
  const agents = object(config.agent);
  const planner = object(agents.planner);
  assert.deepEqual(Object.keys(agents), ['planner']);
  assert.deepEqual(planner.permission, { '*': 'deny', bash: 'deny', read: 'allow' });
  assert.deepEqual(candidate.violations, []);
});

test('OpenCode projection inspection reports model and permission drift', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-opencode-projection-drift-'));
  await writeFile(join(root, 'opencode.json'), JSON.stringify({ agent: {
    planner: { model: 'wrong/model', permission: { '*': 'allow', bash: 'allow', read: 'allow' } },
  } }), 'utf8');

  const inspected = createOpenCodeRoleProjectionAdapter().inspect(root, [profile()]);
  assert.ok((inspected.violations ?? []).some((violation) => violation.includes('model projection mismatch')));
  assert.ok((inspected.violations ?? []).some((violation) => violation.includes('not default-deny')));
  assert.ok((inspected.violations ?? []).some((violation) => violation.includes('permission mismatch for bash')));
});
