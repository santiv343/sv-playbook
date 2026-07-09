import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { stringColumn } from '../../db/rows.js';
import { readBoardStatus } from '../../status/status.js';
import type { BoardStatus } from '../../status/status.types.js';
import { ATTENTION_STATUSES, GH_UNAVAILABLE, NEXT_ACTION, PRE_FLIGHT_WARNING, ROLE_POINTER, STALE_NOTES_SQL } from './handoff.constants.js';

const USAGE = 'Usage: sv-playbook handoff [--role <role>] [--force]';

function nullableStringColumn(row: unknown, key: string): string | null {
  if (typeof row !== 'object' || row === null) {
    throw new TypeError(`invalid row: expected object for ${key}`);
  }
  for (const [candidate, value] of Object.entries(row)) {
    if (candidate === key) {
      if (value === null) return null;
      if (typeof value !== 'string') {
        throw new TypeError(`invalid row: column ${key} must be a string or null`);
      }
      return value;
    }
  }
  throw new TypeError(`invalid row: missing column ${key}`);
}

function stalePacketIds(store: ReturnType<typeof openStore>): string[] {
  const rows = store.db.prepare(STALE_NOTES_SQL).all();
  const stale: string[] = [];
  for (const row of rows) {
    const lastNoteAt = nullableStringColumn(row, 'last_note_at');
    const lastTransitionAt = nullableStringColumn(row, 'last_transition_at');
    if (lastNoteAt === null || lastTransitionAt === null) {
      if (lastTransitionAt !== null) stale.push(stringColumn(row, 'id'));
      continue;
    }
    if (Date.parse(lastNoteAt) < Date.parse(lastTransitionAt)) {
      stale.push(stringColumn(row, 'id'));
    }
  }
  return stale;
}

function prSection(): string {
  try {
    const result = execFileSync('gh', ['pr', 'list', '--json', 'number,title,headRefName,state'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    const prs: unknown = JSON.parse(result);
    if (!Array.isArray(prs) || prs.length === 0) return 'No open PRs.';
    const lines = prs.map((pr: { number: number; title: string; headRefName: string; state: string }) =>
      `  #${pr.number} ${pr.title} (${pr.headRefName}) [${pr.state}]`,
    );
    return `Open PRs:\n${lines.join('\n')}`;
  } catch {
    return GH_UNAVAILABLE;
  }
}

function boardSection(status: BoardStatus): string {
  const lines: string[] = [];
  lines.push('Board snapshot:');
  lines.push('');
  lines.push('counts:');
  for (const [state, count] of Object.entries(status.counts)) {
    lines.push(`  ${state}: ${count}`);
  }
  const attention = status.packets.filter((p) =>
    ATTENTION_STATUSES.some((status) => p.status === status),
  );
  if (attention.length > 0) {
    lines.push('');
    lines.push('packets needing attention:');
    for (const packet of attention) {
      lines.push(`  ${packet.id}\t${packet.status}\t${packet.title}`);
    }
  }
  return lines.join('\n');
}

export function handoffCommand(): Command {
  return {
    name: 'handoff',
    summary: 'Generate a deterministic cold-start continuation prompt from live board state',
    run(args, io): Promise<number> {
      const parsed = parseArgs({
        args,
        allowPositionals: true,
        options: {
          role: { type: 'string', default: 'orchestrator' },
          force: { type: 'boolean', default: false },
        },
      });
      if (parsed.positionals.length > 0) {
        io.err(USAGE);
        return Promise.resolve(EXIT.USAGE);
      }
      const role = typeof parsed.values.role === 'string' ? parsed.values.role : 'orchestrator';
      const repoRoot = commonRoot(process.cwd());
      const store = openStore(repoRoot);
      try {
        if (!parsed.values.force) {
          const stale = stalePacketIds(store);
          if (stale.length > 0) {
            io.err(PRE_FLIGHT_WARNING(stale.join(', ')));
            return Promise.resolve(EXIT.GATE_FAIL);
          }
        }

        const status = readBoardStatus(store, repoRoot);

        io.out(ROLE_POINTER(role));
        io.out('');
        io.out(boardSection(status));
        io.out('');
        io.out(prSection());
        io.out('');
        io.out(NEXT_ACTION(status.counts));

        return Promise.resolve(EXIT.OK);
      } finally {
        store.close();
      }
    },
  };
}
