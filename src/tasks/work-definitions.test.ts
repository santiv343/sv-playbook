import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { openStore } from '../db/store.js';
import { packets } from './schema.constants.js';
import { STATUS } from './service.constants.js';
import {
  WORK_DEFINITION_ERROR,
  WORK_DEFINITION_INITIAL_VERSION,
  WORK_DEFINITION_VERSION_INCREMENT,
} from './work-definition.constants.js';
import { WorkDefinitionError } from './work-definition.errors.js';
import { amendPacket, createPacket } from './service.js';
import {
  loadWorkDefinition,
  parseWorkDefinitionReference,
  resolveEligibleWorkDefinition,
  resolveWorkDefinition,
} from './work-definitions.js';

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof WorkDefinitionError && error.code === code;
}

test('task mutations create immutable, auto-incremented work definitions only for semantic changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-work-definition-'));
  const store = openStore(root);
  createPacket(store, root, {
    id: 'BUG-001',
    title: 'Original title',
    dependsOn: [],
    writeSet: ['src/**'],
    requirements: ['original requirement'],
    evidenceRequired: ['verify'],
    tags: ['backend'],
  }, 'Original body.', 'bug');

  const first = resolveWorkDefinition(store, parseWorkDefinitionReference(`BUG-001@${WORK_DEFINITION_INITIAL_VERSION}`));
  assert.equal(first.value.body, 'Original body.');
  assert.deepEqual(first.value.tags, ['backend']);

  amendPacket(store, root, 'BUG-001', { body: 'Changed body.' });
  const nextVersion = WORK_DEFINITION_INITIAL_VERSION + WORK_DEFINITION_VERSION_INCREMENT;
  const second = resolveWorkDefinition(store, parseWorkDefinitionReference(`BUG-001@${nextVersion}`));
  assert.equal(second.value.body, 'Changed body.');
  assert.notEqual(second.digest, first.digest);
  assert.equal(resolveWorkDefinition(store, parseWorkDefinitionReference(`BUG-001@${WORK_DEFINITION_INITIAL_VERSION}`)).digest, first.digest);

  amendPacket(store, root, 'BUG-001', { body: 'Changed body.' });
  assert.equal(loadWorkDefinition(store, 'BUG-001').version, nextVersion);
  store.close();
});

test('work definition references reject missing, malformed, and unversioned identities', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-work-definition-errors-'));
  const store = openStore(root);
  createPacket(store, root, {
    id: 'BUG-002', title: 'Task', dependsOn: [], writeSet: ['src/**'],
    requirements: [], evidenceRequired: [],
  }, 'Body.');

  assert.throws(() => parseWorkDefinitionReference('BUG-002'), hasCode(WORK_DEFINITION_ERROR.INVALID_REFERENCE));
  assert.throws(() => parseWorkDefinitionReference('BUG-002@0'), hasCode(WORK_DEFINITION_ERROR.INVALID_REFERENCE));
  assert.throws(
    () => resolveWorkDefinition(store, parseWorkDefinitionReference('BUG-404@1')),
    hasCode(WORK_DEFINITION_ERROR.UNKNOWN),
  );
  assert.throws(
    () => resolveWorkDefinition(store, parseWorkDefinitionReference('BUG-002@2')),
    hasCode(WORK_DEFINITION_ERROR.VERSION_NOT_FOUND),
  );
  store.close();
});

test('eligibility rejects stale definitions and terminal task states with stable codes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'svp-work-definition-eligibility-'));
  const store = openStore(root);
  createPacket(store, root, {
    id: 'BUG-004', title: 'Task', dependsOn: [], writeSet: ['src/**'],
    requirements: [], evidenceRequired: [],
  }, 'First body.');
  const first = parseWorkDefinitionReference(`BUG-004@${WORK_DEFINITION_INITIAL_VERSION}`);
  amendPacket(store, root, 'BUG-004', { body: 'Second body.' });
  assert.throws(() => resolveEligibleWorkDefinition(store, first), hasCode(WORK_DEFINITION_ERROR.STALE));

  const latest = loadWorkDefinition(store, 'BUG-004').reference;
  store.orm.update(packets).set({ status: STATUS.DONE }).where(eq(packets.id, 'BUG-004')).run();
  assert.throws(
    () => resolveEligibleWorkDefinition(store, latest),
    hasCode(WORK_DEFINITION_ERROR.STATUS_INELIGIBLE),
  );
  store.close();
});
