import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Store } from '../db/store.types.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { generatePacketDocument, parsePacketDocument } from '../packets/document.js';
import type { PacketDefinition } from '../packets/document.types.js';
import { LifecycleError } from './service.errors.js';
import {
  ALLOWED,
  DELETE_LEASE_SQL,
  EVENT_EVIDENCE,
  EVENT_NOTE,
  EVENT_TAKEOVER,
  EVENT_TRANSITION,
  INSERT_EVENT_SQL,
  INSERT_LEASE_SQL,
  INSERT_PACKET_SQL,
  LEASE_TTL_MS,
  PACKETS_DIR,
  PACKETS_DOCS_DIR,
  SESSION_FILE_NAME,
  STATUS,
} from './service.constants.js';
import type { LeaseInfo, PacketStatus, RecoveryReport } from './service.types.js';

const now = (): string => new Date().toISOString();

function recordTransition(store: Store, packetId: string, from: string, to: string, sessionId?: string): void {
  store.db.prepare('INSERT INTO transitions (packet_id, from_status, to_status, session_id, at) VALUES (?,?,?,?,?)')
    .run(packetId, from, to, sessionId ?? null, now());
  store.db.prepare('UPDATE packets SET status = ?, updated_at = ? WHERE id = ?').run(to, now(), packetId);
  store.db.prepare(INSERT_EVENT_SQL)
    .run(sessionId ?? null, packetId, EVENT_TRANSITION, `${from}->${to}`, now());
}

export function overlaps(a: string, b: string): boolean {
  const prefixA = a.replace(/\/\*\*$|\/\*$/, '');
  const prefixB = b.replace(/\/\*\*$|\/\*$/, '');
  if (prefixA === prefixB) return true;
  return prefixA.startsWith(prefixB + '/') || prefixB.startsWith(prefixA + '/');
}

export function createPacket(store: Store, docRoot: string, def: PacketDefinition, body: string): void {
  const exists = store.db.prepare('SELECT 1 FROM packets WHERE id = ?').get(def.id);
  if (exists !== undefined) throw new LifecycleError(`packet already exists: ${def.id}`);
  const dir = join(docRoot, PACKETS_DOCS_DIR, PACKETS_DIR);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${def.id}.md`);
  writeFileSync(path, generatePacketDocument(def, body), 'utf8');
  store.db.prepare(INSERT_PACKET_SQL).run(def.id, def.title, path, STATUS.DRAFT, body, JSON.stringify(def.writeSet), now(), now());
  for (const depId of def.dependsOn) {
    store.db.prepare('INSERT INTO packet_deps (packet_id, depends_on_id) VALUES (?,?)').run(def.id, depId);
  }
  recordTransition(store, def.id, 'none', STATUS.DRAFT);
}

export function listPackets(store: Store): Array<{ id: string; title: string; status: string; priority: number; updatedAt: string }> {
  const rows = store.db.prepare('SELECT id, title, status, priority, updated_at FROM packets ORDER BY priority, id').all();
  return rows.map((row) => ({
    id: stringColumn(row, 'id'),
    title: stringColumn(row, 'title'),
    status: stringColumn(row, 'status'),
    priority: numberColumn(row, 'priority'),
    updatedAt: stringColumn(row, 'updated_at'),
  }));
}

export function ensureSession(store: Store, worktree: string): string {
  const file = join(worktree, SESSION_FILE_NAME);
  if (existsSync(file)) {
    const id = readFileSync(file, 'utf8').trim();
    const known = store.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id);
    if (known !== undefined) return id;
  }
  const id = randomUUID();
  store.db.prepare('INSERT INTO sessions (id, worktree, started_at) VALUES (?,?,?)').run(id, worktree, now());
  writeFileSync(file, `${id}\n`, 'utf8');
  return id;
}

function currentStatus(store: Store, packetId: string): string {
  const row = store.db.prepare('SELECT status FROM packets WHERE id = ?').get(packetId);
  if (row === undefined) throw new LifecycleError(`unknown packet: ${packetId}`);
  return stringColumn(row, 'status');
}

function blocksReopen(status: string): boolean {
  return status === STATUS.REVIEW || status === STATUS.DONE || status === STATUS.DROPPED;
}

export function leaseOf(store: Store, packetId: string): LeaseInfo | undefined {
  const row = store.db.prepare('SELECT session_id, worktree, acquired_at, heartbeat_at FROM leases WHERE packet_id = ?')
    .get(packetId);
  if (row === undefined) return undefined;
  const heartbeatAt = stringColumn(row, 'heartbeat_at');
  return {
    sessionId: stringColumn(row, 'session_id'),
    worktree: stringColumn(row, 'worktree'),
    acquiredAt: stringColumn(row, 'acquired_at'),
    heartbeatAt,
    stale: Date.now() - Date.parse(heartbeatAt) > LEASE_TTL_MS,
  };
}

export function refreshHeartbeat(store: Store, sessionId: string): void {
  store.db.prepare('UPDATE leases SET heartbeat_at = ? WHERE session_id = ?').run(now(), sessionId);
}

export function startPacket(store: Store, sessionId: string, worktree: string, packetId: string): void {
  refreshHeartbeat(store, sessionId);
  const status = currentStatus(store, packetId);
  const lease = leaseOf(store, packetId);
  if (lease !== undefined) {
    if (lease.sessionId === sessionId) return; // idempotent retry
    throw new LifecycleError(`held by session ${lease.sessionId}`, 'use takeover once available; do not delete the lease by hand');
  }
  if (status !== STATUS.READY) {
    const hint = blocksReopen(status) ? 'reopening goes through the change bridge' : undefined;
    throw new LifecycleError(`wrong state ${status}`, hint);
  }
  store.db.prepare(INSERT_LEASE_SQL).run(packetId, sessionId, worktree, now(), now());
  recordTransition(store, packetId, STATUS.READY, STATUS.ACTIVE, sessionId);
}

function assertLeaseForActive(store: Store, sessionId: string | undefined, packetId: string): void {
  const lease = leaseOf(store, packetId);
  if (lease === undefined || sessionId === undefined) throw new LifecycleError('lease required to leave active');
  if (lease.sessionId !== sessionId) throw new LifecycleError(`lease held by another session ${lease.sessionId}`);
}

function shouldReleaseLease(from: string, to: string): boolean {
  return !(from === STATUS.ACTIVE && to === STATUS.BLOCKED);
}

export function releaseLease(store: Store, sessionId: string, packetId: string): void {
  const lease = leaseOf(store, packetId);
  if (lease === undefined) throw new LifecycleError('no lease to release');
  if (lease.sessionId !== sessionId) {
    throw new LifecycleError(`lease held by another session ${lease.sessionId}`, 'use takeover');
  }
  refreshHeartbeat(store, sessionId);
  store.db.prepare(DELETE_LEASE_SQL).run(packetId);
}

function stampClosed(store: Store, packetId: string, status: string): void {
  if (status !== STATUS.DONE && status !== STATUS.DROPPED) return;
  const row = store.db.prepare('SELECT path FROM packets WHERE id = ?').get(packetId);
  if (row === undefined) return;
  const path = stringColumn(row, 'path');
  writeFileSync(path, `\nclosed: ${status} ${now()}`, { flag: 'a' });
}

function parseGlobs(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  const result: string[] = [];
  for (const item of parsed) {
    if (typeof item === 'string') result.push(item);
  }
  return result;
}

function ourGlobs(store: Store, packetId: string): string[] {
  const row = store.db.prepare('SELECT write_set FROM packets WHERE id = ?').get(packetId);
  if (row === undefined) return [];
  return parseGlobs(stringColumn(row, 'write_set'));
}

function conflictsWith(ours: string[], row: Record<string, unknown>): boolean {
  const raw = parseGlobs(stringColumn(row, 'write_set'));
  for (const a of ours) {
    for (const b of raw) {
      if (overlaps(a, b)) return true;
    }
  }
  return false;
}

function checkWriteSetConflict(store: Store, packetId: string): void {
  const ours = ourGlobs(store, packetId);
  if (ours.length === 0) return;
  const rows = store.db.prepare('SELECT id, write_set FROM packets WHERE (status = ? OR status = ?) AND id != ?')
    .all(STATUS.READY, STATUS.ACTIVE, packetId);
  for (const row of rows) {
    if (conflictsWith(ours, row)) {
      throw new LifecycleError(`write_set conflict with ${stringColumn(row, 'id')}`);
    }
  }
}

function captureEvidence(store: Store, packetId: string, from: string, to: string): void {
  if (from !== STATUS.ACTIVE || to !== STATUS.REVIEW) return;
  const lease = leaseOf(store, packetId);
  if (lease === undefined) return;
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: lease.worktree, encoding: 'utf8' }).trim();
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: lease.worktree, encoding: 'utf8' }).trim();
    store.db.prepare(INSERT_EVENT_SQL).run(null, packetId, EVENT_EVIDENCE, `head-sha ${sha}`, now());
    store.db.prepare(INSERT_EVENT_SQL).run(null, packetId, EVENT_EVIDENCE, `branch ${branch}`, now());
    process.stdout.write(`evidence captured: ${sha} on ${branch}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0] ?? err.message : String(err);
    store.db.prepare(INSERT_EVENT_SQL).run(null, packetId, EVENT_EVIDENCE, `head-sha unavailable: ${msg}`, now());
  }
}

export function movePacket(store: Store, sessionId: string | undefined, packetId: string, to: PacketStatus): string {
  if (sessionId !== undefined) refreshHeartbeat(store, sessionId);
  const from = currentStatus(store, packetId);
  if (to === STATUS.ACTIVE) throw new LifecycleError('use task start to activate a packet');
  const allowed = ALLOWED.get(from) ?? [];
  if (!allowed.includes(to)) throw new LifecycleError(`illegal transition ${from} -> ${to}`);
  if (to === STATUS.READY) checkWriteSetConflict(store, packetId);
  if (from === STATUS.ACTIVE) assertLeaseForActive(store, sessionId, packetId);
  stampClosed(store, packetId, to);
  captureEvidence(store, packetId, from, to);
  if (shouldReleaseLease(from, to)) store.db.prepare(DELETE_LEASE_SQL).run(packetId);
  recordTransition(store, packetId, from, to, sessionId);
  return from;
}

export function recoverPacket(store: Store, packetId: string): RecoveryReport {
  const status = currentStatus(store, packetId);
  const transitionRows = store.db.prepare(
    "SELECT at, from_status, to_status, COALESCE(session_id, '-') AS session_id FROM transitions WHERE packet_id = ? ORDER BY seq DESC LIMIT 5",
  ).all(packetId);
  const noteRows = store.db.prepare(
    'SELECT at, detail FROM events WHERE packet_id = ? AND command = ? ORDER BY seq DESC LIMIT 5',
  ).all(packetId, EVENT_NOTE);
  const dependsOn = getDeps(store, packetId);
  return {
    packetId,
    status,
    lease: leaseOf(store, packetId),
    dependsOn,
    lastTransitions: transitionRows.map((row) => {
      const at = stringColumn(row, 'at');
      const from = stringColumn(row, 'from_status');
      const to = stringColumn(row, 'to_status');
      const sessionId = stringColumn(row, 'session_id');
      return `${at} ${from}->${to} (${sessionId})`;
    }),
    lastNotes: noteRows.map((row) => `${stringColumn(row, 'at')} ${stringColumn(row, 'detail')}`),
  };
}

export function takeoverPacket(
  store: Store,
  sessionId: string,
  worktree: string,
  packetId: string,
  force: boolean,
): RecoveryReport {
  const lease = leaseOf(store, packetId);
  if (lease === undefined) throw new LifecycleError('no lease to take over', 'use task start');
  if (lease.sessionId === sessionId && !lease.stale) throw new LifecycleError('you already hold this lease');
  if (!lease.stale && !force) throw new LifecycleError('lease is live', 'pause the holder or pass --force');
  try {
    store.db.exec('BEGIN IMMEDIATE');
    store.db.prepare(DELETE_LEASE_SQL).run(packetId);
    store.db.prepare(INSERT_LEASE_SQL).run(packetId, sessionId, worktree, now(), now());
    store.db.prepare(INSERT_EVENT_SQL)
      .run(sessionId, packetId, EVENT_TAKEOVER, `from ${lease.sessionId} force=${force}`, now());
    store.db.exec('COMMIT');
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  }
  return recoverPacket(store, packetId);
}

export function notePacket(store: Store, sessionId: string, packetId: string, text: string): void {
  currentStatus(store, packetId);
  const detail = text.trim();
  if (detail.length === 0) throw new LifecycleError('note text required');
  refreshHeartbeat(store, sessionId);
  store.db.prepare(INSERT_EVENT_SQL)
    .run(sessionId, packetId, EVENT_NOTE, detail, now());
}

function getDeps(store: Store, packetId: string): string[] {
  const rows = store.db.prepare('SELECT depends_on_id FROM packet_deps WHERE packet_id = ? ORDER BY depends_on_id').all(packetId);
  return rows.map((row) => stringColumn(row, 'depends_on_id'));
}

export function briefPacket(store: Store, packetId: string): string {
  const row = store.db.prepare('SELECT id, title, path, status, body FROM packets WHERE id = ?').get(packetId);
  if (row === undefined) throw new LifecycleError(`unknown packet: ${packetId}`);
  const id = stringColumn(row, 'id');
  const title = stringColumn(row, 'title');
  const path = stringColumn(row, 'path');
  const status = stringColumn(row, 'status');
  let body = stringColumn(row, 'body');
  if (body === '') {
    if (!existsSync(path)) throw new LifecycleError(`packet file missing: ${path}`);
    const text = readFileSync(path, 'utf8');
    const parsed = parsePacketDocument(text);
    body = parsed.body;
  }
  const deps = getDeps(store, packetId);
  const depLine = deps.length > 0 ? deps.join(', ') : 'none';
  const lease = leaseOf(store, packetId);
  const leaseLine = lease === undefined
    ? '<none>'
    : `held by ${lease.sessionId} (${lease.stale ? 'stale' : 'fresh'})`;
  return `# Brief: ${id} — ${title}

## Status
state: ${status}
lease: ${leaseLine}
depends_on: ${depLine}

## Definition (${PACKETS_DOCS_DIR}/${PACKETS_DIR}/${id}.md)
${body}

## Process
- Contract and workflow: run \`npx sv-playbook docs cli\` before acting.
- All state changes go through \`sv-playbook task move\` — never edit status by hand.
- Leave breadcrumbs with \`sv-playbook task note ${id} "<text>"\` at each step.
- Stop conditions and evidence duties are defined in the packet above.
`;
}
