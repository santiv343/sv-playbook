import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InventoryReport } from './inventory.types.js';
import type { GapReport } from './gap.types.js';
import { GAP_STATUS } from './gap.types.js';
import type { Store } from '../db/store.types.js';
import { createPacket } from '../tasks/service.js';
import { DEFAULTS } from '../config.constants.js';
import { PACKETS_DIR, PACKETS_DOCS_DIR } from '../tasks/service.constants.js';

function agentsTemplate(productName: string): string {
  try {
    const importPath = fileURLToPath(import.meta.url);
    const thisDir = dirname(importPath);
    const repoRoot = dirname(dirname(thisDir));
    const agentsPath = join(repoRoot, 'AGENTS.md');
    const template = readFileSync(agentsPath, 'utf8');
    return template.replace(/^# AGENTS\.md — sv-playbook$/m, `# AGENTS.md — ${productName}`);
  } catch {
    throw new Error('failed to read AGENTS.md template from playbook installation');
  }
}

function readGitSha(repoRoot: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function generateConfig(productName: string, verifyCommand: string | null, repoRoot: string, tier: string): Record<string, unknown> {
  const config: Record<string, unknown> = {
    productName,
    chatLanguage: DEFAULTS.chatLanguage,
    tier,
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
  return existsSync(path);
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

// Instala sv-playbook sobre un repo existente: escribe playbook.config.json
// + AGENTS.md (si no existía) y, por cada gap detectado por analyzeGaps que
// no esté ya PRESENT, crea un packet de remediación — así la adopción no
// deja gaps silenciosos, los convierte en trabajo trazable en el board.
// Sin --force se niega a pisar una adopción previa.
export function scaffold(
  repoRoot: string,
  inventory: InventoryReport,
  gaps: GapReport,
  force: boolean,
  store: Store,
  tier: string = DEFAULTS.tier,
): ScaffoldResult {
  const configPath = join(repoRoot, 'playbook.config.json');
  const agentsPath = join(repoRoot, 'AGENTS.md');
  const productName = readProductName(repoRoot);
  const config = generateConfig(productName, inventory.verifyCommand, repoRoot, tier);

  const alreadyAdopted = fileExists(configPath) || fileExists(agentsPath);
  if (alreadyAdopted && !force) {
    throw new Error('repo already has playbook artifacts; use --force to overwrite, or review gaps manually');
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  mkdirSync(join(repoRoot, PACKETS_DOCS_DIR, PACKETS_DIR), { recursive: true });
  let wroteAgents = false;
  if (!fileExists(agentsPath)) {
    writeFileSync(agentsPath, agentsTemplate(productName), 'utf8');
    wroteAgents = true;
  }

  let index = 1;
  for (const check of gaps.checks) {
    if (check.status === GAP_STATUS.PRESENT) continue;
    writeRemediationPacket(store, repoRoot, productName, index, check.requirement, check.status, check.reason);
    index++;
  }

  return { wroteConfig: true, wroteAgents, packetCount: index - 1 };
}
