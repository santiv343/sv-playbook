import type { Store } from '../db/store.types.js';
import { stringColumn } from '../db/rows.js';
import { latestStateBackupAgeHours } from '../db/backup.js';
import { LEASE_TTL_MS } from '../tasks/service.constants.js';
import {
  COLUMN_PAD,
  DISPLAY_ORDER,
  DIVIDER_BEFORE,
  PACKET_STATUSES,
  STATUS_SQL,
  TABLE_COLUMNS,
  TITLE_WIDTH,
} from './status.constants.js';
import type { BoardStatus, StatusEvent, StatusLease, StatusPacket } from './status.types.js';

function leaseRows(store: Store): Map<string, StatusLease> {
  const result = new Map<string, StatusLease>();
  const rows = store.db.prepare(STATUS_SQL.LEASES).all();
  for (const row of rows) {
    const heartbeatAt = stringColumn(row, 'heartbeat_at');
    result.set(stringColumn(row, 'packet_id'), {
      sessionId: stringColumn(row, 'session_id'),
      worktree: stringColumn(row, 'worktree'),
      heartbeatAt,
      stale: Date.now() - Date.parse(heartbeatAt) > LEASE_TTL_MS,
    });
  }
  return result;
}

function eventRows(store: Store): Map<string, StatusEvent> {
  const result = new Map<string, StatusEvent>();
  const rows = store.db.prepare(STATUS_SQL.LAST_EVENTS).all();
  for (const row of rows) {
    result.set(stringColumn(row, 'packet_id'), {
      command: stringColumn(row, 'command'),
      detail: stringColumn(row, 'detail'),
      at: stringColumn(row, 'at'),
    });
  }
  return result;
}

function packetRows(store: Store, leases: Map<string, StatusLease>, events: Map<string, StatusEvent>): StatusPacket[] {
  const rows = store.db.prepare(STATUS_SQL.PACKETS).all();
  return rows.map((row) => {
    const id = stringColumn(row, 'id');
    return {
      id,
      title: stringColumn(row, 'title'),
      status: stringColumn(row, 'status'),
      updatedAt: stringColumn(row, 'updated_at'),
      lease: leases.get(id),
      lastEvent: events.get(id),
    };
  });
}

function countsFor(packets: StatusPacket[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const status of PACKET_STATUSES) counts[status] = 0;
  for (const packet of packets) counts[packet.status] = (counts[packet.status] ?? 0) + 1;
  return counts;
}

function sortOrder(packet: StatusPacket): number {
  const idx = DISPLAY_ORDER.indexOf(packet.status);
  return idx === -1 ? DISPLAY_ORDER.length : idx;
}

export function sortedPackets(packets: StatusPacket[]): StatusPacket[] {
  return [...packets].sort((a, b) => {
    const ao = sortOrder(a);
    const bo = sortOrder(b);
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function leaseLabel(packet: StatusPacket): string {
  if (packet.lease === undefined) return 'no lease';
  return `${packet.lease.stale ? 'stale' : 'fresh'} lease ${packet.lease.sessionId}`;
}

function eventLabel(packet: StatusPacket): string {
  if (packet.lastEvent === undefined) return 'no events';
  return `${packet.lastEvent.command} ${packet.lastEvent.detail}`;
}

export function formatCountsHeader(counts: Record<string, number>): string {
  const parts = DISPLAY_ORDER.filter((s) => counts[s] !== undefined).map((s) => `${counts[s]} ${s}`);
  return `Board: ${parts.join(' · ')}`;
}

export function formatStatusTable(packets: StatusPacket[]): string[] {
  const sorted = sortedPackets(packets);
  const widths = new Map<string, number>(TABLE_COLUMNS.map((c) => [c, c.length]));

  for (const p of sorted) {
    widths.set('ID', Math.max(widths.get('ID')!, p.id.length));
    widths.set('STATUS', Math.max(widths.get('STATUS')!, p.status.length));
    widths.set('LEASE', Math.max(widths.get('LEASE')!, leaseLabel(p).length));
    widths.set('LAST EVENT', Math.max(widths.get('LAST EVENT')!, eventLabel(p).length));
  }
  widths.set('TITLE', Math.min(Math.max(widths.get('TITLE')!, 1), TITLE_WIDTH));

  function w(col: string): number {
    return widths.get(col)!;
  }

  const header = TABLE_COLUMNS.map((c) => c.padEnd(w(c))).join(' | ');
  const lines: string[] = [header];

  let dividerEmitted = false;
  for (const p of sorted) {
    if (!dividerEmitted && DIVIDER_BEFORE.has(p.status)) {
      dividerEmitted = true;
      const sep = TABLE_COLUMNS.map((c) => '-'.repeat(w(c))).join('-|-');
      lines.push(sep);
    }
    const cols: string[] = [
      p.id.padEnd(w('ID')),
      p.status.padEnd(w('STATUS')),
      leaseLabel(p).padEnd(w('LEASE')),
      eventLabel(p).padEnd(w('LAST EVENT')),
      truncate(p.title, w('TITLE')).padEnd(w('TITLE')),
    ];
    lines.push(cols.join(' | '));
  }
  return lines;
}

export function formatFooter(backupAgeHours: number | undefined, packets: StatusPacket[]): string[] {
  const lines: string[] = [];
  const detail = backupAgeHours === undefined ? 'none' : `${backupAgeHours.toFixed(1)} hours old`;
  lines.push(`backup: ${detail}`);
  const totalLeases = packets.filter((p) => p.lease !== undefined).length;
  const liveLeases = packets.filter((p) => p.lease !== undefined && !p.lease.stale).length;
  lines.push(`${liveLeases}/${totalLeases} leases live`);
  return lines;
}

export function readBoardStatus(store: Store, repoRoot: string): BoardStatus {
  const leases = leaseRows(store);
  const events = eventRows(store);
  const packets = packetRows(store, leases, events);
  return {
    counts: countsFor(packets),
    packets,
    backup: { ageHours: latestStateBackupAgeHours(repoRoot) },
  };
}
