import type { InventoryReport } from './inventory.types.js';
import type { GapCheckResult, GapReport, GapStatus } from './gap.types.js';

function checkArtifact(
  inventory: InventoryReport,
  key: string,
  reason: string,
): GapCheckResult {
  const present = inventory.playbookArtifacts[key];
  if (present === undefined || !present) {
    return { requirement: key, status: 'missing', reason };
  }
  return { requirement: key, status: 'present', reason };
}

export function analyzeGaps(inventory: InventoryReport): GapReport {
  const checks: GapCheckResult[] = [
    checkArtifact(
      inventory,
      'playbook.config.json',
      'playbook.config.json is missing — declare a tier',
    ),
    checkArtifact(
      inventory,
      'AGENTS.md',
      'AGENTS.md is missing — cold-start required',
    ),
    {
      requirement: 'verify command',
      status: inventory.verifyCommand ? 'present' : 'missing',
      reason: inventory.verifyCommand
        ? `Found verify command: ${inventory.verifyCommand}`
        : 'No verify command defined',
    },
    {
      requirement: 'docs/packets/',
      status: inventory.playbookArtifacts['docs/packets/'] ? 'present' : 'missing',
      reason: inventory.playbookArtifacts['docs/packets/']
        ? 'docs/packets/ directory exists'
        : 'docs/packets/ directory is missing',
    },
    {
      requirement: 'CI workflow',
      status: inventory.ci.workflows.length > 0 ? 'present' : 'missing',
      reason: inventory.ci.workflows.length > 0
        ? `Found CI workflows: ${inventory.ci.workflows.join(', ')}`
        : 'No CI workflow that runs verify found',
    },
    {
      requirement: 'branch protection',
      status: 'unknown',
      reason: 'Cannot check branch protection offline — verify in GitHub settings',
    },
  ];

  checks.sort((a, b) => {
    const order: Record<GapStatus, number> = {
      missing: 0,
      violating: 0,
      unknown: 1,
      present: 2,
    };
    return order[a.status] - order[b.status];
  });

  return { checks };
}
