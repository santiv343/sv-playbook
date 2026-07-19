import { readFileSync, writeFileSync } from 'node:fs';
import { ERROR_PREFIX, EXIT, USAGE_HEADER } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { PLAYBOOK_CONFIG_FILE_NAME } from '../../config.constants.js';
import { parsePlaybookConfig } from '../../schema/config.constants.js';
import { loadConfig } from '../../config.js';
import { TEXT_ENCODING } from '../../platform.constants.js';
import * as s from '../../schema/core.js';
import { isRecord } from '../../schema/core.js';
import type { Schema } from '../../schema/core.types.js';

interface Subcommand {
  usage: string;
  run(rest: string[], io: Io): number | Promise<number>;
}

class UsageError extends Error {}

const permissiveSchema: Schema<unknown> = { parse: (value: unknown) => value };
const ConfigObjectSchema = s.json(s.record(permissiveSchema));

function configPath(): string {
  return `${commonRoot(getCwd())}/${PLAYBOOK_CONFIG_FILE_NAME}`;
}

function getValue(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function setValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  if (!keys.length) return;
  let current: Record<string, unknown> = obj;
  for (let index = 0; index + 1 < keys.length; index++) {
    const key = keys[index];
    if (key === undefined) return;
    const next = current[key];
    if (!isRecord(next)) {
      const created: Record<string, unknown> = {};
      current[key] = created;
      current = created;
    } else {
      current = next;
    }
  }
  const lastKey = keys[keys.length - 1];
  if (lastKey === undefined) return;
  current[lastKey] = value;
}

function isBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

function parseSetValue(raw: string): unknown {
  let parsed: unknown;
  try {
    parsed = s.parseJson(raw);
  } catch {
    return raw;
  }
  if (parsed === null || isBoolean(parsed) || typeof parsed === 'number') {
    return parsed;
  }
  return raw;
}

function handleGet(args: string[], io: Io): number {
  const [key, extra] = args;
  if (key === undefined || extra !== undefined) throw new UsageError('get requires <key>');
  const config = loadConfig(commonRoot(getCwd()));
  const value = getValue(config, key);
  if (value === undefined) {
    io.err(`${ERROR_PREFIX}key not found: ${key}`);
    return EXIT.GATE_FAIL;
  }
  io.out(JSON.stringify(value));
  return EXIT.OK;
}

function handleSet(args: string[], io: Io): number {
  const [key, rawValue, extra] = args;
  if (key === undefined || rawValue === undefined || extra !== undefined) {
    throw new UsageError('set requires <key> <value>');
  }
  const path = configPath();
  const raw = readFileSync(path, TEXT_ENCODING.UTF8);
  const current = ConfigObjectSchema.parse(raw);
  setValue(current, key, parseSetValue(rawValue));
  try {
    parsePlaybookConfig(JSON.stringify(current));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.err(`${ERROR_PREFIX}invalid config value: ${message}`);
    return EXIT.GATE_FAIL;
  }
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, TEXT_ENCODING.UTF8);
  io.out(`set ${key}`);
  return EXIT.OK;
}

function handleList(_args: string[], io: Io): number {
  const config = loadConfig(commonRoot(getCwd()));
  io.out(JSON.stringify(config, null, 2));
  return EXIT.OK;
}

const SUBCOMMANDS: ReadonlyMap<string, Subcommand> = new Map([
  ['get', { usage: 'sv-playbook config get <key>', run: handleGet }],
  ['set', { usage: 'sv-playbook config set <key> <value>', run: handleSet }],
  ['list', { usage: 'sv-playbook config list', run: handleList }],
]);

const USAGE = [USAGE_HEADER, ...Array.from(SUBCOMMANDS.values()).map((s) => `  ${s.usage}`)].join('\n');

export const command: Command = {
  name: 'config',
  summary: 'Read and write playbook configuration',
  usage: USAGE,
  run(args, io) {
    try {
      const [sub, ...rest] = args;
      const c = sub === undefined ? undefined : SUBCOMMANDS.get(sub);
      if (c !== undefined) return Promise.resolve(c.run(rest, io));
      throw new UsageError(sub === undefined ? 'missing config subcommand' : `unknown config subcommand: ${sub}`);
    } catch (error) {
      if (error instanceof UsageError) {
        io.err(USAGE);
        io.err(`error: ${error.message}`);
        return Promise.resolve(EXIT.USAGE);
      }
      throw error;
    }
  },
};
