import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Store } from '../db/store.js';
import { generatePacketDocument, type PacketDefinition } from '../packets/document.js';

export type PacketStatus = 'draft' | 'ready' | 'active' | 'review' | 'done' | 'blocked' | 'dropped';

export class LifecycleError extends Error {
  constructor(message: string, readonly hint?: string) { super(message); }
}

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
  return rows.map((r) => {
    const row = r as { id: string; title: string; status: string; priority: number; updated_at: string };
    return { id: row.id, title: row.title, status: row.status, priority: row.priority, updatedAt: row.updated_at };
  });
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
  return (row as { status: string }).status;
}

export function startPacket(store: Store, sessionId: string, worktree: string, packetId: string): void {
  const status = currentStatus(store, packetId);
  const lease = store.db.prepare('SELECT session_id FROM leases WHERE packet_id = ?').get(packetId) as
    | { session_id: string } | undefined;
  if (lease !== undefined) {
    if (lease.session_id === sessionId) return; // idempotent retry
    throw new LifecycleError(`held by session ${lease.session_id}`, 'use takeover (arrives in P3)');
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
  const from = currentStatus(store, packetId);
  if (to === 'active') throw new LifecycleError('use task start to activate a packet');
  const allowed = ALLOWED.get(from) ?? [];
  if (!allowed.includes(to)) throw new LifecycleError(`illegal transition ${from} -> ${to}`);
  if (from === 'active') {
    const lease = store.db.prepare('SELECT session_id FROM leases WHERE packet_id = ?').get(packetId) as
      | { session_id: string } | undefined;
    if (lease === undefined || sessionId === undefined) throw new LifecycleError('lease required to leave active');
    if (lease.session_id !== sessionId) throw new LifecycleError(`lease held by another session ${lease.session_id}`);
  }
  if (to === 'done' || to === 'dropped') {
    store.db.prepare('DELETE FROM leases WHERE packet_id = ?').run(packetId);
  }
  recordTransition(store, packetId, from, to, sessionId);
}
