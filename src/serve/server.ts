import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContextError } from '../context/context.errors.js';
import type { Store } from '../db/store.types.js';
import { resolveHumanWorkflowEffect } from '../orchestration/effect-completion.js';
import { startWorkflow } from '../orchestration/service.js';
import { readWorkflowDashboard } from '../orchestration/observability.js';
import { readWorkflowLaunchCatalog } from '../orchestration/launch-catalog.js';
import { startHumanIntake } from '../orchestration/human-intake.js';
import { HUMAN_INTAKE_VALUE } from '../orchestration/human-intake.constants.js';
import { EMPTY_SIZE, HTTP_METHOD, HTTP_STATUS, PATH_TOKEN, PROCESS_EVENT, REFERENCE_KIND, REFERENCE_MIN_VERSION } from '../platform.constants.js';
import { readBoardStatus } from '../status/status.js';
import { SERVE_DEFAULT, SERVE_ROUTE } from '../cli/commands/serve.constants.js';
import { CONTENT_TYPE, RESOLUTION_SUFFIX, SERVER_RESPONSE, SSE_EVENT } from './server.constants.js';
import type { HumanIntakeBody, HumanResolutionBody, OperationalDashboard, OperationalServerOptions, StartWorkflowBody } from './server.types.js';
import { prepareRunSpec } from '../gateway/run-spec.js';
import type { WorkRunSpecRequest } from '../gateway/gateway.types.js';
import { WorkDefinitionError } from '../tasks/work-definition.errors.js';
import { readPromotionDashboard } from '../promotion/promotion.receipts.js';

const UI_ROOT = fileURLToPath(new URL('./assets', import.meta.url));
const STATIC_ASSETS = new Map<string, { path: string; type: string }>([
  [SERVE_ROUTE.ROOT, { path: join(UI_ROOT, 'index.html'), type: CONTENT_TYPE.HTML }],
  [SERVE_ROUTE.APP, { path: join(UI_ROOT, 'app.js'), type: CONTENT_TYPE.JAVASCRIPT }],
  [SERVE_ROUTE.STYLES, { path: join(UI_ROOT, 'styles.css'), type: CONTENT_TYPE.CSS }],
  [SERVE_ROUTE.ICONS, { path: join(UI_ROOT, 'icons.mjs'), type: CONTENT_TYPE.JAVASCRIPT }],
]);

function dashboard(store: Store, repoRoot: string): OperationalDashboard {
  return {
    board: readBoardStatus(store, repoRoot),
    workflow: readWorkflowDashboard(store),
    promotions: readPromotionDashboard(store),
    generatedAt: new Date().toISOString(),
  };
}

function send(res: ServerResponse, status: number, contentType: string, body: string): void {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, CONTENT_TYPE.JSON, JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function staticResponse(url: URL, res: ServerResponse): boolean {
  const known = STATIC_ASSETS.get(url.pathname);
  if (known === undefined) return false;
  send(res, HTTP_STATUS.OK, known.type, readFileSync(known.path, 'utf8'));
  return true;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on(PROCESS_EVENT.DATA, (chunk: string) => {
      body += chunk;
      if (Buffer.byteLength(body) > SERVE_DEFAULT.MAX_BODY_BYTES) reject(new RangeError('request body is too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on(PROCESS_EVENT.ERROR, reject);
  });
}

function humanResolution(value: unknown): HumanResolutionBody {
  if (typeof value !== 'object' || value === null || !('resolvedBy' in value) || !('output' in value)) {
    throw new TypeError('resolvedBy and output are required');
  }
  const resolvedBy = Reflect.get(value, 'resolvedBy');
  if (typeof resolvedBy !== 'string' || resolvedBy.trim().length === 0) throw new TypeError('resolvedBy must be a string');
  return { resolvedBy, output: Reflect.get(value, 'output') };
}

function requiredBodyString(value: Record<string, unknown>, field: string): string {
  const result = Reflect.get(value, field);
  if (typeof result !== 'string' || result.trim().length === 0) throw new TypeError(`${field} must be a string`);
  return result;
}

function workflowStart(value: unknown): StartWorkflowBody {
  if (typeof value !== 'object' || value === null || !('input' in value)) throw new TypeError('workflow input is required');
  const record = Object.fromEntries(Object.entries(value));
  const version = Reflect.get(record, 'definitionVersion');
  if (version !== undefined && (!Number.isInteger(version) || Number(version) < REFERENCE_MIN_VERSION)) {
    throw new TypeError('definitionVersion must be a positive integer');
  }
  const body: StartWorkflowBody = {
    definitionId: requiredBodyString(record, 'definitionId'),
    subjectRef: requiredBodyString(record, 'subjectRef'),
    requestedBy: requiredBodyString(record, 'requestedBy'),
    inputContractRef: requiredBodyString(record, 'inputContractRef'),
    input: Reflect.get(record, 'input'),
  };
  if (typeof version === 'number') body.definitionVersion = version;
  return body;
}

function humanIntake(value: unknown): HumanIntakeBody {
  if (!isRecord(value)) throw new TypeError('human intake body is required');
  const message = value.message;
  if (typeof message !== 'string' || message.trim().length === 0) throw new TypeError('message must be a string');
  return { message };
}

function workRunSpecRequest(value: unknown): WorkRunSpecRequest {
  if (!isRecord(value) || !isRecord(value.workDefinitionRef)) throw new TypeError('typed workDefinitionRef is required');
  const reference = value.workDefinitionRef;
  if (reference.kind !== REFERENCE_KIND.WORK_DEFINITION || typeof reference.id !== 'string'
    || !Number.isInteger(reference.version) || Number(reference.version) < REFERENCE_MIN_VERSION) {
    throw new TypeError('workDefinitionRef must be a versioned work-definition reference');
  }
  const request: WorkRunSpecRequest = {
    roleId: requiredBodyString(value, 'roleId'),
    phase: requiredBodyString(value, 'phase'),
    workDefinitionRef: { kind: REFERENCE_KIND.WORK_DEFINITION, id: reference.id, version: Number(reference.version) },
  };
  if (value.executionProfileId !== undefined) {
    request.executionProfileId = requiredBodyString(value, 'executionProfileId');
  }
  return request;
}

function resolutionEffectId(pathname: string): string | undefined {
  if (!pathname.startsWith(SERVE_ROUTE.HUMAN_EFFECTS) || !pathname.endsWith(RESOLUTION_SUFFIX)) return undefined;
  const encoded = pathname.slice(SERVE_ROUTE.HUMAN_EFFECTS.length, -RESOLUTION_SUFFIX.length);
  return encoded.length === 0 || encoded.includes(PATH_TOKEN.POSIX_SEPARATOR) ? undefined : decodeURIComponent(encoded);
}

function handleGet(store: Store, repoRoot: string, url: URL, res: ServerResponse): boolean {
  if (staticResponse(url, res)) return true;
  if (url.pathname === SERVE_ROUTE.BOARD) {
    sendJson(res, HTTP_STATUS.OK, readBoardStatus(store, repoRoot));
    return true;
  }
  if (url.pathname === SERVE_ROUTE.DASHBOARD) {
    sendJson(res, HTTP_STATUS.OK, dashboard(store, repoRoot));
    return true;
  }
  if (url.pathname === SERVE_ROUTE.WORKFLOW_DEFINITIONS) {
    sendJson(res, HTTP_STATUS.OK, readWorkflowLaunchCatalog(store));
    return true;
  }
  return false;
}

async function handlePost(store: Store, repoRoot: string, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname === SERVE_ROUTE.INTAKE) {
    const body = humanIntake(await readBody(req));
    sendJson(res, HTTP_STATUS.CREATED, startHumanIntake(store, { ...body, requestedBy: HUMAN_INTAKE_VALUE.LOCAL_ACTOR }, {
      board: readBoardStatus(store, repoRoot),
      workflow: readWorkflowDashboard(store),
      observedAt: new Date().toISOString(),
    }));
    return true;
  }
  if (url.pathname === SERVE_ROUTE.WORKFLOWS) {
    sendJson(res, HTTP_STATUS.CREATED, startWorkflow(store, workflowStart(await readBody(req))));
    return true;
  }
  if (url.pathname === SERVE_ROUTE.DISPATCH_PREPARE) {
    sendJson(res, HTTP_STATUS.CREATED, prepareRunSpec(store, workRunSpecRequest(await readBody(req))));
    return true;
  }
  const effectId = resolutionEffectId(url.pathname);
  if (effectId === undefined) return false;
  const body = humanResolution(await readBody(req));
  sendJson(res, HTTP_STATUS.OK, resolveHumanWorkflowEffect(store, { effectId, ...body }));
  return true;
}

async function routeRequest(
  store: Store,
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? SERVE_ROUTE.ROOT, `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === HTTP_METHOD.GET && handleGet(store, repoRoot, url, res)) return;
  if (req.method === HTTP_METHOD.POST && await handlePost(store, repoRoot, req, res, url)) return;
  send(res, HTTP_STATUS.NOT_FOUND, CONTENT_TYPE.TEXT, SERVER_RESPONSE.NOT_FOUND);
}

function writeEvent(res: ServerResponse, event: string, value: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function writeDashboard(store: Store, repoRoot: string, client: ServerResponse): void {
  try {
    writeEvent(client, SSE_EVENT.DASHBOARD, dashboard(store, repoRoot));
  } catch (error: unknown) {
    writeEvent(client, SSE_EVENT.ERROR, { error: errorMessage(error) });
  }
}

function attachEventStream(
  store: Store,
  repoRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
  clients: Set<ServerResponse>,
): void {
  res.writeHead(HTTP_STATUS.OK, {
    'Content-Type': CONTENT_TYPE.EVENT_STREAM,
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  clients.add(res);
  writeDashboard(store, repoRoot, res);
  req.on(PROCESS_EVENT.CLOSE, () => { clients.delete(res); });
}

export function createOperationalServer(
  store: Store,
  repoRoot: string,
  options: OperationalServerOptions,
): Server {
  const clients = new Set<ServerResponse>();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? SERVE_ROUTE.ROOT, `http://${req.headers.host ?? 'localhost'}`);
    if (req.method === HTTP_METHOD.GET && url.pathname === SERVE_ROUTE.EVENTS) {
      attachEventStream(store, repoRoot, req, res, clients);
      return;
    }
    void routeRequest(store, repoRoot, req, res).catch((error: unknown) => {
      const typed = error instanceof ContextError || error instanceof WorkDefinitionError;
      const status = typed ? HTTP_STATUS.CONFLICT : HTTP_STATUS.BAD_REQUEST;
      sendJson(res, status, {
        code: typed ? error.code : 'INVALID_REQUEST',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
  const timer = setInterval(() => {
    if (clients.size === EMPTY_SIZE) return;
    for (const client of clients) writeDashboard(store, repoRoot, client);
  }, options.refreshMs);
  server.on(PROCESS_EVENT.CLOSE, () => { clearInterval(timer); });
  return server;
}
