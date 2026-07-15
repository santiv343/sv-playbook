import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { OpenCodeAdapter } from './opencode.js';
import type { AdapterObservationRequest, AdapterOperationRequest, AdapterTurnRequest, ExecutionProfile, RunSpec } from '../gateway.types.js';
import { HTTP_METHOD } from '../../platform.constants.js';
import {
  OPENCODE_API_PATH,
  openCodeSessionAbortPath,
  openCodeSessionMessagePath,
  openCodeSessionPath,
  openCodeSessionPromptPath,
  OPENCODE_OUTPUT_MODE,
  OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT,
} from './opencode.constants.js';

const TEST_SESSION_ID = 'ses_test';
const TEST_SESSION_PATH = openCodeSessionPath(TEST_SESSION_ID);

function profile(baseUrl: string): ExecutionProfile {
  return {
    id: 'oc-reviewer', roleId: 'reviewer', adapterId: 'opencode-shared-bootstrap-v1',
    agentId: 'reviewer', providerId: 'provider', modelId: 'model',
    adapterConfig: {
      baseUrl, allowedVersions: ['1.17.18'], outputMode: OPENCODE_OUTPUT_MODE.VALIDATED_TEXT,
    },
    observationIntervalMs: 1, noProgressTimeoutMs: 600_000, cancellationGraceMs: 10_000,
    tools: { read: true, task: false }, enabled: true,
  };
}

function runSpec(executionProfile: ExecutionProfile): RunSpec {
  return {
    id: 'RUN-1', roleId: 'reviewer', phase: 'review',
    workDefinitionRef: null, workflowEffectRef: null, inputArtifactId: null, contextPackId: 'CTX-1',
    executionProfile, contextTags: [], contextReferences: [], requestedCapabilities: [], outputContractRef: 'review-v1',
    noProgressTimeoutMs: 600_000, cancellationGraceMs: 10_000, specDigest: 'sha256:spec',
  };
}

function sessionRequest(executionProfile: ExecutionProfile): AdapterOperationRequest {
  return { runSpec: runSpec(executionProfile), intentId: 'INT-1', operationKey: 'create-session:RUN-1', directory: 'C:\\repo' };
}

interface MockState {
  session?: Record<string, unknown>;
  submitted?: Record<string, unknown>;
  promptPosts: number;
  agentPermissions?: readonly Record<string, string>[];
  toolStatus?: string;
  structuredOutput?: unknown;
  assistantText?: string;
}

const SAFE_AGENT_PERMISSIONS = [
  { permission: '*', pattern: '*', action: 'deny' },
  { permission: 'read', pattern: '*', action: 'allow' },
  { permission: 'task', pattern: '*', action: 'deny' },
] as const;

function staticResponse(url: URL, response: ServerResponse, state: MockState): boolean {
  if (url.pathname === OPENCODE_API_PATH.HEALTH) response.end(JSON.stringify({ healthy: true, version: '1.17.18' }));
  else if (url.pathname === OPENCODE_API_PATH.AGENT) response.end(JSON.stringify([{
    name: 'reviewer', model: { providerID: 'provider', modelID: 'model' },
    permission: state.agentPermissions ?? SAFE_AGENT_PERMISSIONS,
  }]));
  else if (url.pathname === OPENCODE_API_PATH.TOOL_IDS) response.end(JSON.stringify(['read', 'task']));
  else return false;
  return true;
}

function getResponse(url: URL, response: ServerResponse, state: MockState): boolean {
  if (url.pathname === TEST_SESSION_PATH) response.end(JSON.stringify(state.session));
  else if (url.pathname === OPENCODE_API_PATH.SESSION_STATUS) response.end('{}');
  else if (url.pathname === openCodeSessionMessagePath(TEST_SESSION_ID)) response.end(JSON.stringify([
    { info: { id: state.submitted?.messageID, role: 'user' }, parts: [] },
    { info: {
      id: 'assistant-1', role: 'assistant', parentID: state.submitted?.messageID, finish: 'stop',
      structured: state.structuredOutput,
    },
      parts: [{ id: 'tool-1', type: 'tool', tool: 'engram', state: { status: state.toolStatus ?? 'completed' } },
        { id: 'text-1', type: 'text', text: state.assistantText ?? '{"ok":true}' }] },
  ]));
  else return false;
  return true;
}

async function readJson(incoming: IncomingMessage): Promise<unknown> {
  incoming.setEncoding('utf8');
  let text = '';
  for await (const chunk of incoming) {
    if (typeof chunk !== 'string') throw new TypeError('expected UTF-8 request body');
    text += chunk;
  }
  const value: unknown = JSON.parse(text);
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};
}

async function postResponse(
  incoming: IncomingMessage,
  url: URL,
  response: ServerResponse,
  state: MockState,
): Promise<boolean> {
  if (incoming.method !== HTTP_METHOD.POST) return false;
  if (url.pathname === openCodeSessionAbortPath(TEST_SESSION_ID)) { response.end('{}'); return true; }
  if (url.pathname !== OPENCODE_API_PATH.SESSION && url.pathname !== openCodeSessionPromptPath(TEST_SESSION_ID)) return false;
  const body = asRecord(await readJson(incoming));
  if (url.pathname === OPENCODE_API_PATH.SESSION) {
    state.session = { id: TEST_SESSION_ID, slug: 'test', projectID: 'project', directory: url.searchParams.get('directory'),
      title: 'RUN-1', version: '1.17.18', time: { created: 1, updated: 1 }, ...body };
    response.end(JSON.stringify(state.session));
  } else {
    state.promptPosts += 1;
    state.submitted = body;
    response.statusCode = 204;
    response.end();
  }
  return true;
}

async function handleRequest(incoming: IncomingMessage, response: ServerResponse, state: MockState): Promise<void> {
  const url = new URL(incoming.url ?? '/', 'http://localhost');
  if (staticResponse(url, response, state)) return;
  if (incoming.method === HTTP_METHOD.GET && getResponse(url, response, state)) return;
  if (await postResponse(incoming, url, response, state)) return;
  response.statusCode = 404;
  response.end();
}

test('OpenCode adapter submits once and reports actual terminal tools and output', async () => {
  const state: MockState = { promptPosts: 0 };
  const server = createServer((incoming, response) => { void handleRequest(incoming, response, state); });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('test server has no TCP address');
    const adapter = new OpenCodeAdapter();
    const executionProfile = profile(`http://127.0.0.1:${address.port}`);
    const createRequest = sessionRequest(executionProfile);
    const verified = await adapter.verifyProfile(createRequest.runSpec, createRequest.directory);
    const created = await adapter.createSession(createRequest, verified);
    const turnRequest: AdapterTurnRequest = {
      ...createRequest, intentId: 'INT-2', operationKey: 'submit-turn:RUN-1:1',
      sessionId: created.sessionId, prompt: '{"task":"review"}', outputSchema: { type: 'object' },
    };
    const receipt = await adapter.submitTurn(turnRequest);
    assert.equal(receipt.sessionId, 'ses_test');
    assert.equal(receipt.submissionReceipt.deliveryStatus, 'accepted');
    const submitted = state.submitted;
    assert.ok(submitted);
    assert.deepEqual(submitted.tools, { read: true, task: false });
    assert.equal(Object.hasOwn(submitted, 'format'), false);
    assert.equal(Object.hasOwn(submitted, 'outputFormat'), false);
    assert.equal(submitted.system, `${OPENCODE_VALIDATED_TEXT_SYSTEM_PROMPT}\nJSON Schema:\n{"type":"object"}`);
    assert.equal(state.promptPosts, 1);
    const observationRequest: AdapterObservationRequest = { ...turnRequest, messageId: receipt.messageId };
    const delivered = submitted;
    delete state.submitted;
    const pending = await adapter.observeRun(observationRequest);
    assert.equal(pending.state, 'running');
    assert.equal(pending.evidence.deliveryState, 'pending');
    state.submitted = delivered;
    const observation = await adapter.observeRun(observationRequest);
    assert.equal(observation.state, 'completed');
    assert.equal(observation.output, '{"ok":true}');
    assert.deepEqual(observation.observedToolIds, ['engram']);
    state.structuredOutput = { source: 'structured' };
    state.assistantText = 'ignored plain text';
    const structured = await adapter.observeRun(observationRequest);
    assert.equal(structured.output, '{"source":"structured"}');
    state.toolStatus = 'error';
    const denied = await adapter.observeRun(observationRequest);
    assert.deepEqual(denied.observedToolIds, []);
    const nativeProfile: ExecutionProfile = {
      ...executionProfile,
      adapterConfig: { ...executionProfile.adapterConfig, outputMode: OPENCODE_OUTPUT_MODE.NATIVE },
    };
    await adapter.submitTurn({
      ...turnRequest, runSpec: runSpec(nativeProfile), operationKey: 'submit-turn:RUN-1:2',
    });
    assert.deepEqual(state.submitted.format, {
      type: 'json_schema', schema: { type: 'object' }, retryCount: 2,
    });
    assert.equal((await adapter.cancelRun(observationRequest)).acknowledged, true);
  } finally {
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve(); }); });
  }
});

test('OpenCode adapter rejects an agent that is not default-deny before creating a session', async () => {
  const state: MockState = {
    promptPosts: 0,
    agentPermissions: [{ permission: '*', pattern: '*', action: 'allow' }],
  };
  const server = createServer((incoming, response) => { void handleRequest(incoming, response, state); });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('test server has no TCP address');
    const adapter = new OpenCodeAdapter();
    const executionProfile = profile(`http://127.0.0.1:${address.port}`);
    await assert.rejects(
      adapter.verifyProfile(runSpec(executionProfile), 'C:\\repo'),
      (error: unknown) => error instanceof Error && error.message.includes('not default-deny'),
    );
    assert.equal(state.promptPosts, 0);
  } finally {
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve(); }); });
  }
});
