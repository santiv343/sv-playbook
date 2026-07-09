import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { inventoryRepo } from '../../adopt/inventory.js';
import { analyzeGaps } from '../../adopt/gap.js';
import { scaffold } from '../../adopt/scaffold.js';

function reportGaps(io: { out(line: string): void }, gaps: ReturnType<typeof analyzeGaps>): void {
  for (const check of gaps.checks) {
    if (check.status !== 'present') {
      io.out(`  gap: ${check.requirement} (${check.status}) — ${check.reason}`);
    }
  }
}

export function adoptCommand(): Command {
  return {
    name: 'adopt',
    summary: 'Scaffold playbook artifacts (config, AGENTS.md, remediation packets) on a bare repo',
    run(args, io): Promise<number> {
      const parsed = parseArgs({ args, allowPositionals: true, options: { force: { type: 'boolean' } } });
      if (parsed.positionals.length > 0) {
        io.err('Usage: sv-playbook adopt [--force]');
        return Promise.resolve(EXIT.USAGE);
      }
      try {
        const docRoot = commonRoot(process.cwd());
        const inventory = inventoryRepo(docRoot);
        const gaps = analyzeGaps(inventory);
        const store = openStore(docRoot);
        const result = scaffold(docRoot, inventory, gaps, parsed.values.force === true, store);
        store.close();
        io.out(`scaffolded: config=${result.wroteConfig}, agents=${result.wroteAgents}, packets=${result.packetCount}`);
        reportGaps(io, gaps);
        return Promise.resolve(EXIT.OK);
      } catch (error) {
        io.err(`error: ${error instanceof Error ? error.message : String(error)}`);
        return Promise.resolve(EXIT.GATE_FAIL);
      }
    },
  };
}
