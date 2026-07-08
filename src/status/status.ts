import type { Store } from '../db/store.types.js';
import { stringColumn } from '../db/rows.js';
import { latestStateBackupAgeHours } from '../db/backup.js';
import { LEASE_TTL_MS } from '../tasks/service.constants.js';
import { PACKET_STATUSES, STATUS_SQL } from './status.constants.js';
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
