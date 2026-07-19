import { parseArgs } from 'node:util';
import { eq, asc, and } from 'drizzle-orm';
import { ERROR_PREFIX, EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { commonRoot, openStore } from '../../db/store.js';
import { getCwd } from '../../runtime/context.js';
import { packetDefinitions } from '../../tasks/schema.constants.js';
import type { Store } from '../../db/store.types.js';
import * as s from '../../schema/core.js';
import type { Schema } from '../../schema/core.types.js';

interface Subcommand {
  usage: string;
  run(rest: string[], io: Io): number | Promise<number>;
}

class UsageError extends Error {}

import { BOOLEAN_OPTION, STRING_OPTION } from './options.constants.js';

function withStore<T>(fn: (store: Store) => T): T {
  const repoRoot = commonRoot(getCwd());
  const store = openStore(repoRoot);
  try {
    return fn(store);
  } finally {
    store.close();
  }
}

const permissiveSchema: Schema<unknown> = { parse: (value: unknown) => value };
const DefinitionJsonSchema = s.json(s.record(permissiveSchema));

function parseDefinitionJson(json: string): Record<string, unknown> {
  return DefinitionJsonSchema.parse(json);
}

function handleHistory(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: { json: BOOLEAN_OPTION } });
  const [packetId, extra] = parsed.positionals;
  if (packetId === undefined || extra !== undefined) {
    throw new UsageError('history requires <ID>');
  }
  return withStore((store) => {
    const rows = store.orm
      .select({ version: packetDefinitions.version, definitionDigest: packetDefinitions.definitionDigest, createdAt: packetDefinitions.createdAt })
      .from(packetDefinitions)
      .where(eq(packetDefinitions.packetId, packetId))
      .orderBy(asc(packetDefinitions.version))
      .all();
    if (!rows.length) {
      io.err(`${ERROR_PREFIX}no history for packet: ${packetId}`);
      return EXIT.GATE_FAIL;
    }
    if (parsed.values.json === true) {
      io.out(JSON.stringify(rows));
      return EXIT.OK;
    }
    for (const row of rows) {
      const digest = row.definitionDigest.replace(/^sha256:/, '').slice(0, 8);
      io.out(`v${row.version}\t${row.createdAt}\t${digest}`);
    }
    return EXIT.OK;
  });
}

function handleDiff(args: string[], io: Io): number {
  const parsed = parseArgs({ args, allowPositionals: true, options: { from: STRING_OPTION, to: STRING_OPTION, json: BOOLEAN_OPTION } });
  const [packetId, extra] = parsed.positionals;
  if (packetId === undefined || extra !== undefined) {
    throw new UsageError('diff requires <ID>');
  }
  const fromVersion = parsed.values.from;
  const toVersion = parsed.values.to;
  if (fromVersion === undefined || toVersion === undefined) {
    throw new UsageError('diff requires --from <v> and --to <v>');
  }
  return withStore((store) => {
    const fromRow = store.orm
      .select({ definitionJson: packetDefinitions.definitionJson })
      .from(packetDefinitions)
      .where(and(eq(packetDefinitions.packetId, packetId), eq(packetDefinitions.version, Number(fromVersion))))
      .get();
    const toRow = store.orm
      .select({ definitionJson: packetDefinitions.definitionJson })
      .from(packetDefinitions)
      .where(and(eq(packetDefinitions.packetId, packetId), eq(packetDefinitions.version, Number(toVersion))))
      .get();
    if (fromRow === undefined || toRow === undefined) {
      io.err(`${ERROR_PREFIX}version not found for packet: ${packetId}`);
      return EXIT.GATE_FAIL;
    }
    const fromDef = parseDefinitionJson(fromRow.definitionJson);
    const toDef = parseDefinitionJson(toRow.definitionJson);
    const changedKeys = Object.keys(toDef).filter((key) => JSON.stringify(fromDef[key]) !== JSON.stringify(toDef[key]));
    if (parsed.values.json === true) {
      io.out(JSON.stringify(changedKeys));
      return EXIT.OK;
    }
    if (!changedKeys.length) {
      io.out('no changes');
      return EXIT.OK;
    }
    for (const key of changedKeys) {
      io.out(`${key}:`);
    }
    return EXIT.OK;
  });
}

const SUBCOMMANDS: ReadonlyMap<string, Subcommand> = new Map([
  ['history', { usage: 'sv-playbook packet history <ID> [--json]', run: handleHistory }],
  ['diff', { usage: 'sv-playbook packet diff <ID> --from <v> --to <v> [--json]', run: handleDiff }],
]);

const USAGE = [
  'Usage: sv-playbook packet <subcommand>',
  ...Array.from(SUBCOMMANDS.values()).map((s) => `  ${s.usage}`),
].join('\n');

export const command: Command = {
  name: 'packet',
  summary: 'Inspect packet version history and diffs',
  usage: USAGE,
  run(args, io) {
    try {
      const [sub, ...rest] = args;
      const c = sub === undefined ? undefined : SUBCOMMANDS.get(sub);
      if (c !== undefined) return Promise.resolve(c.run(rest, io));
      throw new UsageError(sub === undefined ? 'missing packet subcommand' : `unknown packet subcommand: ${sub}`);
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
