import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InventoryReport } from './inventory.types.js';

export function inventoryRepo(root: string): InventoryReport {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

  const verifyCommand =
    pkg.scripts?.test ?? pkg.scripts?.verify ?? pkg.scripts?.ci ?? null;

  const packages = Array.isArray(pkg.workspaces) ? pkg.workspaces : [];

  return {
    stack: [],
    verifyCommand,
    ci: { workflows: [] },
    playbookArtifacts: {},
    git: { remoteUrl: null, defaultBranch: null },
    packages,
  };
}
