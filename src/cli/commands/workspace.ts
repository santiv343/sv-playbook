import { parseArgs } from 'node:util';
import { commonRoot, openStoreReadOnly, worktreeRoot } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { classifyWorkspace } from '../../workspace/classification.js';
import { WORKSPACE_OWNERSHIP } from '../../workspace/classification.constants.js';
import type { WorkspaceClassificationReport } from '../../workspace/classification.types.js';
import { CLI_OPTION_TYPE, EXIT } from '../command.constants.js';
import { EMPTY_SIZE } from '../../platform.constants.js';
import type { Command, Io } from '../command.types.js';
import { WORKSPACE_SUBCOMMAND, WORKSPACE_USAGE } from './workspace.constants.js';

function renderHuman(report: WorkspaceClassificationReport, io: Io): void {
  const summary = report.summary;
  io.out(`paths: ${report.paths.length} | current ${summary[WORKSPACE_OWNERSHIP.CURRENT]} | planned ${summary[WORKSPACE_OWNERSHIP.PLANNED]} | multiple ${summary[WORKSPACE_OWNERSHIP.AMBIGUOUS]} | terminal-only ${summary[WORKSPACE_OWNERSHIP.TERMINAL]} | orphan ${summary[WORKSPACE_OWNERSHIP.ORPHAN]}`);
  io.out('');
  io.out('STATUS\tOWNERSHIP\tPATH\tOWNERS');
  for (const entry of report.paths) {
    const owners = entry.owners.map((owner) => `${owner.id} (${owner.status})`).join(', ');
    io.out(`${entry.gitStatus}\t${entry.ownership}\t${entry.path}\t${owners}`);
  }
}

export const command: Command = {
  name: 'workspace',
  summary: 'Classify dirty paths against task write sets and lifecycle state',
  run(args, io): Promise<number> {
    const [subcommand, ...rest] = args;
    if (subcommand !== WORKSPACE_SUBCOMMAND.CLASSIFY) {
      io.err(WORKSPACE_USAGE);
      return Promise.resolve(EXIT.USAGE);
    }
    const parsed = parseArgs({ args: rest, allowPositionals: true, options: { json: { type: CLI_OPTION_TYPE.BOOLEAN } } });
    if (parsed.positionals.length > EMPTY_SIZE) {
      io.err(WORKSPACE_USAGE);
      return Promise.resolve(EXIT.USAGE);
    }

    const cwd = getCwd();
    const store = openStoreReadOnly(commonRoot(cwd));
    try {
      const report = classifyWorkspace(store, worktreeRoot(cwd));
      if (parsed.values.json === true) io.out(JSON.stringify(report));
      else renderHuman(report, io);
      return Promise.resolve(EXIT.OK);
    } finally {
      store.close();
    }
  },
};
