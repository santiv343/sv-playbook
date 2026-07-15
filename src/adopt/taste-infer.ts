import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLINT_CONFIG_SIGNAL } from './taste-infer.constants.js';
import type { InferredConvention } from './taste-infer.types.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inferTsconfigConventions(root: string): InferredConvention[] {
  const conventions: InferredConvention[] = [];
  const tsconfigPath = join(root, 'tsconfig.json');
  try {
    const raw = readFileSync(tsconfigPath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return conventions;
    const co = parsed.compilerOptions;
    if (!isObject(co)) return conventions;

    if (co.strict === true) {
      conventions.push({
        statement: 'TypeScript strict mode is enabled',
        confidence: 1.0,
        evidence: ['tsconfig.json compilerOptions.strict = true'],
      });
    }
    if (co.noUncheckedIndexedAccess === true) {
      conventions.push({
        statement: 'noUncheckedIndexedAccess is enabled (strict indexed access)',
        confidence: 1.0,
        evidence: ['tsconfig.json compilerOptions.noUncheckedIndexedAccess = true'],
      });
    }
    if (co.exactOptionalPropertyTypes === true) {
      conventions.push({
        statement: 'exactOptionalPropertyTypes is enabled (strict optional props)',
        confidence: 1.0,
        evidence: ['tsconfig.json compilerOptions.exactOptionalPropertyTypes = true'],
      });
    }
  } catch {
    // no tsconfig
  }
  return conventions;
}

function inferEslintConventions(root: string): InferredConvention[] {
  const conventions: InferredConvention[] = [];
  const eslintPath = join(root, 'eslint.config.js');
  try {
    const raw = readFileSync(eslintPath, 'utf-8');
    if (raw.includes(ESLINT_CONFIG_SIGNAL.TYPESCRIPT_ESLINT)) {
      conventions.push({
        statement: 'Uses typescript-eslint for TypeScript-aware linting',
        confidence: 0.9,
        evidence: ['eslint.config.js imports typescript-eslint'],
      });
    }
    if (raw.includes(ESLINT_CONFIG_SIGNAL.RECOMMENDED)) {
      conventions.push({
        statement: 'ESLint recommended rules are enabled',
        confidence: 0.9,
        evidence: ['eslint.config.js uses eslint.configs.recommended'],
      });
    }
    if (raw.includes(ESLINT_CONFIG_SIGNAL.STRICT_TYPE_CHECKED)) {
      conventions.push({
        statement: 'typescript-eslint strict type-checked rules are enabled',
        confidence: 0.9,
        evidence: ['eslint.config.js uses tseslint.configs.strictTypeChecked'],
      });
    }
  } catch {
    // no eslint config
  }
  return conventions;
}

export function inferTaste(root: string): InferredConvention[] {
  return [
    ...inferTsconfigConventions(root),
    ...inferEslintConventions(root),
  ];
}
