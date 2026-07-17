import type { Command } from './command.types.js';
import { allCommands } from './commands/index.gen.js';
import { command as decision } from './commands/decision.js';
import { command as packet } from './commands/packet.js';

const FIXTURE_PREFIX = '__';
const FIXTURE_SUFFIX = '__';

function isFixtureName(name: string): boolean {
  return name.startsWith(FIXTURE_PREFIX) && name.endsWith(FIXTURE_SUFFIX);
}

export function commands(): readonly Command[] {
  const base: Command[] = [...allCommands.filter((c) => !isFixtureName(c.name))];
  if (!base.some((c) => c.name === decision.name)) base.push(decision);
  if (!base.some((c) => c.name === packet.name)) base.push(packet);
  return base;
}
