import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../main.js';
import { EXIT } from '../command.constants.js';
import type { Io } from '../command.types.js';
import type { ConformanceReceipt } from '../../enforcement/conformance.types.js';

function isConformanceReceipt(value: unknown): value is ConformanceReceipt {
  return typeof value === 'object' && value !== null && 'verdict' in value;
}

function readReceipt(lines: string[]): ConformanceReceipt {
  const raw: unknown = JSON.parse(lines.join('\n'));
  if (!isConformanceReceipt(raw)) throw new TypeError('invalid receipt');
  return raw;
}

function fakeIo(): Io & { outLines: string[]; errLines: string[] } {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return { outLines, errLines, out: (l) => void outLines.push(l), err: (l) => void errLines.push(l) };
}

const MINIMAL_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: { name: { type: 'string' } },
};

const MINIMAL_PROFILE = { name: 'test-profile' };

const VALID_CONTRACT = {
  contract_version: '1.0.0',
  control_catalog: {
    'CTRL-001': {
      classification: 'runtime_enforced',
      owner: 'test-controller',
      enforcement_point: 'before publish',
      deterministic_outcome: 'accept or block',
      failure_code: 'TEST_FAIL',
      evidence_receipt: 'TestReceipt',
      test_ids: ['SC-001'],
    },
  },
  acceptance_scenarios: ['SC-001: test scenario passes'],
};

test('invalid profile exits non-zero with schema failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enforce-test-'));
  try {
    const invalidProfile = {};
    await writeFile(join(dir, 'schema.json'), JSON.stringify(MINIMAL_SCHEMA));
    await writeFile(join(dir, 'profile.json'), JSON.stringify(invalidProfile));
    await writeFile(join(dir, 'contract.json'), JSON.stringify(VALID_CONTRACT));

    const io = fakeIo();
    const code = await main(['enforce', join(dir, 'contract.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io);
    assert.notEqual(code, EXIT.OK);
    const receipt = readReceipt(io.outLines);
    assert.equal(receipt.verdict, 'nonconformant');
    assert.ok(receipt.schema_errors.length > 0, 'expected schema errors');
    assert.ok(receipt.failure_codes.includes('SCHEMA_INVALID'), 'expected SCHEMA_INVALID failure code');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('duplicate scenario IDs detected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enforce-test-'));
  try {
    const contract = {
      ...VALID_CONTRACT,
      acceptance_scenarios: [
        'SC-001: first scenario',
        'SC-001: duplicate scenario',
      ],
    };
    await writeFile(join(dir, 'schema.json'), JSON.stringify(MINIMAL_SCHEMA));
    await writeFile(join(dir, 'profile.json'), JSON.stringify(MINIMAL_PROFILE));
    await writeFile(join(dir, 'contract.json'), JSON.stringify(contract));

    const io = fakeIo();
    const code = await main(['enforce', join(dir, 'contract.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io);
    assert.notEqual(code, EXIT.OK);
    const receipt = readReceipt(io.outLines);
    assert.deepEqual(receipt.duplicate_scenario_ids, ['SC-001']);
    assert.equal(receipt.verdict, 'nonconformant');
    assert.ok(receipt.failure_codes.includes('DUPLICATE_SCENARIO_IDS'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('orphaned scenarios detected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enforce-test-'));
  try {
    const contract = {
      ...VALID_CONTRACT,
      acceptance_scenarios: [
        'SC-001: referenced scenario',
        'SC-002: orphaned scenario',
      ],
    };
    await writeFile(join(dir, 'schema.json'), JSON.stringify(MINIMAL_SCHEMA));
    await writeFile(join(dir, 'profile.json'), JSON.stringify(MINIMAL_PROFILE));
    await writeFile(join(dir, 'contract.json'), JSON.stringify(contract));

    const io = fakeIo();
    const code = await main(['enforce', join(dir, 'contract.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io);
    assert.notEqual(code, EXIT.OK);
    const receipt = readReceipt(io.outLines);
    assert.deepEqual(receipt.orphaned_scenarios, ['SC-002']);
    assert.equal(receipt.verdict, 'nonconformant');
    assert.ok(receipt.failure_codes.includes('ORPHANED_SCENARIOS'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dangling references detected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enforce-test-'));
  try {
    const contract = {
      ...VALID_CONTRACT,
      control_catalog: {
        'CTRL-001': {
          classification: 'runtime_enforced',
          owner: 'test-controller',
          enforcement_point: 'ep',
          deterministic_outcome: 'do',
          failure_code: 'FC',
          evidence_receipt: 'ER',
          test_ids: ['SC-001', 'SC-999'],
        },
      },
      acceptance_scenarios: ['SC-001: only valid scenario'],
    };
    await writeFile(join(dir, 'schema.json'), JSON.stringify(MINIMAL_SCHEMA));
    await writeFile(join(dir, 'profile.json'), JSON.stringify(MINIMAL_PROFILE));
    await writeFile(join(dir, 'contract.json'), JSON.stringify(contract));

    const io = fakeIo();
    const code = await main(['enforce', join(dir, 'contract.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io);
    assert.notEqual(code, EXIT.OK);
    const receipt = readReceipt(io.outLines);
    assert.ok(receipt.dangling_references.length > 0);
    assert.ok(receipt.dangling_references[0]?.includes('SC-999'));
    assert.equal(receipt.verdict, 'nonconformant');
    assert.ok(receipt.failure_codes.includes('DANGLING_REFERENCES'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('incomplete control detected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enforce-test-'));
  try {
    const contract = {
      ...VALID_CONTRACT,
      control_catalog: {
        'CTRL-001': {
          classification: 'runtime_enforced',
          owner: 'test-controller',
          enforcement_point: 'ep',
          deterministic_outcome: 'do',
          failure_code: 'FC',
          test_ids: ['SC-001'],
        },
      },
    };
    await writeFile(join(dir, 'schema.json'), JSON.stringify(MINIMAL_SCHEMA));
    await writeFile(join(dir, 'profile.json'), JSON.stringify(MINIMAL_PROFILE));
    await writeFile(join(dir, 'contract.json'), JSON.stringify(contract));

    const io = fakeIo();
    const code = await main(['enforce', join(dir, 'contract.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io);
    assert.notEqual(code, EXIT.OK);
    const receipt = readReceipt(io.outLines);
    assert.ok(receipt.incomplete_controls.includes('CTRL-001'));
    assert.equal(receipt.verdict, 'nonconformant');
    assert.ok(receipt.failure_codes.includes('INCOMPLETE_CONTROLS'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('agent owner detected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enforce-test-'));
  try {
    const contract = {
      ...VALID_CONTRACT,
      control_catalog: {
        'CTRL-001': {
          classification: 'runtime_enforced',
          owner: 'llm',
          enforcement_point: 'ep',
          deterministic_outcome: 'do',
          failure_code: 'FC',
          evidence_receipt: 'ER',
          test_ids: ['SC-001'],
        },
      },
    };
    await writeFile(join(dir, 'schema.json'), JSON.stringify(MINIMAL_SCHEMA));
    await writeFile(join(dir, 'profile.json'), JSON.stringify(MINIMAL_PROFILE));
    await writeFile(join(dir, 'contract.json'), JSON.stringify(contract));

    const io = fakeIo();
    const code = await main(['enforce', join(dir, 'contract.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io);
    assert.notEqual(code, EXIT.OK);
    const receipt = readReceipt(io.outLines);
    assert.ok(receipt.agent_owner_controls.includes('CTRL-001'));
    assert.equal(receipt.verdict, 'nonconformant');
    assert.ok(receipt.failure_codes.includes('AGENT_OWNER'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('canonical digests are independent of JSON formatting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enforce-test-'));
  try {
    const contractContent = JSON.stringify(VALID_CONTRACT);
    const contractReformatted = JSON.stringify(VALID_CONTRACT, null, 2);
    const contractReordered = JSON.stringify({ acceptance_scenarios: VALID_CONTRACT.acceptance_scenarios, contract_version: VALID_CONTRACT.contract_version, control_catalog: VALID_CONTRACT.control_catalog });

    await writeFile(join(dir, 'schema.json'), JSON.stringify(MINIMAL_SCHEMA));
    await writeFile(join(dir, 'profile.json'), JSON.stringify(MINIMAL_PROFILE));
    await writeFile(join(dir, 'contract-compact.json'), contractContent);
    await writeFile(join(dir, 'contract-pretty.json'), contractReformatted);
    await writeFile(join(dir, 'contract-reordered.json'), contractReordered);

    const io1 = fakeIo();
    const code1 = await main(['enforce', join(dir, 'contract-compact.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io1);
    assert.equal(code1, EXIT.OK);

    const io2 = fakeIo();
    const code2 = await main(['enforce', join(dir, 'contract-pretty.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io2);
    assert.equal(code2, EXIT.OK);

    const io3 = fakeIo();
    const code3 = await main(['enforce', join(dir, 'contract-reordered.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io3);
    assert.equal(code3, EXIT.OK);

    const receipt1 = readReceipt(io1.outLines);
    const receipt2 = readReceipt(io2.outLines);
    const receipt3 = readReceipt(io3.outLines);

    assert.equal(receipt1.contract_digest, receipt2.contract_digest,
      'compact and pretty-printed must produce same digest');
    assert.equal(receipt2.contract_digest, receipt3.contract_digest,
      'different key order must produce same digest');
    assert.equal(receipt1.schema_digest, receipt2.schema_digest,
      'schema digest must be stable');
    assert.equal(receipt1.profile_digest, receipt2.profile_digest,
      'profile digest must be stable');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('duplicate control IDs detected in raw JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enforce-test-'));
  try {
    const validCtrl = JSON.stringify({
      classification: 'runtime_enforced',
      owner: 'test-controller',
      enforcement_point: 'before publish',
      deterministic_outcome: 'accept or block',
      failure_code: 'TEST_FAIL',
      evidence_receipt: 'TestReceipt',
      test_ids: ['SC-001'],
    });
    const rawContract = `{"contract_version":"1.0.0","control_catalog":{"CTRL-001":${validCtrl},"CTRL-001":${validCtrl}},"acceptance_scenarios":["SC-001: test scenario passes"]}`;

    await writeFile(join(dir, 'schema.json'), JSON.stringify(MINIMAL_SCHEMA));
    await writeFile(join(dir, 'profile.json'), JSON.stringify(MINIMAL_PROFILE));
    await writeFile(join(dir, 'contract.json'), rawContract);

    const io = fakeIo();
    const code = await main(['enforce', join(dir, 'contract.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io);
    assert.notEqual(code, EXIT.OK);
    const receipt = readReceipt(io.outLines);
    assert.ok(receipt.duplicate_control_ids.includes('CTRL-001'),
      `expected CTRL-001 in duplicate_control_ids, got: ${JSON.stringify(receipt.duplicate_control_ids)}`);
    assert.equal(receipt.verdict, 'nonconformant');
    assert.ok(receipt.failure_codes.includes('DUPLICATE_CONTROL_IDS'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('agent owner with various patterns detected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enforce-test-'));
  try {
    const contract = {
      contract_version: '1.0.0',
      control_catalog: {
        'LLM-CTRL': {
          classification: 'runtime_enforced',
          owner: 'llm-controller',
          enforcement_point: 'ep',
          deterministic_outcome: 'do',
          failure_code: 'FC',
          evidence_receipt: 'ER',
          test_ids: ['SC-001'],
        },
        'AI-CTRL': {
          classification: 'runtime_enforced',
          owner: 'ai-agent',
          enforcement_point: 'ep',
          deterministic_outcome: 'do',
          failure_code: 'FC',
          evidence_receipt: 'ER',
          test_ids: ['SC-001'],
        },
      },
      acceptance_scenarios: ['SC-001: test scenario'],
    };
    await writeFile(join(dir, 'schema.json'), JSON.stringify(MINIMAL_SCHEMA));
    await writeFile(join(dir, 'profile.json'), JSON.stringify(MINIMAL_PROFILE));
    await writeFile(join(dir, 'contract.json'), JSON.stringify(contract));

    const io = fakeIo();
    const code = await main(['enforce', join(dir, 'contract.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io);
    assert.notEqual(code, EXIT.OK);
    const receipt = readReceipt(io.outLines);
    assert.ok(receipt.agent_owner_controls.includes('LLM-CTRL'),
      `expected LLM-CTRL in agent_owner_controls, got: ${JSON.stringify(receipt.agent_owner_controls)}`);
    assert.ok(receipt.agent_owner_controls.includes('AI-CTRL'),
      `expected AI-CTRL in agent_owner_controls, got: ${JSON.stringify(receipt.agent_owner_controls)}`);
    assert.equal(receipt.verdict, 'nonconformant');
    assert.ok(receipt.failure_codes.includes('AGENT_OWNER'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('valid fixture produces exit 0 with conformant receipt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enforce-test-'));
  try {
    await writeFile(join(dir, 'schema.json'), JSON.stringify(MINIMAL_SCHEMA));
    await writeFile(join(dir, 'profile.json'), JSON.stringify(MINIMAL_PROFILE));
    await writeFile(join(dir, 'contract.json'), JSON.stringify(VALID_CONTRACT));

    const io = fakeIo();
    const code = await main(['enforce', join(dir, 'contract.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], io);
    assert.equal(code, EXIT.OK, `expected exit 0, got ${code}`);
    const receipt = readReceipt(io.outLines);
    assert.equal(receipt.verdict, 'conformant');
    assert.ok(receipt.schema_valid, 'schema must be valid');
    assert.equal(receipt.schema_errors.length, 0);
    assert.equal(receipt.control_count, 1);
    assert.equal(receipt.scenario_count, 1);
    assert.deepEqual(receipt.duplicate_control_ids, []);
    assert.deepEqual(receipt.duplicate_scenario_ids, []);
    assert.deepEqual(receipt.orphaned_scenarios, []);
    assert.deepEqual(receipt.dangling_references, []);
    assert.deepEqual(receipt.incomplete_controls, []);
    assert.deepEqual(receipt.agent_owner_controls, []);
    assert.ok(receipt.contract_digest.length === 64, 'expected hex sha256 digest');
    assert.ok(receipt.schema_digest.length === 64, 'expected hex sha256 digest');
    assert.ok(receipt.profile_digest.length === 64, 'expected hex sha256 digest');
    assert.equal(receipt.ruleset_version, '1.0.0');
    assert.ok(typeof receipt.validator_version === 'string' && receipt.validator_version.length > 0);
    assert.equal(receipt.failure_codes.length, 0);

    const code2 = await main(['enforce', join(dir, 'contract.json'), join(dir, 'schema.json'), join(dir, 'profile.json')], fakeIo());
    assert.equal(code2, EXIT.OK, 'repeatable: expected exit 0');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
