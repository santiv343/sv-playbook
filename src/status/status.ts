import { dirname } from 'node:path';
import { getBackupStatus } from '../db/backup.js';
import { loadConfig } from '../config.js';
import { numberColumn, stringColumn } from '../db/rows.js';
import { DATABASE_COLUMN } from '../db/schema-vocabulary.constants.js';
import type { Store } from '../db/store.types.js';
import { STATUS } from '../tasks/service.constants.js';
import {
  COL_ID,
  COL_LAST_EVENT,
  COL_LEASE,
  COL_STATUS,
  COL_TITLE,
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
    result.set(stringColumn(row, DATABASE_COLUMN.PACKET_ID), {
      sessionId: stringColumn(row, 'session_id'),
      worktree: stringColumn(row, 'worktree'),
      heartbeatAt,
      stale: Date.now() - Date.parse(heartbeatAt) > loadConfig(dirname(store.dir)).tasks.leaseTtlMs,
    });
  }
  return result;
}

function eventRows(store: Store): Map<string, StatusEvent> {
  const result = new Map<string, StatusEvent>();
  const rows = store.db.prepare(STATUS_SQL.LAST_EVENTS).all();
  for (const row of rows) {
    result.set(stringColumn(row, DATABASE_COLUMN.PACKET_ID), {
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
  if (max <= 3) return text.slice(0, max);
  return `${text.slice(0, max - 3)}...`;
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
  return `Board: ${parts.join(' | ')}`;
}

export function formatStatusTable(packets: StatusPacket[]): string[] {
  const sorted = sortedPackets(packets);
  const widths = new Map<string, number>(TABLE_COLUMNS.map((c) => [c, c.length]));

  for (const p of sorted) {
    widths.set(COL_ID, Math.max(widths.get(COL_ID) ?? 0, p.id.length));
    widths.set(COL_STATUS, Math.max(widths.get(COL_STATUS) ?? 0, p.status.length));
    widths.set(COL_LEASE, Math.max(widths.get(COL_LEASE) ?? 0, leaseLabel(p).length));
    widths.set(COL_LAST_EVENT, Math.max(widths.get(COL_LAST_EVENT) ?? 0, eventLabel(p).length));
  }
  widths.set(COL_TITLE, Math.min(Math.max(widths.get(COL_TITLE) ?? 0, 1), TITLE_WIDTH));

  function colWidth(col: string): number {
    return widths.get(col) ?? 0;
  }

  const header = TABLE_COLUMNS.map((c) => c.padEnd(colWidth(c))).join(' | ');
  const lines: string[] = [header];

  let dividerEmitted = false;
  for (const p of sorted) {
    if (!dividerEmitted && DIVIDER_BEFORE.has(p.status)) {
      dividerEmitted = true;
      const sep = TABLE_COLUMNS.map((c) => '-'.repeat(colWidth(c))).join('-|-');
      lines.push(sep);
    }
    const cols: string[] = [
      p.id.padEnd(colWidth(COL_ID)),
      p.status.padEnd(colWidth(COL_STATUS)),
      leaseLabel(p).padEnd(colWidth(COL_LEASE)),
      eventLabel(p).padEnd(colWidth(COL_LAST_EVENT)),
      truncate(p.title, colWidth(COL_TITLE)).padEnd(colWidth(COL_TITLE)),
    ];
    lines.push(cols.join(' | '));
  }
  return lines;
}

export function formatFooter(backup: BoardStatus['backup'], packets: StatusPacket[]): string[] {
  const lines: string[] = [];
  const detail = backup.ageHours === undefined ? 'none' : `${backup.ageHours.toFixed(1)} hours old`;
  lines.push(`backup: ${detail}`);
  if (backup.terminalCountRegressed) {
    lines.push(`backup warning: newest backup has ${backup.terminalPacketCount} terminal packet(s), live DB has ${backup.liveTerminalPacketCount}`);
  }
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
    backup: getBackupStatus(repoRoot, {
      liveTerminalPacketCount: numberColumn(
        store.db.prepare('SELECT COUNT(*) AS n FROM packets WHERE status IN (?, ?)').get(STATUS.DONE, STATUS.DROPPED),
        'n',
      ),
    }),
  };
}
