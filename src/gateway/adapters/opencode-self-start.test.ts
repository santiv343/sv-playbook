import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { adapterConfig, health } from './opencode.js';
import { OPENCODE_OUTPUT_MODE } from './opencode.constants.js';
import type { ExecutionProfile, GatewayRuntime } from '../gateway.types.js';

const INSTANT_RUNTIME: GatewayRuntime = { now: () => 0, sleep: async () => {} };

function profile(baseUrl: string): ExecutionProfile {
  return {
    id: 'oc-reviewer', roleId: 'reviewer', adapterId: 'opencode-shared-bootstrap-v1',
    agentId: 'reviewer', providerId: 'provider', modelId: 'model',
    adapterConfig: { baseUrl, allowedVersions: ['1.17.18'], outputMode: OPENCODE_OUTPUT_MODE.VALIDATED_TEXT },
    observationIntervalMs: 1, noProgressTimeoutMs: 600_000, cancellationGraceMs: 10_000,
    tools: {}, enabled: true,
  };
}

async function unusedPort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  assert.ok(address !== null && typeof address !== 'string');
  probe.close();
  await once(probe, 'close');
  return address.port;
}

test('health() reaches an already-running server without calling the launcher', async () => {
  const server = createServer((_req, res) => {
    res.end(JSON.stringify({ healthy: true, version: '1.17.18' }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');

  let launched = false;
  const version = await health(adapterConfig(profile(`http://127.0.0.1:${address.port}`)), { launch: () => { launched = true; } }, INSTANT_RUNTIME);

  assert.equal(version, '1.17.18');
  assert.equal(launched, false);
  server.close();
  await once(server, 'close');
});

test('health() launches the server and retries when it is not reachable yet', async () => {
  const port = await unusedPort();
  let server: Server | undefined;
  let launchCalls = 0;

  const launcher = {
    launch: () => {
      launchCalls += 1;
      server = createServer((_req, res) => {
        res.end(JSON.stringify({ healthy: true, version: '1.17.18' }));
      });
      server.listen(port, '127.0.0.1');
    },
  };

  const version = await health(adapterConfig(profile(`http://127.0.0.1:${port}`)), launcher, INSTANT_RUNTIME);

  assert.equal(version, '1.17.18');
  assert.equal(launchCalls, 1);
  assert.ok(server);
  server.close();
  await once(server, 'close');
});

test('health() throws a typed error if the server never becomes reachable after launch', async () => {
  const port = await unusedPort();
  let launchCalls = 0;
  const launcher = { launch: () => { launchCalls += 1; } };

  await assert.rejects(
    () => health(adapterConfig(profile(`http://127.0.0.1:${port}`)), launcher, INSTANT_RUNTIME),
    (error: unknown) => error instanceof Error && error.message.includes('did not become reachable'),
  );
  assert.equal(launchCalls, 1);
});
