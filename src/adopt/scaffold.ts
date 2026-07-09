import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import type { InventoryReport } from './inventory.types.js';
import type { GapReport } from './gap.types.js';
import type { Store } from '../db/store.types.js';
import { createPacket } from '../tasks/service.js';
import { DEFAULTS } from '../config.constants.js';

function agentsTemplate(productName: string): string {
  return `# AGENTS.md — ${productName}

You are an AI agent working under the sv-playbook methodology on THIS repo
(${productName}). Read this first; everything else is on demand
via \`npx sv-playbook docs <topic>\`.

## Hard rules (non-negotiable; mechanized where stated)
1. **Never push or merge to \`main\` directly.** \`main\` is branch-protected: direct
   pushes are rejected. Every change goes through a pull request. Enforcement:
   GitHub branch protection (\`enforce_admins\` on, PR required, \`verify\` status
   checks required, linear history) — this is a \`[gate]\`, not a request.
2. **No PR is merged without a reviewer's APPROVED verdict.** A reviewer agent
   (or the human) runs \`npx sv-playbook docs review\` on the diff; the
   **reviewer performs the merge** on APPROVED (M1–M3 in \`docs roles/reviewer\`).
3. **Evidence is captured by the CLI, never transcribed.** SHAs and verify output
   come from \`task move <id> review\`, not from memory or pasting.
4. **Single source (PRINCIPLE-011).** No fact defined twice — duplicated unions,
   parallel lists, scattered literals, or restated rules are instant review
   failures.

## Your role (one per task — read the charter before starting)
- **PM / orchestrator** — drives the board, delegates to workers/reviewers,
  relays the verdict. \`npx sv-playbook docs roles/orchestrator\`
- **Implementer (worker)** — one packet, one branch, RED-first, verify green.
  \`npx sv-playbook docs roles/implementer\`
- **Reviewer** — the checklist, verdict APPROVED | REQUEST CHANGES.
  \`npx sv-playbook docs roles/reviewer\`
- **Planner / product** — \`npx sv-playbook docs roles/planner\` · \`docs roles/product\`

## Operate
- Board: \`npx sv-playbook status\` · Health: \`npx sv-playbook doctor\`.
- The CLI is the ONLY writer of operational state. Never hand-edit \`.svp/\` or a
  packet's status.
- \`.svp/\` is local/gitignored (SQLite operational truth). Packet docs live in
  \`docs/packets/\`. SQLite is operational truth — NOT rebuildable from files;
  durability is \`backup state\` / \`restore state\`.

## Constitution (on demand)
\`npx sv-playbook docs principles\` · \`docs cli\` · \`docs review\` ·
\`docs roles/<role>\` · \`docs dispatch/...\`
`;
}

function readGitSha(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function generateConfig(productName: string, verifyCommand: string | null, repoRoot: string): Record<string, unknown> {
  const config: Record<string, unknown> = {
    productName,
    chatLanguage: DEFAULTS.chatLanguage,
    tier: DEFAULTS.tier,
    verifyCommand: verifyCommand ?? DEFAULTS.verifyCommand,
    autonomy: DEFAULTS.autonomy,
    backup: {
      enabled: DEFAULTS.backup.enabled,
      retention: DEFAULTS.backup.retention,
      maxAgeHours: DEFAULTS.backup.maxAgeHours,
      onEvents: DEFAULTS.backup.onEvents,
    },
  };
  const sha = readGitSha(repoRoot);
  if (sha !== '') {
    config.baseline = {
      commit: sha,
      timestamp: new Date().toISOString(),
    };
  }
  return config;
}

function makePacketId(repoProductName: string, index: number): string {
  const safe = repoProductName.replace(/[^A-Za-z0-9-]/g, '-').toUpperCase().slice(0, 20);
  return `ADOPT-${safe}-${String(index).padStart(3, '0')}`;
}

function readProductName(repoRoot: string): string {
  try {
    const pkgText = readFileSync(join(repoRoot, 'package.json'), 'utf8');
    const pkg: unknown = JSON.parse(pkgText);
    if (typeof pkg === 'object' && pkg !== null && !Array.isArray(pkg)) {
      if ('name' in pkg && typeof pkg.name === 'string') return pkg.name;
    }
    return DEFAULTS.productName;
  } catch {
    return DEFAULTS.productName;
  }
}

function fileExists(path: string): boolean {
  try {
    execFileSync('test', ['-f', path]);
    return true;
  } catch {
    return false;
  }
}

function writeRemediationPacket(
  store: Store,
  repoRoot: string,
  productName: string,
  index: number,
  requirement: string,
  status: string,
  reason: string,
): void {
  const packetId = makePacketId(productName, index);
  const body = [
    '## Task',
    `Gap identified during adopt: **${requirement}**`,
    '',
    `Status: ${status}`,
    `Reason: ${reason}`,
  ].join('\n');
  createPacket(store, repoRoot, {
    id: packetId,
    title: `Remediate: ${requirement}`,
    dependsOn: [],
    writeSet: ['docs/packets/**'],
    requirements: [],
    evidenceRequired: ['final-sha'],
  }, body);
}

interface ScaffoldResult {
  wroteConfig: boolean;
  wroteAgents: boolean;
  packetCount: number;
}

export function scaffold(
  repoRoot: string,
  inventory: InventoryReport,
  gaps: GapReport,
  force: boolean,
  store: Store,
): ScaffoldResult {
  const configPath = join(repoRoot, 'playbook.config.json');
  const agentsPath = join(repoRoot, 'AGENTS.md');
  const productName = readProductName(repoRoot);
  const config = generateConfig(productName, inventory.verifyCommand, repoRoot);

  const alreadyAdopted = fileExists(configPath) || fileExists(agentsPath);
  if (alreadyAdopted && !force) {
    throw new Error('repo already has playbook artifacts; use --force to overwrite, or review gaps manually');
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  writeFileSync(agentsPath, agentsTemplate(productName), 'utf8');

  let index = 1;
  for (const check of gaps.checks) {
    if (check.status === 'present') continue;
    writeRemediationPacket(store, repoRoot, productName, index, check.requirement, check.status, check.reason);
    index++;
  }

  return { wroteConfig: true, wroteAgents: true, packetCount: index - 1 };
}
