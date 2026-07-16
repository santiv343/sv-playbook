import assert from 'node:assert/strict';
import test from 'node:test';
import { VERIFICATION_COMPONENT } from './verification.constants.js';
import { runVerification } from './runner.js';
import type { VerificationExecutor } from './verification.types.js';

test('canonical verification fails when an activated authored check is red', async () => {
  const calls: string[] = [];
  const executor: VerificationExecutor = {
    execute(component) {
      calls.push(component.id);
      return Promise.resolve({
        id: component.id,
        status: component.id === VERIFICATION_COMPONENT.PLAYBOOK ? 'fail' : 'pass',
        exitCode: component.id === VERIFICATION_COMPONENT.PLAYBOOK ? 1 : 0,
      });
    },
  };

  const receipt = await runVerification(executor);

  assert.equal(receipt.status, 'fail');
  assert.deepEqual(calls, [
    VERIFICATION_COMPONENT.TYPECHECK,
    VERIFICATION_COMPONENT.LINT,
    VERIFICATION_COMPONENT.TEST,
    VERIFICATION_COMPONENT.PLAYBOOK,
  ]);
  assert.equal(new Set(calls).size, calls.length);
});

test('canonical verification passes only when every activated component passes', async () => {
  const executor: VerificationExecutor = {
    execute(component) {
      return Promise.resolve({ id: component.id, status: 'pass', exitCode: 0 });
    },
  };

  const receipt = await runVerification(executor);

  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.components.length, 4);
  assert.ok(receipt.manifestDigest.startsWith('sha256:'));
});
