import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { commands } from './registry.js';
import { renderCommandReferenceBlock, syncCommandReferenceDoc } from './command-reference.js';
import { COMMAND_REFERENCE_MARKERS, COMMAND_REFERENCE_DOC_URL } from './command-reference.constants.js';

test('renderCommandReferenceBlock renders one row per command and escapes pipes', () => {
  const block = renderCommandReferenceBlock([{ name: 'task', summary: 'a | b' }]);
  assert.match(block, /^\| Command \| Purpose \|$/m);
  assert.ok(block.includes('| `task` | a \\| b |'), 'cell pipes should be escaped');
});

test('syncCommandReferenceDoc replaces only the marked block and is idempotent', () => {
  const doc = `intro\n${COMMAND_REFERENCE_MARKERS.BEGIN}\nold\n${COMMAND_REFERENCE_MARKERS.END}\noutro\n`;
  const once = syncCommandReferenceDoc(doc, 'NEW');
  assert.equal(once, `intro\n${COMMAND_REFERENCE_MARKERS.BEGIN}\nNEW\n${COMMAND_REFERENCE_MARKERS.END}\noutro\n`);
  assert.equal(syncCommandReferenceDoc(once, 'NEW'), once);
});

test('syncCommandReferenceDoc throws when markers are missing', () => {
  assert.throws(() => syncCommandReferenceDoc('no markers here', 'X'), /markers not found/);
});

test('docs/how-it-works.md command reference is in sync with the CLI registry', () => {
  const doc = readFileSync(fileURLToPath(COMMAND_REFERENCE_DOC_URL), 'utf8');
  const synced = syncCommandReferenceDoc(doc, renderCommandReferenceBlock(commands()));
  assert.equal(synced, doc, 'command reference drifted — regenerate: npx tsx src/cli/generate-command-reference.ts');
});
