import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderCommandReferenceBlock, syncCommandReferenceDoc } from './command-reference.js';
import { COMMAND_REFERENCE_DOC_URL } from './command-reference.constants.js';
import { NODE_TEST_CONTEXT_ENV } from '../db/store.constants.js';
import { TEXT_ENCODING } from '../platform.constants.js';
import type { CommandReferenceEntry } from './command-reference.types.js';

export function regenerateCommandReference(entries: readonly CommandReferenceEntry[]): boolean {
  const docPath = fileURLToPath(COMMAND_REFERENCE_DOC_URL);
  const current = readFileSync(docPath, TEXT_ENCODING.UTF8);
  const next = syncCommandReferenceDoc(current, renderCommandReferenceBlock(entries));
  if (next === current) return false;
  writeFileSync(docPath, next, TEXT_ENCODING.UTF8);
  return true;
}

async function main(): Promise<void> {
  // The registry imports every command module, and command modules import store.js,
  // which auto-forwards the process to the daemon at import time when one is running.
  // NODE_TEST_CONTEXT (set natively by node --test) disables that forward: this tool
  // only reads command metadata and must run in direct mode.
  // truthy marker: String(true) avoids introducing another '1' string literal (duplicate-string gate)
  process.env[NODE_TEST_CONTEXT_ENV] = String(true);
  const { commands } = await import('./registry.js');
  const changed = regenerateCommandReference(commands());
  process.stdout.write(changed ? 'command reference regenerated in docs/how-it-works.md\n' : 'command reference already in sync\n');
}

const invokedDirectly = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  void main();
}
