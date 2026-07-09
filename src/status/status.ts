import type { Store } from '../db/store.types.js';
import { stringColumn } from '../db/rows.js';
import { latestStateBackupAgeHours } from '../db/backup.js';
import { LEASE_TTL_MS } from '../tasks/service.constants.js';
import { COLUMNS, DIVIDER_BEFORE, PACKET_STATUSES, SORT_ORDER, STATUS_SQL } from './status.constants.js';
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

function padCell(text: string, width: number): string {
  if (text.length > width) return text.slice(0, width - 1) + '\u2026';
  return text.padEnd(width);
}

function leaseCell(packet: StatusPacket): string {
  if (packet.lease === undefined) return 'no lease';
  return `${packet.lease.stale ? 'stale' : 'fresh'} ${packet.lease.sessionId}`;
}

function eventCell(packet: StatusPacket): string {
  if (packet.lastEvent === undefined) return 'no events';
  return `${packet.lastEvent.command} ${packet.lastEvent.detail}`;
}

function backupText(status: BoardStatus): string {
  if (status.backup.ageHours === undefined) return 'none';
  return `${status.backup.ageHours.toFixed(1)} hours old`;
}

export function formatHumanStatus(status: BoardStatus): string {
  const lines: string[] = [];

  const orderedStatuses = SORT_ORDER.filter((s) => s in status.counts);
  const countParts = orderedStatuses.map((s) => `${status.counts[s]} ${s}`);
  lines.push(`Board: ${countParts.join(' \u00b7 ')}`);

  const headerCells = COLUMNS.map((c) => c.header.padEnd(c.width));
  const headerLine = headerCells.join(' | ');
  lines.push(headerLine);

  const sorted = [...status.packets].sort((a, b) => {
    const aIdx = SORT_ORDER.indexOf(a.status);
    const bIdx = SORT_ORDER.indexOf(b.status);
    return aIdx - bIdx;
  });

  let dividerShown = false;
  for (const packet of sorted) {
    if (!dividerShown && DIVIDER_BEFORE.includes(packet.status)) {
      lines.push('\u2500'.repeat(headerLine.length));
      dividerShown = true;
    }
    const cells = [
      padCell(packet.id, COLUMNS[0].width),
      padCell(packet.status, COLUMNS[1].width),
      padCell(leaseCell(packet), COLUMNS[2].width),
      padCell(eventCell(packet), COLUMNS[3].width),
      padCell(packet.title, COLUMNS[4].width),
    ];
    lines.push(cells.join(' | '));
  }

  const age = backupText(status);
  lines.push(`backup: ${age}`);

  const totalLeases = status.packets.filter((p) => p.lease !== undefined).length;
  const liveLeases = status.packets.filter((p) => p.lease !== undefined && !p.lease.stale).length;
  lines.push(`${liveLeases}/${totalLeases} leases live`);

  return lines.join('\n');
}
