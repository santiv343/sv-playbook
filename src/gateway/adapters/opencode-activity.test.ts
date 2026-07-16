import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADAPTER_RUN_STATE } from '../gateway.types.js';
import { openCodeRunActivity } from './opencode-activity.js';
import { OPENCODE_RUN_ACTIVITY, OPENCODE_TOOL_STATE } from './opencode.constants.js';

test('OpenCode activity exposes progress shape without exposing content', () => {
  assert.equal(openCodeRunActivity(undefined, ADAPTER_RUN_STATE.RUNNING), OPENCODE_RUN_ACTIVITY.STARTING);
  assert.equal(openCodeRunActivity({ parts: [{ type: 'reasoning', text: 'private' }] }, ADAPTER_RUN_STATE.RUNNING),
    OPENCODE_RUN_ACTIVITY.THINKING);
  assert.equal(openCodeRunActivity({ parts: [{ type: 'text', text: 'private' }] }, ADAPTER_RUN_STATE.RUNNING),
    OPENCODE_RUN_ACTIVITY.RESPONDING);
  assert.equal(openCodeRunActivity({ parts: [{ type: 'tool', state: { status: OPENCODE_TOOL_STATE.RUNNING } }] },
    ADAPTER_RUN_STATE.RUNNING), OPENCODE_RUN_ACTIVITY.USING_TOOL);
  assert.equal(openCodeRunActivity({ parts: [] }, ADAPTER_RUN_STATE.COMPLETED), OPENCODE_RUN_ACTIVITY.TERMINAL);
});
