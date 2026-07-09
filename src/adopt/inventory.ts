import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

export function inventoryRepo(root: string): InventoryReport {
  const pkg = readPackageJson(root);

  const scripts = field(pkg, 'scripts');
  const scriptsObj = typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts) ? scripts : {};

  const testValue = stringOr(field(scriptsObj, 'test'), null);
  const verifyValue = stringOr(field(scriptsObj, 'verify'), null);
  const ciValue = stringOr(field(scriptsObj, 'ci'), null);
  const verifyCommand = testValue ?? verifyValue ?? ciValue;

  const packages = stringArrayOr(field(pkg, 'workspaces'));

  return {
    stack: [],
    verifyCommand,
    ci: { workflows: [] },
    playbookArtifacts: {},
    git: { remoteUrl: null, defaultBranch: null },
    packages,
  };
}
