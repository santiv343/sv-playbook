import { parseArgs } from 'node:util';
import { ERROR_PREFIX, EXIT, USAGE_HEADER } from '../command.constants.js';
import { EMPTY_SIZE } from '../../platform.constants.js';
import type { Command, Io } from '../command.types.js';
import { BOOLEAN_OPTION, STRING_OPTION } from './options.constants.js';
import { commonRoot, openStore } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { runPreflight } from '../../review/preflight.js';
import type { PreflightReport } from '../../review/preflight.types.js';
import { PREFLIGHT_STATUS } from '../../review/preflight.types.js';
import { getReviewCandidate, listReviewCandidates } from '../../review/review-candidate-read.js';

import { REVIEW_CMD_NAME, REVIEW_PREFLIGHT_USAGE } from './review.constants.js';

interface Subcommand {
  usage: string;
  run(rest: string[], io: Io): number | Promise<number>;
}

class UsageError extends Error {}

const SINGLE_ARG = 1;

function renderViolations(report: PreflightReport, io: Io): void {
  if (report.writeSetViolations.length > 0) {
    io.out('');
    io.out(`write_set violations (${report.writeSetViolations.length}):`);
    for (const v of report.writeSetViolations) io.out(`  ${v}`);
  }
  const failedStops = report.stopConditions.filter((c) => c.status === PREFLIGHT_STATUS.FAIL);
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
    report.overall === PREFLIGHT_STATUS.PASS ? 'all checks passed' : 'some checks failed']);

  const nameW = Math.max(...rows.map((r) => r[0].length), 10);
  const statusW = Math.max(...rows.map((r) => r[1].length), 8);

  io.out(`${'preflight-check'.padEnd(nameW)}  ${'status'.padEnd(statusW)}  detail`);
  io.out(`${'-'.repeat(nameW)}  ${'-'.repeat(statusW)}  ${'-'.repeat(50)}`);
  for (const [name, status, detail] of rows) {
    io.out(`${name.padEnd(nameW)}  ${status.padEnd(statusW)}  ${detail}`);
  }

  renderViolations(report, io);
}

async function handlePreflight(args: string[], io: Io): Promise<number> {
  const parsed = parseArgs({ args, allowPositionals: true, options: {
    json: BOOLEAN_OPTION,
    pr: STRING_OPTION,
  } });
  const [packetId] = parsed.positionals;
  if (packetId === undefined || parsed.positionals.length !== 1) {
    throw new UsageError(REVIEW_PREFLIGHT_USAGE);
  }

  const repoRoot = commonRoot(getCwd());
  const store = openStore(repoRoot);
  try {
    const report = await runPreflight(store, packetId, getCwd(), { pr: parsed.values.pr });
    if (parsed.values.json === true) io.out(JSON.stringify(report));
    else renderPreflightTable(report, io);
    return report.overall === PREFLIGHT_STATUS.PASS ? EXIT.OK : EXIT.GATE_FAIL;
  } finally {
    store.close();
  }
}

function handleCandidateList(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: {} });
  if (parsed.positionals.length !== EMPTY_SIZE) throw new UsageError('candidate list accepts no positional arguments');
  const repoRoot = commonRoot(getCwd());
  const store = openStore(repoRoot);
  try {
    const rows = listReviewCandidates(store);
    if (rows.length === EMPTY_SIZE) {
      io.out('no review candidates');
      return EXIT.OK;
    }
    for (const row of rows) {
      io.out(`${row.id}\t${row.candidateSha}\t${row.branch}`);
    }
    return EXIT.OK;
  } finally {
    store.close();
  }
}

function handleCandidateShow(args: string[], io: Io): number {
  const [id] = args;
  if (id === undefined || args.length !== SINGLE_ARG) throw new UsageError('candidate show requires an ID');
  const repoRoot = commonRoot(getCwd());
  const store = openStore(repoRoot);
  try {
    const candidate = getReviewCandidate(store, id);
    if (candidate === undefined) {
      io.err(`${ERROR_PREFIX}unknown review candidate: ${id}`);
      return EXIT.GATE_FAIL;
    }
    io.out(`id: ${candidate.id}`);
    io.out(`packet_id: ${candidate.packetId}`);
    io.out(`work_definition_version: ${candidate.workDefinitionVersion}`);
    io.out(`candidate_sha: ${candidate.candidateSha}`);
    io.out(`branch: ${candidate.branch}`);
    io.out(`created_at: ${candidate.createdAt}`);
    return EXIT.OK;
  } finally {
    store.close();
  }
}

const CANDIDATE_SUBCOMMANDS: ReadonlyMap<string, Subcommand> = new Map([
  ['list', { usage: 'sv-playbook review candidate list', run: handleCandidateList }],
  ['show', { usage: 'sv-playbook review candidate show <ID>', run: handleCandidateShow }],
]);

function handleCandidate(args: string[], io: Io): number | Promise<number> {
  const [sub, ...rest] = args;
  const c = sub === undefined ? undefined : CANDIDATE_SUBCOMMANDS.get(sub);
  if (c !== undefined) {
    const result = c.run(rest, io);
    return result instanceof Promise ? result : Promise.resolve(result);
  }
  throw new UsageError(sub === undefined ? 'missing candidate subcommand' : `unknown candidate subcommand: ${sub}`);
}

const SUBCOMMANDS: ReadonlyMap<string, Subcommand> = new Map([
  ['preflight', { usage: REVIEW_PREFLIGHT_USAGE, run: handlePreflight }],
  ['candidate', { usage: 'sv-playbook review candidate <list|show>', run: handleCandidate }],
]);

const USAGE = [USAGE_HEADER, ...Array.from(SUBCOMMANDS.values()).map((s) => `  ${s.usage}`)].join('\n');

export const command: Command = {
  name: REVIEW_CMD_NAME,
  summary: 'Review preflight and candidate inspection',
  usage: 'Usage: sv-playbook review <preflight|candidate>',
  async run(args, io): Promise<number> {
    try {
      const [sub, ...rest] = args;
      const c = sub === undefined ? undefined : SUBCOMMANDS.get(sub);
      if (c !== undefined) {
        const result = c.run(rest, io);
        return await result;
      }
      throw new UsageError(sub === undefined ? 'missing review subcommand' : `unknown review subcommand: ${sub}`);
    } catch (error) {
      if (error instanceof UsageError) {
        io.err(USAGE);
        io.err(`${ERROR_PREFIX}${error.message}`);
        return EXIT.USAGE;
      }
      throw error;
    }
  },
};
