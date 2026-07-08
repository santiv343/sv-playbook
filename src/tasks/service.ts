import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Store } from '../db/store.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { generatePacketDocument, type PacketDefinition } from '../packets/document.js';

export type PacketStatus = 'draft' | 'ready' | 'active' | 'review' | 'done' | 'blocked' | 'dropped';

export class LifecycleError extends Error {
  constructor(message: string, readonly hint?: string) { super(message); }
}

export interface LeaseInfo {
  sessionId: string;
  worktree: string;
  acquiredAt: string;
  heartbeatAt: string;
  stale: boolean;
}

export interface RecoveryReport {
  packetId: string;
  status: string;
  lease: LeaseInfo | undefined;
  lastTransitions: string[];
  lastNotes: string[];
}

const LEASE_TTL_MS = 30 * 60 * 1000;

const ALLOWED: ReadonlyMap<string, readonly PacketStatus[]> = new Map([
  ['draft', ['ready', 'dropped']],
  ['ready', ['active', 'dropped']],
  ['active', ['review', 'blocked']],
  ['blocked', ['ready', 'dropped']],
  ['review', ['active', 'done']],
]);

const now = (): string => new Date().toISOString();

function recordTransition(store: Store, packetId: string, from: string, to: string, sessionId?: string): void {
  store.db.prepare('INSERT INTO transitions (packet_id, from_status, to_status, session_id, at) VALUES (?,?,?,?,?)')
    .run(packetId, from, to, sessionId ?? null, now());
  store.db.prepare('UPDATE packets SET status = ?, updated_at = ? WHERE id = ?').run(to, now(), packetId);
  store.db.prepare('INSERT INTO events (session_id, packet_id, command, detail, at) VALUES (?,?,?,?,?)')
    .run(sessionId ?? null, packetId, 'transition', `${from}->${to}`, now());
}

export function createPacket(store: Store, repoRoot: string, def: PacketDefinition, body: string): void {
  const exists = store.db.prepare('SELECT 1 FROM packets WHERE id = ?').get(def.id);
  if (exists !== undefined) throw new LifecycleError(`packet already exists: ${def.id}`);
  const dir = join(repoRoot, 'docs', 'packets');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${def.id}.md`);
  writeFileSync(path, generatePacketDocument(def, body), 'utf8');
  store.db.prepare('INSERT INTO packets (id, title, path, status, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run(def.id, def.title, path, 'draft', now(), now());
  recordTransition(store, def.id, 'none', 'draft');
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
  const file = join(worktree, '.svp-session');
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
  if (status !== 'ready') {
    const hint = ['review', 'done', 'dropped'].includes(status) ? 'reopening goes through the change bridge' : undefined;
    throw new LifecycleError(`wrong state ${status}`, hint);
  }
  store.db.prepare('INSERT INTO leases (packet_id, session_id, worktree, acquired_at, heartbeat_at) VALUES (?,?,?,?,?)')
    .run(packetId, sessionId, worktree, now(), now());
  recordTransition(store, packetId, 'ready', 'active', sessionId);
}

export function movePacket(store: Store, sessionId: string | undefined, packetId: string, to: PacketStatus): void {
  if (sessionId !== undefined) refreshHeartbeat(store, sessionId);
  const from = currentStatus(store, packetId);
  if (to === 'active') throw new LifecycleError('use task start to activate a packet');
  const allowed = ALLOWED.get(from) ?? [];
  if (!allowed.includes(to)) throw new LifecycleError(`illegal transition ${from} -> ${to}`);
  if (from === 'active') {
    const lease = leaseOf(store, packetId);
    if (lease === undefined || sessionId === undefined) throw new LifecycleError('lease required to leave active');
    if (lease.sessionId !== sessionId) throw new LifecycleError(`lease held by another session ${lease.sessionId}`);
  }
  if (to === 'done' || to === 'dropped') {
    store.db.prepare('DELETE FROM leases WHERE packet_id = ?').run(packetId);
  }
  recordTransition(store, packetId, from, to, sessionId);
}

export function recoverPacket(store: Store, packetId: string): RecoveryReport {
  const status = currentStatus(store, packetId);
  const transitionRows = store.db.prepare(
    "SELECT at, from_status, to_status, COALESCE(session_id, '-') AS session_id FROM transitions WHERE packet_id = ? ORDER BY seq DESC LIMIT 5",
  ).all(packetId);
  const noteRows = store.db.prepare(
    "SELECT at, detail FROM events WHERE packet_id = ? AND command = 'note' ORDER BY seq DESC LIMIT 5",
  ).all(packetId);
  return {
    packetId,
    status,
    lease: leaseOf(store, packetId),
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
    store.db.prepare('DELETE FROM leases WHERE packet_id = ?').run(packetId);
    store.db.prepare('INSERT INTO leases (packet_id, session_id, worktree, acquired_at, heartbeat_at) VALUES (?,?,?,?,?)')
      .run(packetId, sessionId, worktree, now(), now());
    store.db.prepare('INSERT INTO events (session_id, packet_id, command, detail, at) VALUES (?,?,?,?,?)')
      .run(sessionId, packetId, 'takeover', `from ${lease.sessionId} force=${force}`, now());
    store.db.exec('COMMIT');
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  }
  return recoverPacket(store, packetId);
}
