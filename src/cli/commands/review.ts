import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { runPreflight } from '../../review/preflight.js';
import type { PreflightReport } from '../../review/preflight.types.js';

import { REVIEW_CMD_NAME, REVIEW_PREFLIGHT_USAGE } from './review.constants.js';

const PREFLIGHT_CMD = 'preflight';

class UsageError extends Error {}

function renderViolations(report: PreflightReport, io: Io): void {
  if (report.writeSetViolations.length > 0) {
    io.out('');
    io.out(`write_set violations (${report.writeSetViolations.length}):`);
    for (const v of report.writeSetViolations) io.out(`  ${v}`);
  }
  const failedStops = report.stopConditions.filter((c) => c.status === 'fail');
  if (failedStops.length > 0) {
    io.out('');
    io.out(`stop condition violations (${failedStops.length}):`);
    for (const s of failedStops) io.out(`  ${s.detail}`);
  }
}

function renderPreflightTable(report: PreflightReport, io: Io): void {
  io.out('');
  io.out(`Preflight report — ${report.packetId}`);
  io.out('');

  const rows: Array<[string, string, string]> = report.checks.map((c) => [
    c.name, c.status.toUpperCase(), c.detail,
  ]);
  rows.push(['───', '───', '───']);
  rows.push(['overall', report.overall.toUpperCase(),
    report.overall === 'pass' ? 'all checks passed' : 'some checks failed']);

  const nameW = Math.max(...rows.map((r) => r[0].length), 10);
  const statusW = Math.max(...rows.map((r) => r[1].length), 8);

  io.out(`${'check'.padEnd(nameW)}  ${'status'.padEnd(statusW)}  detail`);
  io.out(`${'-'.repeat(nameW)}  ${'-'.repeat(statusW)}  ${'-'.repeat(50)}`);
  for (const [name, status, detail] of rows) {
    io.out(`${name.padEnd(nameW)}  ${status.padEnd(statusW)}  ${detail}`);
  }

  renderViolations(report, io);
}

function handlePreflight(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    json: { type: 'boolean' },
    pr: { type: 'string' },
  } });
  const [packetId] = parsed.positionals;
  if (packetId === undefined || parsed.positionals.length !== 1) {
    throw new UsageError(REVIEW_PREFLIGHT_USAGE);
  }

  const repoRoot = commonRoot(process.cwd());
  const store = openStore(repoRoot);
  try {
    const report = runPreflight(store, packetId, process.cwd(), { pr: parsed.values.pr });
    if (parsed.values.json === true) io.out(JSON.stringify(report));
    else renderPreflightTable(report, io);
    return report.overall === 'pass' ? EXIT.OK : EXIT.GATE_FAIL;
  } finally {
    store.close();
  }
}

export const command: Command = {
  name: REVIEW_CMD_NAME,
  summary: 'Review preflight: mechanical checks for packets before reviewer dispatch',
  run(args, io): Promise<number> {
    try {
      const [sub, ...rest] = args;
      if (sub === PREFLIGHT_CMD) return Promise.resolve(handlePreflight(rest, io));
      throw new UsageError(sub === undefined ? 'missing review subcommand' : `unknown review subcommand: ${sub}`);
    } catch (error) {
      if (error instanceof UsageError) {
        io.err(error.message);
        return Promise.resolve(EXIT.USAGE);
      }
      throw error;
    }
  },
};
