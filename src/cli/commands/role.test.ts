import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gatewayFixture } from '../../gateway/gateway.test-support.js';
import { addExecutionProfile, setExecutionProfile } from '../../gateway/profiles.js';
import { OPENCODE_ADAPTER_ID } from '../../gateway/adapters/opencode.constants.js';
import { addModelCapabilityEvidence } from '../../roles/model-capability-evidence.js';
import { ROLE_CHARTER_PROJECTION_ADAPTER_ID } from '../../roles/charter-projection.constants.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';
import { command } from './role.js';
import { initTestRepo } from '../../testkit.js';

const TEST_PROVIDER_ID = 'provider';
const TEST_MODEL_ID = 'model';
const TEST_EVIDENCE_DIGEST = `sha256:${'f'.repeat(64)}`;
const TEST_ASSESSED_AT = '2026-01-01T00:00:00.000Z';
const TEST_EXPIRES_AT = '2100-01-01T00:00:00.000Z';

function fakeIo(): Io & { readonly outLines: string[]; readonly errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    outLines,
    errLines,
    out: (line) => { outLines.push(line); },
    err: (line) => { errLines.push(line); },
  };
}

function record(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return Object.fromEntries(Object.entries(value ?? {}));
}

test('role CLI activates the current valid catalog and returns its durable receipt', async () => {
  const { root, store } = await gatewayFixture({ activateCatalog: false });
  store.close();
  initTestRepo(root);
  const previous = process.cwd();
  process.chdir(root);
  try {
    const activateIo = fakeIo();
    assert.equal(await command.run(['activate'], activateIo), EXIT.OK, activateIo.errLines.join('\n'));
    const receiptIo = fakeIo();
    assert.equal(await command.run(['receipt'], receiptIo), EXIT.OK, receiptIo.errLines.join('\n'));
    assert.deepEqual(JSON.parse(receiptIo.outLines.join('\n')), JSON.parse(activateIo.outLines.join('\n')));
  } finally {
    process.chdir(previous);
  }
});

test('role CLI records model capability evidence through the public interface', async () => {
  const { root, store } = await gatewayFixture({ activateCatalog: false, seedModelEvidence: false });
  store.close();
  initTestRepo(root);
  const previous = process.cwd();
  process.chdir(root);
  try {
    const io = fakeIo();
    const digest = `sha256:${'b'.repeat(64)}`;
    assert.equal(await command.run([
      'model-evidence', '--provider', 'provider', '--model', 'model', '--capability', 'implementation',
      '--evidence-ref', 'evaluation:cli-test', '--evidence-digest', digest,
      '--assessed-at', '2026-01-01T00:00:00.000Z', '--expires-at', '2100-01-01T00:00:00.000Z',
    ], io), EXIT.OK, io.errLines.join('\n'));
    const receipt: unknown = JSON.parse(io.outLines.join('\n'));
    assert.equal(typeof receipt, 'object');

    const activateIo = fakeIo();
    assert.equal(await command.run(['activate'], activateIo), EXIT.OK, activateIo.errLines.join('\n'));
  } finally {
    process.chdir(previous);
  }
});

test('role CLI bootstraps the bundled semantic profile without provider configuration', async () => {
  const emptyRoot = await mkdtemp(join(tmpdir(), 'svp-role-cli-bootstrap-'));
  initTestRepo(emptyRoot);
  const previous = process.cwd();
  process.chdir(emptyRoot);
  try {
    const io = fakeIo();
    assert.equal(await command.run(['bootstrap'], io), EXIT.OK, io.errLines.join('\n'));
    const first: unknown = JSON.parse(io.outLines.join('\n'));
    const repeatedIo = fakeIo();
    assert.equal(await command.run(['bootstrap'], repeatedIo), EXIT.OK, repeatedIo.errLines.join('\n'));
    assert.deepEqual(JSON.parse(repeatedIo.outLines.join('\n')), first);
  } finally {
    process.chdir(previous);
  }
});

test('role CLI projects an adapter config and returns durable projection receipts', async () => {
  const { root, store } = await gatewayFixture();
  setExecutionProfile(store, {
    id: 'fake-impl', roleId: 'implementer', adapterId: OPENCODE_ADAPTER_ID, agentId: 'implementer',
    providerId: TEST_PROVIDER_ID, modelId: TEST_MODEL_ID, adapterConfig: {}, observationIntervalMs: 1,
    noProgressTimeoutMs: 600_000, cancellationGraceMs: 10_000, tools: { read: true }, enabled: true,
  });
  addExecutionProfile(store, {
    id: 'consumer-profile', roleId: 'result-consumer', adapterId: OPENCODE_ADAPTER_ID, agentId: 'result-consumer',
    providerId: TEST_PROVIDER_ID, modelId: TEST_MODEL_ID, adapterConfig: {}, observationIntervalMs: 1,
    noProgressTimeoutMs: 600_000, cancellationGraceMs: 10_000, tools: { read: true }, enabled: true,
  });
  addModelCapabilityEvidence(store, {
    providerId: TEST_PROVIDER_ID,
    modelId: TEST_MODEL_ID,
    capabilityId: 'result-consumption',
    evidenceRef: 'evaluation:role-project-cli',
    evidenceDigest: TEST_EVIDENCE_DIGEST,
    assessedAt: TEST_ASSESSED_AT,
    expiresAt: TEST_EXPIRES_AT,
  });
  store.close();
  initTestRepo(root);
  const previous = process.cwd();
  process.chdir(root);
  try {
    const io = fakeIo();
    assert.equal(await command.run(['project'], io), EXIT.OK, io.errLines.join('\n'));
    const output: unknown = JSON.parse(io.outLines.join('\n'));
    const value = record(output);
    assert.equal(Array.isArray(value.receipts), true);
    assert.equal(Array.isArray(value.receipts) ? value.receipts.length : 0, 2);
    assert.equal(
      Array.isArray(value.projections)
        && value.projections.some((projection) => record(projection).adapterId === ROLE_CHARTER_PROJECTION_ADAPTER_ID),
      true,
    );
  } finally {
    process.chdir(previous);
  }
});
