import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commands } from './registry.js';

const DIST_DIR = fileURLToPath(new URL('..', import.meta.url));
const COMMANDS_DIST = join(DIST_DIR, 'cli', 'commands');
const GENERATED_COMMAND_FILE = { INDEX: 'index.gen.js', GENERATOR: 'generate-index.js' } as const;

function isCompiledCommandFile(name: string): boolean {
  return name.endsWith('.js')
    && !name.endsWith('.test.js')
    && !name.endsWith('.constants.js')
    && !name.endsWith('.types.js')
    && !name.endsWith('.errors.js')
    && name !== GENERATED_COMMAND_FILE.INDEX
    && name !== GENERATED_COMMAND_FILE.GENERATOR;
}

function isFixtureFileName(name: string): boolean {
  return name.startsWith('__') && name.endsWith('.js');
}

test('the registry discovers commands from the commands directory without a hand-edited list', () => {
  const registered = commands();
  const names = registered.map((c) => c.name);
  assert.ok(names.includes('task'), 'real command "task" should be discovered');
  assert.ok(names.length >= 2, 'registry should discover multiple real commands');
});

test('the production registry excludes test-only fixture commands', () => {
  const registered = commands();
  const names = registered.map((c) => c.name);
  for (const name of names) {
    assert.ok(!(name.startsWith('__') && name.endsWith('__')), `fixture command "${name}" leaked into production registry`);
  }
});

test('every compiled command file under cli/commands is registered', () => {
  const registered = commands();
  const registeredNames = new Set(registered.map((c) => c.name));

  const missing: string[] = [];
  const entries = readdirSync(COMMANDS_DIST, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !isCompiledCommandFile(entry.name)) continue;
    if (isFixtureFileName(entry.name)) continue;
    const cmdName = entry.name.replace(/\.js$/, '');
    if (!registeredNames.has(cmdName)) {
      missing.push(cmdName);
    }
  }

  assert.deepEqual(missing, [], `Commands missing from registry: ${missing.join(', ')}`);
});
