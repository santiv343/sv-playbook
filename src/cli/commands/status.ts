import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { readBoardStatus } from '../../status/status.js';
import type { BoardStatus, StatusPacket } from '../../status/status.types.js';

const USAGE = 'Usage: sv-playbook status [--json]';

function renderCounts(status: BoardStatus, io: Io): void {
  io.out('counts:');
  for (const [state, count] of Object.entries(status.counts)) io.out(`  ${state}: ${count}`);
}

function leaseText(packet: StatusPacket): string {
  if (packet.lease === undefined) return 'no lease';
  return `${packet.lease.stale ? 'stale' : 'fresh'} lease ${packet.lease.sessionId}`;
}

function eventText(packet: StatusPacket): string {
  if (packet.lastEvent === undefined) return 'no events';
  return `${packet.lastEvent.command} ${packet.lastEvent.detail}`;
}

function renderPackets(status: BoardStatus, io: Io): void {
  io.out('packets:');
  for (const packet of status.packets) {
    io.out(`  ${packet.id}\t${packet.status}\t${leaseText(packet)}\t${eventText(packet)}\t${packet.title}`);
  }
}

function renderBackup(status: BoardStatus, io: Io): void {
  const detail = status.backup.ageHours === undefined ? 'none' : `${status.backup.ageHours.toFixed(1)} hours old`;
  io.out(`backup: ${detail}`);
}

function renderStatus(status: BoardStatus, io: Io): void {
  renderCounts(status, io);
  renderPackets(status, io);
  renderBackup(status, io);
}

export function statusCommand(): Command {
  return {
    name: 'status',
    summary: 'Print board, lease, event, and backup status',
    run(args, io): Promise<number> {
      const parsed = parseArgs({ args, allowPositionals: true, options: { json: { type: 'boolean' } } });
      if (parsed.positionals.length > 0) {
        io.err(USAGE);
        return Promise.resolve(EXIT.USAGE);
      }
      const repoRoot = commonRoot(process.cwd());
      const store = openStore(repoRoot);
      try {
        const status = readBoardStatus(store, repoRoot);
        if (parsed.values.json === true) io.out(JSON.stringify(status));
        else renderStatus(status, io);
        return Promise.resolve(EXIT.OK);
      } finally {
        store.close();
      }
    },
  };
}
