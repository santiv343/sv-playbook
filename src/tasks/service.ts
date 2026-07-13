import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Store } from '../db/store.types.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { generatePacketDocument, parsePacketDocument } from '../packets/document.js';
import type { PacketDefinition } from '../packets/document.types.js';
import { LifecycleError } from './service.errors.js';
import { contentDir } from '../content.js';
import { loadConfig } from '../config.js';
import { getActiveCount, sprintWipLimit, taskSprintId } from '../sprints/service.js';
import { getContext } from '../runtime/context.js';
import {
  ALLOWED,
  DELETE_LEASE_SQL,
  EVENT_EVIDENCE,
  EVENT_IMPORTED,
  EVENT_NOTE,
  EVENT_TAKEOVER,
  EVENT_TRANSITION,
  EXISTS_SQL,
  INSERT_EVENT_SQL,
  INSERT_LEASE_SQL,
  INSERT_PACKET_SQL,
  LEASE_TTL_MS,
  PACKETS_DIR,
  PACKETS_DOCS_DIR,
  SESSION_FILE_NAME,
  STATUS,
  TASK_TYPE_PREFIX,
} from './service.constants.js';
import type { LeaseInfo, PacketStatus, RecoveryReport, ImportResult } from './service.types.js';

const now = (): string => new Date().toISOString();

function transact(store: Store, fn: () => void): void {
  const { db } = store;
  try { db.exec('BEGIN IMMEDIATE'); fn(); db.exec('COMMIT'); }
  catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

export function generateIdFromType(store: Store, type: string): string {
  const prefix = TASK_TYPE_PREFIX[type];
  if (prefix === undefined) throw new LifecycleError(`unknown task type: ${type}`);
  const start = prefix.length + 2, rows = store.db.prepare("SELECT id FROM packets WHERE id LIKE ? AND CAST(substr(id, ?) AS INTEGER) != 0 ORDER BY id DESC LIMIT 1").all(`${prefix}-%`, start);
  if (rows.length === 0) return `${prefix}-001`;
  const num = parseInt(stringColumn(rows[0], 'id').slice(prefix.length + 1), 10);
  return `${prefix}-${String(Number.isNaN(num) ? 1 : num + 1).padStart(3, '0')}`;
}
function deleteDeps(store: Store, packetId: string): void { store.db.prepare('DELETE FROM packet_deps WHERE packet_id = ?').run(packetId); }
function recordTransition(store: Store, packetId: string, from: string, to: string, sessionId?: string): void {
  store.db.prepare('INSERT INTO transitions (packet_id, from_status, to_status, session_id, at) VALUES (?,?,?,?,?)').run(packetId, from, to, sessionId ?? null, now());
  store.db.prepare('UPDATE packets SET status = ?, updated_at = ? WHERE id = ?').run(to, now(), packetId);
  store.db.prepare(INSERT_EVENT_SQL).run(sessionId ?? null, packetId, EVENT_TRANSITION, `${from}->${to}`, now());
}

export function overlaps(a: string, b: string): boolean {
  const pa = a.replace(/\/\*\*$|\/\*$/, ''), pb = b.replace(/\/\*\*$|\/\*$/, '');
  if (pa === pb || pa.startsWith(pb + '/') || pb.startsWith(pa + '/')) return true;
  return new RegExp('^' + a.replace(/\./g, '\\.').replace(/\*/g, '[^/]*') + '$').test(b);
}

export function createPacket(store: Store, docRoot: string, def: PacketDefinition, body: string, type?: string): void {
  const exists = store.db.prepare(EXISTS_SQL).get(def.id);
  if (exists !== undefined) throw new LifecycleError(`packet already exists: ${def.id}`, 'existing packet file? use task import <path>');
  const dir = join(docRoot, PACKETS_DOCS_DIR, PACKETS_DIR);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${def.id}.md`);
  writeFileSync(path, generatePacketDocument(def, body), 'utf8');
  transact(store, () => {
    store.db.prepare(INSERT_PACKET_SQL).run(def.id, def.title, path, STATUS.DRAFT, body, JSON.stringify(def.writeSet), type ?? '', now(), now());
    for (const depId of def.dependsOn) {
      store.db.prepare('INSERT INTO packet_deps (packet_id, depends_on_id) VALUES (?,?)').run(def.id, depId);
    }
    recordTransition(store, def.id, 'none', STATUS.DRAFT);
  });
}
function upsertPacketFile(store: Store, path: string): 'imported' | 'updated' {
  const text = readFileSync(path, 'utf8');
  const { definition: def, body } = parsePacketDocument(text);
  const existing = store.db.prepare(EXISTS_SQL).get(def.id);
  let result: 'imported' | 'updated' = 'imported';
  transact(store, () => {
    if (existing !== undefined) {
      store.db.prepare('UPDATE packets SET body = ?, title = ?, write_set = ?, updated_at = ? WHERE id = ?')
        .run(body, def.title, JSON.stringify(def.writeSet), now(), def.id);
      deleteDeps(store, def.id); upsertDeps(store, def);
      result = 'updated'; return;
    }
    store.db.prepare(INSERT_PACKET_SQL).run(def.id, def.title, path, STATUS.DRAFT, body, JSON.stringify(def.writeSet), '', now(), now());
    recordTransition(store, def.id, 'none', STATUS.DRAFT);
    upsertDeps(store, def);
  });
  return result;
}
function upsertDeps(store: Store, def: PacketDefinition): void {
  for (const depId of def.dependsOn) if (store.db.prepare(EXISTS_SQL).get(depId) !== undefined) store.db.prepare('INSERT OR IGNORE INTO packet_deps (packet_id, depends_on_id) VALUES (?,?)').run(def.id, depId);
}
export function importPackets(store: Store, docRoot: string): ImportResult {
  const dir = join(docRoot, PACKETS_DOCS_DIR, PACKETS_DIR);
  if (!existsSync(dir)) return { imported: 0, updated: 0 };
  let imported = 0; let updated = 0;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.md')) continue;
    if (upsertPacketFile(store, join(dir, entry)) === 'imported') imported++; else updated++;
  }
  return { imported, updated };
}
function resolveImportPath(docRoot: string, pathOrId: string): string {
  return pathOrId.includes('/') || pathOrId.includes('\\') || pathOrId.endsWith('.md') ? pathOrId : join(docRoot, PACKETS_DOCS_DIR, PACKETS_DIR, `${pathOrId}.md`);
}

export function importPacketFile(store: Store, docRoot: string, pathOrId: string): string {
  const filePath = resolveImportPath(docRoot, pathOrId);
  if (!existsSync(filePath)) throw new LifecycleError(`packet file not found: ${filePath}`);

  const { definition: def, body } = parsePacketDocument(readFileSync(filePath, 'utf8'));
  if (!Object.values(TASK_TYPE_PREFIX).some((p) => def.id.startsWith(p + '-')))
    throw new LifecycleError(`unknown packet id prefix: ${def.id}`);
  if (store.db.prepare(EXISTS_SQL).get(def.id) !== undefined)
    throw new LifecycleError(`packet already exists in DB: ${def.id}`, 'use task amend to update');

  transact(store, () => { store.db.prepare(INSERT_PACKET_SQL).run(def.id, def.title, filePath, STATUS.DRAFT, body, JSON.stringify(def.writeSet), '', now(), now()); recordTransition(store, def.id, 'none', STATUS.DRAFT); upsertDeps(store, def); store.db.prepare(INSERT_EVENT_SQL).run(null, def.id, EVENT_IMPORTED, `imported from ${filePath}`, now()); });

  return def.id;
}
export function listPackets(store: Store): Array<{ id: string; title: string; status: string; priority: number; updatedAt: string }> {
  return store.db.prepare('SELECT id, title, status, priority, updated_at FROM packets ORDER BY priority, id').all().map((row) => ({ id: stringColumn(row, 'id'), title: stringColumn(row, 'title'), status: stringColumn(row, 'status'), priority: numberColumn(row, 'priority'), updatedAt: stringColumn(row, 'updated_at') }));
}
export function ensureSession(store: Store, worktree: string): string {
  // Prefer the execution context's sessionId (set by daemon on exec dispatch)
  const ctx = getContext();
  if (ctx?.sessionId) return ctx.sessionId;
  const file = join(worktree, SESSION_FILE_NAME);
  if (existsSync(file)) { const id = readFileSync(file, 'utf8').trim(); if (store.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id) !== undefined) return id; }
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
  const row = store.db.prepare('SELECT session_id, worktree, acquired_at, heartbeat_at FROM leases WHERE packet_id = ?').get(packetId);
  if (row === undefined) return undefined;
  const heartbeatAt = stringColumn(row, 'heartbeat_at');
  return { sessionId: stringColumn(row, 'session_id'), worktree: stringColumn(row, 'worktree'),
    acquiredAt: stringColumn(row, 'acquired_at'), heartbeatAt,
    stale: Date.now() - Date.parse(heartbeatAt) > LEASE_TTL_MS };
}
export function refreshHeartbeat(store: Store, sessionId: string): void {
  store.db.prepare('UPDATE leases SET heartbeat_at = ? WHERE session_id = ?').run(now(), sessionId);
}
function checkSprintWipLimit(store: Store, packetId: string): void {
  const sprintId = taskSprintId(store, packetId);
  if (sprintId === null) return;
  const wip = sprintWipLimit(store, sprintId);
  if (wip === null) return;
  const active = getActiveCount(store, sprintId);
  if (active >= wip) throw new LifecycleError(`sprint ${sprintId} WIP limit (${wip}) reached: ${active} tasks already active`);
}

export function startPacket(store: Store, sessionId: string, worktree: string, packetId: string): void {
  refreshHeartbeat(store, sessionId);
  const status = currentStatus(store, packetId);
  const lease = leaseOf(store, packetId);
  if (lease !== undefined) {
    if (lease.sessionId === sessionId) return;
    throw new LifecycleError(`held by session ${lease.sessionId}`, 'use takeover once available; do not delete the lease by hand');
  }
  if (status !== STATUS.READY) {
    const hint = (status === STATUS.REVIEW || status === STATUS.DONE || status === STATUS.DROPPED) ? 'reopening goes through the change bridge' : undefined;
    throw new LifecycleError(`wrong state ${status}`, hint);
  }
  checkSprintWipLimit(store, packetId);
  transact(store, () => { store.db.prepare(INSERT_LEASE_SQL).run(packetId, sessionId, worktree, now(), now()); recordTransition(store, packetId, STATUS.READY, STATUS.ACTIVE, sessionId); });
}
function assertLeaseForActive(store: Store, sessionId: string | undefined, packetId: string): void {
  const lease = leaseOf(store, packetId);
  if (lease === undefined || sessionId === undefined) throw new LifecycleError('lease required to leave active');
  if (lease.sessionId !== sessionId) throw new LifecycleError(`lease held by another session ${lease.sessionId}`);
}
export function releaseLease(store: Store, sessionId: string, packetId: string): void {
  const lease = leaseOf(store, packetId);
  if (lease === undefined) throw new LifecycleError('no lease to release');
  if (lease.sessionId !== sessionId) throw new LifecycleError(`lease held by another session ${lease.sessionId}`, 'use takeover');
  refreshHeartbeat(store, sessionId);
  transact(store, () => { store.db.prepare(DELETE_LEASE_SQL).run(packetId); });
}
function parseGlobs(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
}
function ourGlobs(store: Store, packetId: string): string[] {
  const row = store.db.prepare('SELECT write_set FROM packets WHERE id = ?').get(packetId);
  return row === undefined ? [] : parseGlobs(stringColumn(row, 'write_set'));
}
function conflictsWith(ours: string[], row: Record<string, unknown>): boolean {
  return parseGlobs(stringColumn(row, 'write_set')).some((b) => ours.some((a) => overlaps(a, b)));
}
function checkWriteSetConflict(store: Store, packetId: string): void {
  const ours = ourGlobs(store, packetId);
  if (ours.length === 0) return;
  const rows = store.db.prepare('SELECT id, write_set FROM packets WHERE (status = ? OR status = ?) AND id != ?').all(STATUS.READY, STATUS.ACTIVE, packetId);
  for (const row of rows) {
    if (conflictsWith(ours, row)) throw new LifecycleError(`write_set conflict with ${stringColumn(row, 'id')}`);
  }
}
function findMergeBase(worktree: string): string | undefined {
  for (const base of ['origin/main', 'origin/master', 'main', 'master']) try { return execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: worktree, encoding: 'utf8', stdio: 'pipe' }).trim(); } catch { /* next */ }
  return undefined;
}
function gateReview(store: Store, packetId: string, from: string, to: string): void {
  if (from !== STATUS.ACTIVE || to !== STATUS.REVIEW) return;
  const lease = leaseOf(store, packetId);
  if (!lease) return;
  const glbs = ourGlobs(store, packetId);
  if (glbs.length === 0) return;
  const mergeBase = findMergeBase(lease.worktree);
  if (!mergeBase) return;
  const changed = (() => { try { return execFileSync('git', ['diff', '--name-only', `${mergeBase}...HEAD`], { cwd: lease.worktree, encoding: 'utf8' }).trim(); } catch { return ''; } })();
  if (!changed) return;
  const offending = changed.split('\n').filter((f) => f !== '' && !glbs.some((g) => overlaps(g, f)));
  if (offending.length > 0) throw new LifecycleError(`write_set violation: branch changed files outside write_set: ${offending.join(', ')}`);
}
const gateEvidence = (store: Store, packetId: string, to: string): void => {
  if (to !== STATUS.DONE) return;
  const { evidenceRequired } = parsePacketDocument(readFileSync(stringColumn(store.db.prepare('SELECT path FROM packets WHERE id = ?').get(packetId), 'path'), 'utf8')).definition;
  if (evidenceRequired.length > 0 && store.db.prepare("SELECT 1 FROM events WHERE packet_id = ? AND command = ? LIMIT 1").all(packetId, EVENT_EVIDENCE).length === 0)
    throw new LifecycleError(`missing required evidence: ${evidenceRequired.join(', ')}`);
};
function gateVerify(store: Store, packetId: string, from: string, to: string): void {
  if (from !== STATUS.ACTIVE || to !== STATUS.REVIEW) return;
  const lease = leaseOf(store, packetId);
  if (lease === undefined) return;
  const cfgPath = join(lease.worktree, 'playbook.config.json');
  if (!existsSync(cfgPath) || /enforceVerifyOnReview\s*:\s*false/.test(readFileSync(cfgPath, 'utf8'))) return;
  const config = loadConfig(lease.worktree);
  if (config.verifyCommand.trim() === '') return;
  try { execSync(config.verifyCommand, { cwd: lease.worktree, timeout: 120_000, stdio: 'pipe' }); }
  catch { throw new LifecycleError(`verify command failed: ${config.verifyCommand}`); }
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
  captureEvidence(store, packetId, from, to); gateReview(store, packetId, from, to); gateVerify(store, packetId, from, to); gateEvidence(store, packetId, to);
  transact(store, () => {
    if (from !== STATUS.ACTIVE || to !== STATUS.BLOCKED) store.db.prepare(DELETE_LEASE_SQL).run(packetId);
    recordTransition(store, packetId, from, to, sessionId);
  });
  return from;
}
export function recoverPacket(store: Store, packetId: string): RecoveryReport {
  const status = currentStatus(store, packetId);
  const transitionRows = store.db.prepare("SELECT at, from_status, to_status, COALESCE(session_id, '-') AS session_id FROM transitions WHERE packet_id = ? ORDER BY seq DESC LIMIT 5").all(packetId);
  const noteRows = store.db.prepare('SELECT at, detail FROM events WHERE packet_id = ? AND command = ? ORDER BY seq DESC LIMIT 5').all(packetId, EVENT_NOTE);
  const dependsOn = getDeps(store, packetId);
  return { packetId, status, dependsOn, lease: leaseOf(store, packetId),
    lastTransitions: transitionRows.map((row) => `${stringColumn(row, 'at')} ${stringColumn(row, 'from_status')}->${stringColumn(row, 'to_status')} (${stringColumn(row, 'session_id')})`),
    lastNotes: noteRows.map((row) => `${stringColumn(row, 'at')} ${stringColumn(row, 'detail')}`) };
}
export function takeoverPacket(
  store: Store, sessionId: string, worktree: string,
  packetId: string, force: boolean,
): RecoveryReport {
  const lease = leaseOf(store, packetId);
  if (lease === undefined && currentStatus(store, packetId) !== STATUS.ACTIVE) {
    throw new LifecycleError('no lease to take over', 'use task start');
  }
  if (lease !== undefined) {
    if (lease.sessionId === sessionId && !lease.stale) throw new LifecycleError('you already hold this lease');
    if (!lease.stale && !force) throw new LifecycleError('lease is live', 'pause the holder or pass --force');
  }
  transact(store, () => {
    store.db.prepare(DELETE_LEASE_SQL).run(packetId);
    store.db.prepare(INSERT_LEASE_SQL).run(packetId, sessionId, worktree, now(), now());
    store.db.prepare(INSERT_EVENT_SQL)
      .run(sessionId, packetId, EVENT_TAKEOVER, `from ${lease?.sessionId ?? 'none'} force=${force}`, now());
  });
  return recoverPacket(store, packetId);
}
export function notePacket(store: Store, sessionId: string, packetId: string, text: string): void {
  currentStatus(store, packetId);
  const detail = text.trim();
  if (detail.length === 0) throw new LifecycleError('note text required');
  refreshHeartbeat(store, sessionId);
  transact(store, () => { store.db.prepare(INSERT_EVENT_SQL).run(sessionId, packetId, EVENT_NOTE, detail, now()); });
}
function getDeps(store: Store, packetId: string): string[] {
  const rows = store.db.prepare('SELECT depends_on_id FROM packet_deps WHERE packet_id = ? ORDER BY depends_on_id').all(packetId);
  return rows.map((row) => stringColumn(row, 'depends_on_id'));
}
export function amendPacket(store: Store, docRoot: string, packetId: string, updates: { title?: string; body?: string; writeSet?: string[]; dependsOn?: string[]; requirements?: string[]; evidenceRequired?: string[]; }): void {
  const row = store.db.prepare('SELECT id, title, body, write_set, status, path FROM packets WHERE id = ?').get(packetId);
  if (row === undefined) throw new LifecycleError(`unknown packet: ${packetId}`);
  const s = stringColumn(row, 'status');
  if (s !== STATUS.DRAFT && s !== STATUS.READY) throw new LifecycleError(`cannot amend packet in status ${s}`, 'only draft and ready packets can be amended');
  const docDef = parsePacketDocument(readFileSync(stringColumn(row, 'path'), 'utf8')).definition;
  const title = updates.title ?? stringColumn(row, 'title');
  const body = updates.body ?? stringColumn(row, 'body');
  const writeSet = updates.writeSet ?? parseGlobs(stringColumn(row, 'write_set'));
  const dependsOn = updates.dependsOn ?? getDeps(store, packetId);
  const requirements = updates.requirements ?? docDef.requirements;
  const evidenceRequired = updates.evidenceRequired ?? docDef.evidenceRequired;
  transact(store, () => {
    store.db.prepare('UPDATE packets SET title = ?, body = ?, write_set = ?, updated_at = ? WHERE id = ?')
      .run(title, body, JSON.stringify(writeSet), now(), packetId);
    deleteDeps(store, packetId);
    upsertDeps(store, { id: packetId, title, dependsOn, writeSet, requirements, evidenceRequired });
  });
  writeFileSync(stringColumn(row, 'path'), generatePacketDocument(
    { id: packetId, title, dependsOn, writeSet, requirements, evidenceRequired }, body), 'utf8');
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
  const leaseLine = lease ? `held by ${lease.sessionId} (${lease.stale ? 'stale' : 'fresh'})` : '<none>';
  const rubricPath = join(contentDir(), 'rubric.md');
  return (existsSync(rubricPath) ? readFileSync(rubricPath, 'utf8') + '\n' : '') +
    `# Brief: ${id} — ${title}\n\n` +
    `## Status\nstate: ${status}\nlease: ${leaseLine}\ndepends_on: ${depLine}\n\n` +
    `## Definition (${PACKETS_DOCS_DIR}/${PACKETS_DIR}/${id}.md)\n${body}\n\n` +
    `## Process\n- Contract and workflow: run \`npx sv-playbook docs cli\` before acting.\n` +
    `- All state changes go through \`sv-playbook task move\` — never edit status by hand.\n` +
    `- Leave breadcrumbs with \`sv-playbook task note ${id} "<text>"\` at each step.\n` +
    `- Stop conditions and evidence duties are defined in the packet above.\n`;
}
