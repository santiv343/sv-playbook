import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commands } from './registry.js';

const DIST_DIR = fileURLToPath(new URL('..', import.meta.url));
const COMMANDS_DIST = join(DIST_DIR, 'cli', 'commands');

function isCompiledCommandFile(name: string): boolean {
  return name.endsWith('.js')
    && !name.endsWith('.test.js')
    && !name.endsWith('.constants.js')
    && !name.endsWith('.types.js')
    && !name.endsWith('.errors.js')
    && name !== 'index.gen.js'
    && name !== 'generate-index.js';
}

test('the registry discovers commands from the commands directory without a hand-edited list', () => {
  const registered = commands();
  const names = registered.map((c) => c.name);
  assert.ok(names.includes('__fixture__'), '__fixture__ command should be auto-discovered');
});

test('every compiled command file under cli/commands is registered', () => {
  const registered = commands();
  const registeredNames = new Set(registered.map((c) => c.name));

  const missing: string[] = [];
  const entries = readdirSync(COMMANDS_DIST, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !isCompiledCommandFile(entry.name)) continue;
    const cmdName = entry.name.replace(/\.js$/, '');
    if (!registeredNames.has(cmdName)) {
      missing.push(cmdName);
    }
  }

  assert.deepEqual(missing, [], `Commands missing from registry: ${missing.join(', ')}`);
});
