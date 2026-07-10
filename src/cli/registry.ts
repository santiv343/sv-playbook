import type { Command } from './command.types.js';
import { allCommands } from './commands/index.gen.js';

const FIXTURE_PREFIX = '__';
const FIXTURE_SUFFIX = '__';

function isFixtureName(name: string): boolean {
  return name.startsWith(FIXTURE_PREFIX) && name.endsWith(FIXTURE_SUFFIX);
}

export function commands(): readonly Command[] {
  return allCommands.filter((c) => !isFixtureName(c.name));
}
