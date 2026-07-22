import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOpenCodeOutputContract } from './opencode-output-request.js';
import { OPENCODE_OUTPUT_MODE, OPENCODE_PROMPTED_JSON_SYSTEM_PROMPT, OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT } from './opencode.constants.js';

const SCHEMA = { type: 'object' } as const;

function systemPrompt(body: Record<string, unknown>): string {
  const value = body.system;
  if (typeof value !== 'string') throw new TypeError('expected body.system to be a string');
  return value;
}

test('NATIVE mode sets the format field and no system prompt', () => {
  const body: Record<string, unknown> = {};
  applyOpenCodeOutputContract(body, OPENCODE_OUTPUT_MODE.NATIVE, SCHEMA);
  assert.equal(Object.hasOwn(body, 'system'), false);
  assert.deepEqual(body.format, { type: 'json_schema', schema: SCHEMA, retryCount: 2 });
});

test('VALIDATED_TEXT mode prohibits tools in its system prompt and sets no format field', () => {
  const body: Record<string, unknown> = {};
  applyOpenCodeOutputContract(body, OPENCODE_OUTPUT_MODE.VALIDATED_TEXT, SCHEMA);
  assert.equal(Object.hasOwn(body, 'format'), false);
  assert.equal(body.system, `${OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT}\nJSON Schema:\n{"type":"object"}`);
  assert.match(systemPrompt(body), /no tools/i);
});

test('PROMPTED_JSON mode asks for JSON at the end without forbidding tools, and sets no format field', () => {
  const body: Record<string, unknown> = {};
  applyOpenCodeOutputContract(body, OPENCODE_OUTPUT_MODE.PROMPTED_JSON, SCHEMA);
  assert.equal(Object.hasOwn(body, 'format'), false);
  assert.equal(body.system, `${OPENCODE_PROMPTED_JSON_SYSTEM_PROMPT}\nJSON Schema:\n{"type":"object"}`);
  assert.doesNotMatch(systemPrompt(body), /no tools/i);
  assert.match(systemPrompt(body), /tools are available/i);
});
