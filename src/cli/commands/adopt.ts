import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { EXIT } from '../command.constants.js';
import type { Command } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { inventoryRepo } from '../../adopt/inventory.js';
import { analyzeGaps } from '../../adopt/gap.js';
import { scaffold } from '../../adopt/scaffold.js';
import { DEFAULTS } from '../../config.constants.js';
import type { InventoryReport } from '../../adopt/inventory.types.js';
import type { GapReport } from '../../adopt/gap.types.js';
import { GAP_STATUS } from '../../adopt/gap.types.js';
import type { Io } from '../command.types.js';

function printInventory(io: Io, targetDir: string, inventory: InventoryReport): void {
  io.out(`Target: ${targetDir}`);
  io.out(`Stack: ${inventory.stack.length > 0 ? inventory.stack.join(', ') : 'unknown'}`);
  io.out(`Verify command: ${inventory.verifyCommand ?? 'none'}`);
  io.out(`CI workflows: ${inventory.ci.workflows.length > 0 ? inventory.ci.workflows.join(', ') : 'none'}`);
  io.out(`Packages (monorepo): ${inventory.packages.length > 0 ? inventory.packages.join(', ') : 'none'}`);
  io.out(`Remote: ${inventory.git.remoteUrl || 'unknown'}`);
  io.out(`Default branch: ${inventory.git.defaultBranch || 'unknown'}`);
}

function printGaps(io: Io, gaps: GapReport): void {
  io.out('Gap analysis:');
  for (const check of gaps.checks) {
    if (check.status !== GAP_STATUS.PRESENT) {
      io.out(`  gap: ${check.requirement} (${check.status}) — ${check.reason}`);
    }
  }
}

function resolveTargetDir(positionals: (string | undefined)[]): string {
  if (positionals.length > 0 && positionals[0]) {
    return resolve(positionals[0]);
  }
  return commonRoot(getCwd());
}

export const command: Command = {
  name: 'adopt',
    summary: 'Analyze a repo and scaffold playbook artifacts (inventory+gap only by default; --force to scaffold)',
    run(args, io): Promise<number> {
      const parsed = parseArgs({
        args,
        allowPositionals: true,
        options: {
          force: { type: 'boolean' },
          tier: { type: 'string', default: DEFAULTS.tier },
        },
      });
      if (parsed.positionals.length > 1) {
        io.err('Usage: sv-playbook adopt [target-dir] [--force] [--tier <TIER>]');
        return Promise.resolve(EXIT.USAGE);
      }
      const targetDir = resolveTargetDir(parsed.positionals);
      const scaffoldMode = parsed.values.force === true;
      try {
        const inventory = inventoryRepo(targetDir);
        const gaps = analyzeGaps(inventory);
        printInventory(io, targetDir, inventory);
        io.out('');
        printGaps(io, gaps);
        if (!scaffoldMode) {
          io.out('');
          io.out('Run with --force to scaffold playbook artifacts.');
          return Promise.resolve(EXIT.OK);
        }
        io.out('');
        const store = openStore(targetDir);
        const result = scaffold(targetDir, inventory, gaps, true, store, parsed.values.tier);
        store.close();
        io.out(`scaffolded: config=${result.wroteConfig}, agents=${result.wroteAgents}, packets=${result.packetCount}`);
        return Promise.resolve(EXIT.OK);
      } catch (error) {
        io.err(`error: ${error instanceof Error ? error.message : String(error)}`);
        return Promise.resolve(EXIT.GATE_FAIL);
      }
    },
};
