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
  const m = line.match(/^\s*-\s+'([^']+)'/);
  if (m) return m[1]!;
  const m2 = line.match(/^\s*-\s+"([^"]+)"/);
  if (m2) return m2[1]!;
  const m3 = line.match(/^\s*-\s+(\S.*)$/);
  if (m3) return m3[1]!;
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

function detectStack(root: string, pkg: object): string[] {
  const stack: string[] = ['node'];

  const deps = { ...(field(pkg, 'dependencies') as Record<string, unknown> ?? {}), ...(field(pkg, 'devDependencies') as Record<string, unknown> ?? {}) };
  const depKeys = Object.keys(deps);

  if (depKeys.includes('typescript') || existsSync(join(root, 'tsconfig.json'))) {
    stack.push('typescript');
  }
  if (depKeys.includes('react') || depKeys.includes('react-dom')) {
    stack.push('react');
  }
  if (depKeys.includes('next')) {
    stack.push('next');
  }
  if (depKeys.includes('vue')) {
    stack.push('vue');
  }
  if (depKeys.includes('eslint')) {
    stack.push('eslint');
  }
  if (depKeys.includes('prettier')) {
    stack.push('prettier');
  }

  if (existsSync(join(root, 'package-lock.json'))) stack.push('npm');
  if (existsSync(join(root, 'pnpm-lock.yaml'))) stack.push('pnpm');
  if (existsSync(join(root, 'yarn.lock'))) stack.push('yarn');
  if (existsSync(join(root, 'bun.lockb'))) stack.push('bun');

  if (existsSync(join(root, 'turbo.json'))) stack.push('turborepo');
  if (existsSync(join(root, 'nx.json'))) stack.push('nx');
  if (existsSync(join(root, 'lerna.json'))) stack.push('lerna');

  return [...new Set(stack)];
}

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