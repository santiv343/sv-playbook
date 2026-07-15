import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));
const gates = loadConfig(SRC_DIR).gates;
const GENERATED_SOURCE_FILE = { INDEX: 'index.gen.ts', GENERATOR: 'generate-index.ts' } as const;

function isLogicModule(file: string) {
  return file.endsWith('.ts')
    && !file.endsWith('.test.ts')
    && !file.endsWith('.types.ts')
    && !file.endsWith('.constants.ts')
    && !file.endsWith('.errors.ts')
    && file !== GENERATED_SOURCE_FILE.INDEX
    && file !== GENERATED_SOURCE_FILE.GENERATOR;
}

function isCommandFile(file: string) {
  return file.endsWith('.ts')
    && !file.endsWith('.test.ts')
    && !file.endsWith('.constants.ts')
    && !file.endsWith('.types.ts')
    && !file.endsWith('.errors.ts')
    && file !== GENERATED_SOURCE_FILE.INDEX
    && file !== GENERATED_SOURCE_FILE.GENERATOR;
}

const COMMANDS_REL = join('cli', 'commands') + sep;

function isViolatingLine(line: string): boolean {
  return /^export (interface|type) /.test(line)
    || /^export const /.test(line)
    || /^export class \w+Error extends Error/.test(line)
    || /^const [A-Z_]+ = '(INSERT|SELECT|DELETE|UPDATE|CREATE)/.test(line);
}

function checkFileViolations(path: string, rel: string, isCommand: boolean): string[] {
  const violations: string[] = [];
  const source = readFileSync(path, 'utf8');
  const lines = source.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (isCommand && /^export const command\b/.test(line)) {
      continue;
    }
    if (isViolatingLine(line)) {
      violations.push(`${rel}:${index + 1}`);
    }
  }
  return violations;
}

test('logic modules contain no exported types, constants or error classes', () => {
  if (!gates.layout) {
    return;
  }
  const violations: string[] = [];
  const files = readdirSync(SRC_DIR, { recursive: true, withFileTypes: true });

  for (const file of files) {
    if (!file.isFile() || !isLogicModule(file.name)) {
      continue;
    }
    const path = join(file.parentPath, file.name);
    const rel = relative(SRC_DIR, path);
    const isCommand = rel.startsWith(COMMANDS_REL) && isCommandFile(file.name);
    violations.push(...checkFileViolations(path, rel, isCommand));
  }

  assert.deepEqual(violations, [], violations.join('\n'));
});

test('command files under cli/commands export a command descriptor', () => {
  if (!gates.layout) {
    return;
  }
  const violations: string[] = [];
  const commandsDir = join(SRC_DIR, 'cli', 'commands');
  let entries;
  try {
    entries = readdirSync(commandsDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !isCommandFile(entry.name)) {
      continue;
    }
    const path = join(commandsDir, entry.name);
    const source = readFileSync(path, 'utf8');
    if (!/^export const command\b/m.test(source)) {
      violations.push(`${relative(SRC_DIR, path)}: missing export const command`);
    }
  }

  assert.deepEqual(violations, [], violations.join('\n'));
});
