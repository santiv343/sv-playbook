import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import type { Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { readBoardStatus } from '../../status/status.js';
import type { BoardStatus } from '../../status/status.types.js';
import { numberColumn, stringColumn } from '../../db/rows.js';
import { ATTENTION_STATUSES, HANDOFF_ROLE_DEFAULT, nextActionAndCounts, rolePointers } from './handoff.constants.js';

const NO_PRS = 'open PRs: none';

function staleActivePackets(store: { db: { prepare(sql: string): { all(): unknown[] } } }): string[] {
  const rows = store.db.prepare(`
    SELECT p.id, p.status,
      COALESCE((SELECT MAX(seq) FROM events WHERE packet_id = p.id AND command = 'note'), -1) as last_note_seq,
      COALESCE((SELECT MAX(seq) FROM events WHERE packet_id = p.id AND command = 'transition'), -1) as last_transition_seq
    FROM packets p
    WHERE p.status IN ('active', 'blocked')
  `).all();
  const stale: string[] = [];
  for (const row of rows) {
    const lastNote = numberColumn(row, 'last_note_seq');
    const lastTransition = numberColumn(row, 'last_transition_seq');
    if (lastNote < lastTransition) {
      stale.push(stringColumn(row, 'id'));
    }
  }
  return stale;
}

function renderBoardSnapshot(status: BoardStatus): string[] {
  const lines: string[] = [];
  lines.push('counts:');
  for (const [state, count] of Object.entries(status.counts)) {
    lines.push(`  ${state}: ${count}`);
  }
  const attention = status.packets.filter((p) => ATTENTION_STATUSES.includes(p.status));
  if (attention.length > 0) {
    lines.push('attention:');
    for (const p of attention) {
      lines.push(`  ${p.id}\t${p.status}\t${p.title}`);
    }
  }
  return lines;
}

interface PrEntry {
  number: number;
  title: string;
  headRefName: string;
  state: string;
}

function isPrEntry(value: unknown): value is PrEntry {
  return typeof value === 'object' && value !== null && 'number' in value && 'title' in value;
}

function renderPrs(): string[] {
  const lines: string[] = [];
  try {
    const raw = execFileSync('gh', ['pr', 'list', '--json', 'number,title,headRefName,state'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!raw) {
      lines.push(NO_PRS);
      return lines;
    }
    const prs: unknown = JSON.parse(raw);
    if (!Array.isArray(prs) || prs.length === 0) {
      lines.push(NO_PRS);
      return lines;
    }
    lines.push('open PRs:');
    for (const entry of prs) {
      if (isPrEntry(entry)) {
        lines.push(`  #${String(entry.number)} ${entry.title} (${entry.headRefName}) [${entry.state}]`);
      }
    }
  } catch {
    lines.push('open PRs: could not fetch — run `gh pr list` manually.');
  }
  return lines;
}

export const command: Command = {
  name: 'handoff',
    summary: 'Generate a deterministic continuation prompt from live state',
    run(args, io: Io): Promise<number> {
      const parsed = parseArgs({
        args,
        strict: false,
        options: {
          role: { type: 'string', default: HANDOFF_ROLE_DEFAULT },
          force: { type: 'boolean', default: false },
        },
      });

      const repoRoot = commonRoot(process.cwd());
      const store = openStore(repoRoot);
      try {
        const stale = staleActivePackets(store);
        if (stale.length > 0 && !parsed.values.force) {
          io.err(
            '⚠ The following active/blocked packets have stale notes (state changed without a follow-up note):',
          );
          for (const id of stale) {
            io.err(`  - ${id}`);
          }
          io.err(
            'Run `sv-playbook task note <id> "<where I left off>"` for each, then re-run handoff. Or use --force to skip.',
          );
          return Promise.resolve(EXIT.GATE_FAIL);
        }

        const status = readBoardStatus(store, repoRoot);
        const role = String(parsed.values.role);

        const output: string[] = [];
        output.push(rolePointers(role));
        output.push('');
        output.push(...renderBoardSnapshot(status));
        output.push('');
        output.push(...renderPrs());
        output.push('');

        const packetsByStatus = new Map<string, string[]>();
        for (const [state] of Object.entries(status.counts)) {
          packetsByStatus.set(state, status.packets.filter((p) => p.status === state).map((p) => p.id));
        }
        output.push(nextActionAndCounts(packetsByStatus));

        for (const line of output) io.out(line);
        return Promise.resolve(EXIT.OK);
      } finally {
        store.close();
      }
    },
};
