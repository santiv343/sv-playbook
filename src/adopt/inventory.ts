import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { InventoryReport } from './inventory.types.js';

function field(raw: object, key: string): unknown {
  return Object.entries(raw).find(([k]) => k === key)?.[1];
}

function stringOr(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return fallback;
  return value;
}

function stringArrayOr(value: unknown): string[] {
  if (Array.isArray(value) && value.every((e): e is string => typeof e === 'string')) {
    return value;
  }
  return [];
}

function readPackageJson(repoRoot: string): object {
  const text = readFileSync(join(repoRoot, 'package.json'), 'utf-8');
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('package.json: expected an object');
  }
  return raw;
}

function extractYamlListItem(line: string): string | null {
  const m = /^\s*-\s+'([^']+)'/.exec(line);
  const v = m?.[1];
  if (v) return v;
  const m2 = /^\s*-\s+"([^"]+)"/.exec(line);
  const v2 = m2?.[1];
  if (v2) return v2;
  const m3 = /^\s*-\s+(\S.*)$/.exec(line);
  const v3 = m3?.[1];
  if (v3) return v3;
  return null;
}

function readPnpmWorkspace(root: string): string[] {
  try {
    const content = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf-8');
    const packages: string[] = [];
    for (const line of content.split('\n')) {
      const pkg = extractYamlListItem(line);
      if (pkg) {
        packages.push(pkg);
      }
    }
    return packages;
  } catch {
    return [];
  }
}

function getDepKeys(pkg: object): string[] {
  const keys = new Set<string>();
  const deps = field(pkg, 'dependencies');
  if (typeof deps === 'object' && deps !== null) {
    Object.keys(deps).forEach(k => keys.add(k));
  }
  const devDeps = field(pkg, 'devDependencies');
  if (typeof devDeps === 'object' && devDeps !== null) {
    Object.keys(devDeps).forEach(k => keys.add(k));
  }
  return [...keys];
}

function addDepFlags(stack: string[], root: string, depKeys: string[]): void {
  if (depKeys.includes('typescript') || existsSync(join(root, 'tsconfig.json'))) {
    stack.push('typescript');
  }
  if (depKeys.includes('react') || depKeys.includes('react-dom')) {
    stack.push('react');
  }
  for (const tech of DEP_BASED_TECHS) {
    if (depKeys.includes(tech)) stack.push(tech);
  }
}

function addFileFlags(stack: string[], root: string): void {
  for (const [file, label] of LOCKFILES) {
    if (existsSync(join(root, file))) stack.push(label);
  }
  for (const [file, label] of MONOREPO_TOOLS) {
    if (existsSync(join(root, file))) stack.push(label);
  }
}

function detectStack(root: string, pkg: object): string[] {
  const stack: string[] = ['node'];
  addDepFlags(stack, root, getDepKeys(pkg));
  addFileFlags(stack, root);
  return [...new Set(stack)];
}

const DEP_BASED_TECHS = ['next', 'vue', 'eslint', 'prettier'];

const LOCKFILES: [string, string][] = [
  ['package-lock.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
];

const MONOREPO_TOOLS: [string, string][] = [
  ['turbo.json', 'turborepo'],
  ['nx.json', 'nx'],
  ['lerna.json', 'lerna'],
];

function checkPlaybookArtifacts(root: string): Record<string, boolean> {
  return {
    'AGENTS.md': existsSync(join(root, 'AGENTS.md')),
    'playbook.config.json': existsSync(join(root, 'playbook.config.json')),
    'docs/packets/': existsSync(join(root, 'docs', 'packets')),
    '.svp/': existsSync(join(root, '.svp')),
  };
}

function scanCiWorkflows(root: string): string[] {
  try {
    const dir = join(root, '.github', 'workflows');
    return readdirSync(dir).filter(e => e.endsWith('.yml') || e.endsWith('.yaml'));
  } catch {
    return [];
  }
}

function resolveGitInfo(root: string): { remoteUrl: string | null; defaultBranch: string | null } {
  let remoteUrl: string | null = null;
  try {
    remoteUrl = execSync('git remote get-url origin', { cwd: root, encoding: 'utf-8' }).trim();
  } catch {
    // no remote configured
  }

  let defaultBranch: string | null = null;
  try {
    defaultBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf-8' }).trim();
  } catch {
    // no HEAD yet (empty repo)
  }

  return { remoteUrl, defaultBranch };
}

export function inventoryRepo(root: string): InventoryReport {
  const pkg = readPackageJson(root);

  const scripts = field(pkg, 'scripts');
  const scriptsObj = typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts) ? scripts : {};

  const testValue = stringOr(field(scriptsObj, 'test'), null);
  const verifyValue = stringOr(field(scriptsObj, 'verify'), null);
  const ciValue = stringOr(field(scriptsObj, 'ci'), null);
  const verifyCommand = testValue ?? verifyValue ?? ciValue;

  const npmWorkspaces = stringArrayOr(field(pkg, 'workspaces'));
  const pnpmWorkspaces = readPnpmWorkspace(root);
  const packages = [...new Set([...npmWorkspaces, ...pnpmWorkspaces])];

  return {
    stack: detectStack(root, pkg),
    verifyCommand,
    ci: { workflows: scanCiWorkflows(root) },
    playbookArtifacts: checkPlaybookArtifacts(root),
    git: resolveGitInfo(root),
    packages,
  };
}